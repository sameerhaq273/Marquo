"""Small JSON API around the torrent site scrapers in sources/ for the React UI.

Run:  python server.py          (live sites)
      python server.py --mock   (demo data, no network)
"""
import hashlib
import json
import os
import threading
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from collections import OrderedDict
from datetime import date
from itertools import chain, zip_longest
from urllib.parse import quote

from flask import Flask, Response, jsonify, request

from sources import BY_ID, CATEGORIES, SITES, ScraperError
from sources.analyze import analyze
from sources.compat import from_details, from_name
from sources.dates import format_date
from sources.image_proxy import ImageError, fetch_image
from sources.images import resolve_screenshots
from sources.matching import matches_all_words
from sources.base import magnet_link
from sources import torrent_file

MOCK = os.environ.get("SCRAPER_MOCK") == "1" or "--mock" in sys.argv

app = Flask(__name__)

# Home screen cards are fetched once a day and saved here; reloads read the file.
# DATA_DIR moves it off the code directory, which several hosts mount read-only.
DATA_DIR = os.getenv("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
FEATURED_FILE = os.path.join(DATA_DIR, "featured.json")

# Browsers block a cross-origin call unless the server names the caller, and the frontend
# is served from somewhere else once this is deployed. Only the origins listed here are
# allowed; with none set, nothing cross-origin is, which is what localhost wants (the dev
# server proxies /api, so it is same-origin there).
ALLOWED_ORIGINS = {o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()}


@app.after_request
def allow_known_origins(response):
    origin = (request.headers.get("Origin") or "").rstrip("/")
    if origin and origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Max-Age"] = "86400"
    return response


@app.route("/healthz")
def healthz():
    """For a host's health check, and to wake a service that sleeps when idle."""
    return jsonify(ok=True, sources=[site.ID for site in SITES])
_featured_lock = threading.Lock()
FEATURED_RETRY = 30 * 60  # after a failed daily refresh, wait this long before trying again
_featured_failed_at = [0.0]

DETAILS_TTL = 10 * 60  # seconds
COMPAT_TTL = 24 * 60 * 60  # a torrent's audio doesn't change
COMPAT_MAX = 5000  # ratings are tiny, but the cache still has to stop somewhere
_compat_cache = OrderedDict()  # (source, path) -> (time, rating from details)
_details_cache = OrderedDict()  # (source, path) -> (time, analysis); small LRU


@app.get("/api/config")
def config():
    sources = [{"id": site.ID, "name": site.NAME, "url": site.BASE_URL} for site in SITES]
    categories = [
        {"id": cid, "label": label, "sources": [site.ID for site in SITES if cid in site.CATEGORIES]}
        for cid, label in CATEGORIES.items()
    ]
    return jsonify(sources=sources, categories=categories, mock=MOCK)


@app.get("/api/search")
def search():
    """Searches every requested site in parallel and merges the results."""
    query = request.args.get("q", "").strip()
    source_ids = [s for s in request.args.get("sources", ",".join(BY_ID)).split(",") if s]
    category = request.args.get("category", "")
    if not query:
        return jsonify(error="Enter a torrent name to search."), 400
    if not source_ids or any(s not in BY_ID for s in source_ids):
        return jsonify(error="Pick at least one valid source."), 400
    if category and category not in CATEGORIES:
        return jsonify(error="Unknown category."), 400

    warnings = []
    jobs = []
    for sid in source_ids:
        site = BY_ID[sid]
        if category and category not in site.CATEGORIES:
            warnings.append(f"{site.NAME} has no {CATEGORIES[category]} category, so it wasn't searched.")
            continue
        jobs.append((site, site.CATEGORIES.get(category)))
    if not jobs:
        return jsonify(results=[], warnings=warnings)

    notes = []  # sites add a line here when a backup mirror had to answer

    def run(job):
        site, site_category = job
        try:
            results = _mock_search(site, query) if MOCK else site.search(query, site_category, notes=notes)
            # Keep only titles containing every search word, whatever the site's own matching does
            return [_with_compat({
                # One date format for every site ("Jun 17, 2026")
                **r, "source": site.ID, "upload_date": format_date(r.get("upload_date")),
            }) for r in results if matches_all_words(r["title"], query)], None
        except ScraperError as e:
            return [], f"{site.NAME}: {e}"

    with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
        outcomes = list(pool.map(run, jobs))

    errors = [err for _, err in outcomes if err]
    if len(errors) == len(outcomes):
        return jsonify(error=" ".join(errors)), 502
    warnings.extend(notes + errors)

    # Interleave by rank so "best match" order doesn't bury one site under another
    lists = [results for results, _ in outcomes]
    merged = [r for r in chain.from_iterable(zip_longest(*lists)) if r is not None]
    return jsonify(results=merged, warnings=warnings)


@app.get("/api/featured")
def featured():
    """Home screen cards from every site that offers them (sites define featured())."""
    if MOCK:
        return jsonify(items=_mock_featured())
    today = date.today().isoformat()
    with _featured_lock:  # one fetch even if several reloads arrive together
        saved = _read_featured()
        if saved and saved.get("date") == today:
            return jsonify(items=saved["items"], notices=saved.get("notices", []), date=today)
        if saved and time.time() - _featured_failed_at[0] < FEATURED_RETRY:
            note = f"Showing the picks saved on {format_date(saved.get('date'))}; today's refresh failed, trying again later."
            return jsonify(items=saved["items"], notices=[note], date=saved.get("date"))

        items, errors, notes = [], [], []
        for site in SITES:
            if not hasattr(site, "featured"):
                continue
            try:
                items += [
                    {**item, "source": site.ID, "compat": from_name(item.get("release") or "", item.get("kind"), item.get("size"))[0]}
                    for item in site.featured(notes=notes)
                ]
            except ScraperError as e:
                errors.append(f"{site.NAME}: {e}")

        if items:
            _write_featured({"date": today, "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"), "items": items, "notices": notes})
            return jsonify(items=items, notices=notes, date=today)
        _featured_failed_at[0] = time.time()
        if saved:
            # Couldn't refresh today: keep showing the last saved picks
            note = f"Showing the picks saved on {format_date(saved.get('date'))}; today's refresh failed ({' '.join(errors) or 'nothing found'})."
            return jsonify(items=saved["items"], notices=[note], date=saved.get("date"))
        return jsonify(error=" ".join(errors) or "No featured torrents found."), 502


def _read_featured():
    try:
        with open(FEATURED_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_featured(data):
    os.makedirs(os.path.dirname(FEATURED_FILE), exist_ok=True)
    temp = FEATURED_FILE + ".tmp"
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(temp, FEATURED_FILE)  # never leave a half-written file behind


@app.get("/api/details")
def details():
    """A torrent's detail content, read from its own site and analyzed the same way for every site."""
    site = BY_ID.get(request.args.get("source", ""))
    path = request.args.get("path", "")
    if not site or not hasattr(site, "get_details"):
        return jsonify(error="This source has no detail pages."), 400
    if not (MOCK and path.startswith("/mock/")) and not site.DETAIL_PATH.match(path):
        return jsonify(error="Invalid torrent path."), 400

    key = (site.ID, path)
    cached = _details_cache.get(key)
    if cached and time.time() - cached[0] < DETAILS_TTL:
        _details_cache.move_to_end(key)
        return jsonify(cached[1])
    notes = []
    try:
        raw = _mock_details(site, path) if MOCK else site.get_details(path, notes=notes)
    except ScraperError as e:
        return jsonify(error=str(e)), 502
    if not raw:
        return jsonify(error="Torrent not found on the site or its backups."), 404

    analysis = analyze(raw)
    if not MOCK:
        # Open image-host pages linked from the description to show the real screenshots
        analysis["screenshots"] = resolve_screenshots(raw, analysis["screenshots"], analysis["poster"])
    result = {
        **analysis,
        "source": site.ID,
        "path": path,
        # The page on whichever mirror answered
        "link": raw.get("link") or site.BASE_URL + path,
        "notices": notes,
        "compat": from_details(raw, analysis),
    }
    _details_cache[key] = (time.time(), result)
    _compat_cache[key] = (time.time(), result["compat"])
    while len(_details_cache) > 200:
        _details_cache.popitem(last=False)
    while len(_compat_cache) > COMPAT_MAX:  # this writer used to let it grow forever
        _compat_cache.popitem(last=False)
    return jsonify(result)


@app.get("/api/compat")
def compat():
    """Smart-TV rating from a torrent's details, for search rows whose name doesn't say
    what the audio is. Like /api/details but without screenshot fetching, and cached."""
    site = BY_ID.get(request.args.get("source", ""))
    path = request.args.get("path", "")
    if not site or not hasattr(site, "get_details"):
        return jsonify(error="This source has no detail pages."), 400
    if not (MOCK and path.startswith("/mock/")) and not site.DETAIL_PATH.match(path):
        return jsonify(error="Invalid torrent path."), 400

    key = (site.ID, path)
    cached = _compat_cache.get(key)
    if cached and time.time() - cached[0] < COMPAT_TTL:
        return jsonify(compat=cached[1], checked=True)
    try:
        raw = _mock_details(site, path) if MOCK else site.get_details(path, notes=[])
    except ScraperError as e:
        return jsonify(error=str(e)), 502
    if not raw:
        return jsonify(error="Torrent not found."), 404
    rating = from_details(raw, analyze(raw))
    _compat_cache[key] = (time.time(), rating)
    while len(_compat_cache) > COMPAT_MAX:
        _compat_cache.popitem(last=False)
    return jsonify(compat=rating, checked=True)


def _with_compat(result):
    """Search row + its TV rating from the name; needs_details asks the UI to check the details."""
    rating, needs_details = from_name(result["title"], result.get("kind"), result.get("size"))
    cached = _compat_cache.get((result["source"], result["path"]))
    if cached and time.time() - cached[0] < COMPAT_TTL:
        return {**result, "compat": cached[1], "compat_needs_details": False}
    return {**result, "compat": rating, "compat_needs_details": needs_details}


@app.post("/api/torrent-file")
def torrent_file_start():
    """Start turning a magnet link into a .torrent file (via magnet2torrent.com)."""
    magnet = (request.get_json(silent=True) or {}).get("magnet", "")
    try:
        return jsonify(torrent_file.start(magnet))
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except ScraperError as e:
        return jsonify(error=str(e)), 502


@app.get("/api/torrent-file/status")
def torrent_file_status():
    """Poll a conversion that's still fetching metadata from peers."""
    try:
        return jsonify(torrent_file.status(request.args.get("gid", "")))
    except ValueError as e:
        return jsonify(error=str(e)), 400
    except ScraperError as e:
        return jsonify(error=str(e)), 502


@app.get("/api/torrent-file/download/<token>")
def torrent_file_download(token):
    """Hand a finished .torrent file to the browser as a download."""
    found = torrent_file.take(token)
    if not found:
        return jsonify(error="That file has expired. Download it again."), 404
    filename, data = found
    ascii_name = filename.encode("ascii", "replace").decode().replace("?", "_")
    return Response(
        data,
        content_type="application/x-bittorrent",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"},
    )


@app.get("/api/image")
def image():
    """Posters and screenshots, fetched by the server so the browser never has to reach
    torrent sites or image hosts itself (blockers, hotlink rules and network blocks)."""
    url = request.args.get("url", "")
    try:
        content_type, data = fetch_image(url)
    except ImageError as e:
        return jsonify(error=str(e)), e.status
    return Response(data, content_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/magnet")
def magnet():
    """For sites whose results don't include a magnet (it's on the detail page)."""
    site = BY_ID.get(request.args.get("source", ""))
    path = request.args.get("path", "")
    if not site or not hasattr(site, "get_magnet"):
        return jsonify(error="This source has no magnet lookup."), 400
    # Only the site's own detail pages (no arbitrary URLs)
    if not site.DETAIL_PATH.match(path):
        return jsonify(error="Invalid torrent path."), 400

    try:
        link = site.get_magnet(path, notes=[])
    except ScraperError as e:
        return jsonify(error=str(e)), 502
    if not link:
        return jsonify(error="Magnet link not found."), 404
    return jsonify(magnet=link)


# --- Demo data (--mock) ------------------------------------------------------

_MOCK_ROWS = [
    ("Ubuntu 24.04.1 LTS Desktop amd64", "app", "5.7 GB", 1843, 96, "canonical", "Aug. 29th '24"),
    ("Ubuntu 24.10 Server amd64", "app", "2.6 GB", 612, 31, "canonical", "Oct. 10th '24"),
    ("Ubuntu 22.04.5 LTS Desktop amd64", "app", "4.4 GB", 977, 44, "canonical", "Sep. 12th '24"),
    ("Kubuntu 24.04 LTS amd64", "app", "4.1 GB", 233, 12, "kubuntu", "Apr. 25th '24"),
    ("Xubuntu 24.04 LTS amd64", "app", "3.9 GB", 151, 7, "xubuntu", "Apr. 25th '24"),
    ("Debian 12.7.0 amd64 DVD-1", "app", "3.7 GB", 702, 28, "debian-cd", "Aug. 31st '24"),
    ("Debian 12.7.0 amd64 netinst", "app", "631 MB", 455, 9, "debian-cd", "Aug. 31st '24"),
    ("Fedora Workstation 41 x86_64", "app", "2.3 GB", 538, 22, "fedora", "Oct. 29th '24"),
    ("Linux Mint 22 Cinnamon 64-bit", "app", "2.8 GB", 891, 40, "linuxmint", "Jul. 25th '24"),
    ("Arch Linux 2024.10.01 x86_64", "app", "1.1 GB", 364, 15, "archlinux", "Oct. 1st '24"),
    ("Big Buck Bunny 2008 1080p BluRay 60fps", "movie", "355.9 MB", 128, 4, "blender", "Jun. 2nd '14"),
    ("Sintel 2010 2160p WEB-DL Open Movie", "movie", "1.4 GB", 87, 3, "blender", "Sep. 27th '10"),
    ("Tears of Steel 2012 2160p WEBRip Open Movie", "movie", "6.3 GB", 46, 2, "blender", "Sep. 26th '12"),
    ("Blender 4.2 LTS Windows x64", "app", "345 MB", 210, 6, "blender", "Jul. 16th '24"),
    ("Wikipedia English Offline (ZIM) 2024-01", "book", "102.0 GB", 19, 37, "kiwix", "Jan. 22nd '24"),
    ("Debian 9.13 i386 CD-1 (archived)", "app", "650 MB", 0, 1, "debian-cd", "Jul. 18th '20"),
]


def _mock_search(site, query):
    time.sleep(0.6)  # feel like a network call
    words = query.lower().split()
    # "all" returns every demo row; rows are dealt out across the sites
    rows = [
        (i, r) for i, r in enumerate(_MOCK_ROWS)
        if SITES[i % len(SITES)] is site and (words == ["all"] or all(w in r[0].lower() for w in words))
    ]
    results = []
    for i, (title, kind, size, seeds, leeches, uploader, date) in rows:
        path = f"/mock/{6000000 + i}"
        results.append({
            'kind': kind,
            'title': title,
            'path': path,
            'link': site.BASE_URL + path,
            'seeds': str(seeds),
            'leeches': str(leeches),
            'size': size,
            'uploader': uploader,
            'upload_date': date,
            'magnet': magnet_link(hashlib.sha1(path.encode()).hexdigest().upper(), title),
        })
    return results


def _mock_details(site, path):
    index = int(path.rsplit("/", 1)[-1]) % 1000000 % len(_MOCK_ROWS)
    title, kind, size, seeds, leeches, uploader, date = _MOCK_ROWS[index]
    return {
        "title": title, "site_category": None, "kind": kind, "info": [], "images": [], "links": [],
        "description": "\n".join([title, "", "Demo data from server.py --mock.", "Video Codec: HEVC", "Audio: AAC 2.0", "Language: English"]),
        "files": [{"name": f"{title}.mkv", "size": 1_500_000_000}, {"name": "README.txt", "size": 900}],
        "magnet": magnet_link(hashlib.sha1(path.encode()).hexdigest().upper(), title), "info_hash": None,
        "seeds": str(seeds), "leeches": str(leeches), "size": size, "uploader": uploader, "uploaded": date, "imdb": None,
    }


def _mock_featured():
    from sources.release import parse_print, parse_release, parse_resolution
    rows = [r for r in _MOCK_ROWS if r[1] == "movie"]
    rows = (rows * 3)[:8]  # fill the grid
    items = []
    for i, (title, kind, size, seeds, leeches, _, _) in enumerate(rows):
        release = parse_release(title)
        items.append({
            'source': SITES[0].ID, 'kind': "movie" if i < 4 else "tv", 'title': release["title"],
            'year': release["year"], 'episode': None if i < 4 else f"S01E0{i - 3}", 'release': title,
            'print': parse_print(title), 'resolution': parse_resolution(title), 'image': None,
            'size': size, 'seeds': str(seeds), 'leeches': str(leeches), 'path': f"/mock/{7000000 + i}",
            'link': SITES[0].BASE_URL, 'magnet': magnet_link(hashlib.sha1(title.encode()).hexdigest().upper(), title),
        })
    return items


if __name__ == "__main__":
    print(f" * Sources: {', '.join(site.BASE_URL for site in SITES)}{'  (MOCK MODE)' if MOCK else ''}")
    # A host passes the port to bind in PORT, and needs 0.0.0.0 rather than loopback.
    # In production the Dockerfile runs gunicorn against `server:app` instead of this.
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "127.0.0.1")
    app.run(host=host, port=port, debug=os.getenv("FLASK_DEBUG", "1") == "1", use_reloader=False)
