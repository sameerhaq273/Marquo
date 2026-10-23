"""The Pirate Bay search.

Main: thepiratebay.org is a JavaScript app; its pages hold no results. The browser
fetches them as JSON from apibay.org, so we call that API directly. Each result carries
its info hash, so the magnet link is built locally (trackers from the site's main.js,
long-dead ones dropped) without a second request.

Backup: piratebay.live serves the classic server-rendered Pirate Bay layout
(/search/<q>/<page>/99/<cat>, /torrent/<id>/). Same torrent ids, so a torrent found on
either one can be opened on the other. It's only used when the main site fails or
returns nothing.

Also lives on the phone, as src/sources/piratebay.ts in the Android app, which is not published.
Same API shape and the same magnet building.
Change one and change the other.
"""
import html
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from bs4 import BeautifulSoup

from .analyze import display_size, format_bytes, parse_size
from .base import ScraperError, _get, fetch_json, fetch_soup, first_working, host, magnet_link
from .release import parse_release

ID = "piratebay"
NAME = "The Pirate Bay"
BASE_URL = os.environ.get("PIRATEBAY_BASE_URL", "https://thepiratebay.org").rstrip("/")
API_URL = os.environ.get("PIRATEBAY_API_URL", "https://apibay.org").rstrip("/")
# Backups with the classic layout, tried only when the main site fails (comma-separated to override)
FALLBACK_URLS = [u.strip().rstrip("/") for u in os.environ.get("PIRATEBAY_FALLBACK_URLS", "https://piratebay.live").split(",") if u.strip()]
HTML_PAGES = 4  # backup search pages to read (30 results each)

# Its own codes; a single sub-code (e.g. "201") returns nothing, so lists or top-level codes only.
# No Documentaries or Anime category.
CATEGORIES = {
    "movies": "201,202,207,209,211",
    "tv": "205,208,212",
    "music": "100",
    "games": "400",
    "apps": "300",
    "other": "600",
    "adult": "500",
}


def _kind(code):
    """Site category code (see print_category() in its main.js) -> shared type."""
    code = int(code or 0)
    if code == 102 or code in (601, 602):  # audio books, e-books, comics
        return "book"
    if code in (203,) or 100 <= code < 200:  # music videos, audio
        return "music"
    if code in (205, 208, 212):
        return "tv"
    if 200 <= code < 300:
        return "other" if code in (206, 299) else "movie"
    return {3: "app", 4: "game", 5: "adult"}.get(code // 100, "other")



NO_RESULTS_HASH = "0" * 40

# Paths are kept in the main site's form whichever mirror found the torrent
DETAIL_PATH = re.compile(r"^/description\.php\?id=\d+$")

# Category names from the site's print_category()
_CATEGORY_NAMES = {
    1: "Audio", 2: "Video", 3: "Applications", 4: "Games", 5: "Porn", 6: "Other",
    101: "Music", 102: "Audio books", 103: "Sound clips", 104: "FLAC", 201: "Movies", 202: "Movies DVDR",
    203: "Music videos", 204: "Movie clips", 205: "TV shows", 206: "Handheld", 207: "HD Movies",
    208: "HD TV shows", 209: "3D", 210: "CAM/TS", 211: "UHD/4k Movies", 212: "UHD/4k TV shows",
    301: "Windows", 302: "Mac/Apple", 303: "UNIX", 304: "Handheld", 305: "iOS", 306: "Android",
    401: "PC", 402: "Mac/Apple", 403: "PSx", 404: "XBOX360", 405: "Wii", 406: "Handheld", 407: "iOS", 408: "Android",
    501: "Movies", 502: "Movies DVDR", 503: "Pictures", 504: "Games", 505: "HD Movies", 506: "Movie clips",
    507: "UHD/4k Movies", 601: "E-books", 602: "Comics", 603: "Pictures", 604: "Covers", 605: "Physibles",
}


def _format_size(size):
    """Bytes -> "3.7 GB": the same units as 1337x (the site itself prints GiB)."""
    return format_bytes(size) or "0 B"


def _real_rows(rows):
    # "No results" comes back as a single placeholder row with an all-zero hash
    return [r for r in rows if r.get("info_hash") != NO_RESULTS_HASH]



def _category_name(code):
    code = int(code or 0)
    top, sub = _CATEGORY_NAMES.get(code // 100), _CATEGORY_NAMES.get(code)
    return f"{top} > {sub}" if top and sub else top or sub


_URL = re.compile(r"https?://[^\s<>\"'()\[\]]+")
_BBCODE_IMAGE_LINK = re.compile(r"\[url=([^\]\s]+)\]\s*\[img\]([^\[\s]+)\[/img\]", re.I)


def _text_links(text):
    """Links in a plain-text description: bare URLs, and BBCode [url=page][img]thumb[/img][/url]."""
    return _URL.findall(text), _BBCODE_IMAGE_LINK.findall(text)


def _first(value):
    """f.php sends each field as a list, but for some torrents as an object ({"0": ...})."""
    if isinstance(value, list):
        return value[0] if value else None
    if isinstance(value, dict):
        return next(iter(value.values()), None)
    return value


def _id_of(path):
    return path.rsplit("=", 1)[-1]


def _attempts(api_call, html_call):
    """Main (apibay JSON) first, then each classic-layout backup."""
    return [(host(API_URL), api_call)] + [(host(base), lambda base=base: html_call(base)) for base in FALLBACK_URLS]


# ------------------------------------------------------------------ public

def search(query, category=None, notes=None):
    """All results (up to ~100). category is a code list like "201,207" or "100"."""
    return first_working(NAME, _attempts(lambda: _search_api(query, category), lambda base: _search_html(base, query, category)), notes) or []


def get_details(path, notes=None):
    """Raw facts for sources.analyze (see RawDetails there)."""
    torrent_id = _id_of(path)
    return first_working(NAME, _attempts(lambda: _details_api(torrent_id), lambda base: _details_html(base, torrent_id)), notes)


# ------------------------------------------------------------------ main: apibay JSON

def _search_api(query, category):
    # Same as the site's make_search(): no category = empty "cat"
    params = {"q": query.strip(), "cat": category or ""}
    rows = _real_rows(fetch_json(f"{API_URL}/q.php", NAME, params=params))
    if not rows:
        # Cloudflare in front of apibay sometimes serves a stale cached "No results" for a URL;
        # a one-off extra param skips that cache entry
        rows = _real_rows(fetch_json(f"{API_URL}/q.php", NAME, params={**params, "_": str(int(time.time()))}))

    return [_row_to_result(row) for row in rows]


def _row_to_result(row):
    name = html.unescape(row['name'])  # apibay sends names HTML-escaped (&amp;)
    path = f"/description.php?id={row['id']}"
    added = int(row.get("added") or 0)
    return {
        'kind': _kind(row.get('category')),
        'title': name,
        # Read off the release name so the year filter has something to work with
        'year': parse_release(name)['year'],
        'path': path,
        'link': BASE_URL + path,
        # apibay types these as ints in its precompiled top-100 files and as strings
        # elsewhere; the API contract is a string either way
        'seeds': str(row.get('seeders', '0')),
        'leeches': str(row.get('leechers', '0')),
        'size': _format_size(int(row.get('size') or 0)),
        'uploader': row.get('username') or '?',
        'upload_date': datetime.fromtimestamp(added, timezone.utc).strftime("%Y-%m-%d") if added else "?",
        'magnet': magnet_link(row['info_hash'], name),
    }


def _details_api(torrent_id):
    """The same JSON calls the site's own page makes (t.php for details, f.php for files)."""
    row = fetch_json(f"{API_URL}/t.php", NAME, params={"id": torrent_id})
    if not row or not row.get("name") or row.get("info_hash") in (None, NO_RESULTS_HASH):
        return None
    try:
        file_rows = fetch_json(f"{API_URL}/f.php", NAME, params={"id": torrent_id})
    except ScraperError:
        file_rows = []
    files = []
    for f in file_rows if isinstance(file_rows, list) else []:
        name, size = _first(f.get("name")), _first(f.get("size"))
        if name and name != "Filelist not found":  # apibay's placeholder when it has no list
            files.append({"name": str(name), "size": int(size) if str(size or "").isdigit() else None})

    name = html.unescape(row["name"])
    description = html.unescape(row.get("descr") or "")
    added = int(row.get("added") or 0)
    imdb = row.get("imdb") or None
    images = re.findall(r"https?://\S+?\.(?:jpe?g|png|webp|gif)", description, re.I)
    links, image_links = _text_links(description)
    return {
        "link": f"{BASE_URL}/description.php?id={torrent_id}",
        "title": name,
        "site_category": _category_name(row.get("category")),
        "kind": _kind(row.get("category")),
        "info": [("Category", _category_name(row.get("category")) or ""), ("Status", row.get("status") or "")],
        "description": description,
        "images": images,
        "links": links + ([f"https://www.imdb.com/title/{imdb}/"] if imdb else []),
        "image_links": image_links,
        "files": files,
        "magnet": magnet_link(row["info_hash"], name),
        "info_hash": row.get("info_hash"),
        "seeds": str(row.get("seeders") or 0),
        "leeches": str(row.get("leechers") or 0),
        "size": _format_size(int(row.get("size") or 0)),
        "uploader": row.get("username"),
        "uploaded": datetime.fromtimestamp(added, timezone.utc).strftime("%Y-%m-%d") if added else None,
        "imdb": imdb,
    }


# ------------------------------------------------------------------ backup: classic HTML layout

def _html_date(text):
    """Classic listing dates: "10-06 11:31" (this year), "03-14 2021", "Today 12:00", "Y-day 08:15"."""
    text = text.replace("\xa0", " ").strip()
    now = datetime.now(timezone.utc)
    if text.lower().startswith("today") or "min" in text.lower():
        return now.strftime("%Y-%m-%d")
    if text.lower().startswith("y-day"):
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    match = re.match(r"(\d{2})-(\d{2})\s+(\d{4}|\d{2}:\d{2})", text)
    if match:
        year = match.group(3) if len(match.group(3)) == 4 else str(now.year)
        return f"{year}-{match.group(1)}-{match.group(2)}"
    return text or "?"


def _search_html_page(base, query, page, top_code):
    soup = fetch_soup(f"{base}/search/{quote(query.strip())}/{page}/99/{top_code}", NAME)
    return _html_rows(soup, base)


def _html_rows(soup, base):
    """The result table of the classic layout, the same on search and top-100 pages."""
    results = []
    for row in soup.select("#searchResult tr"):
        link = row.select_one("a.detLink")
        magnet = row.find("a", href=re.compile(r"^magnet:"))
        id_match = re.search(r"/torrent/(\d+)", link.get("href", "")) if link else None
        if not (link and magnet and id_match):
            continue  # header / pagination rows
        codes = [int(m) for a in row.select("td.vertTh a[href*='/browse/']") for m in re.findall(r"/browse/(\d+)", a["href"])]
        code = codes[-1] if codes else 0
        desc = row.select_one("font.detDesc")
        desc_text = desc.get_text(" ", strip=True).replace("\xa0", " ") if desc else ""
        size = re.search(r"Size ([\d.]+ \w+)", desc_text)
        uploaded = re.search(r"Uploaded (.+?), Size", desc_text)
        by = re.search(r"ULed by (.+)$", desc_text)
        numbers = [td.get_text(strip=True) for td in row.find_all("td", align="right")]
        torrent_id = id_match.group(1)
        results.append({
            'kind': _kind(code),
            'category_code': code,
            'title': link.get_text(strip=True),
            'year': parse_release(link.get_text(strip=True))['year'],
            'path': f"/description.php?id={torrent_id}",
            'link': f"{base}/torrent/{torrent_id}/",
            'seeds': numbers[0] if numbers else "0",
            'leeches': numbers[1] if len(numbers) > 1 else "0",
            'size': display_size(size.group(1)) if size else "?",
            'uploader': by.group(1).strip() if by else "?",
            'upload_date': _html_date(uploaded.group(1)) if uploaded else "?",
            'magnet': magnet["href"],
        })
    return results


def _search_html(base, query, category):
    # The classic URL takes one category; use the top-level one and keep only the wanted sub-codes
    codes = [int(c) for c in (category or "").split(",") if c]
    tops = {c // 100 * 100 for c in codes}
    top_code = tops.pop() if len(tops) == 1 else 0

    results = _search_html_page(base, query, 1, top_code)
    if len(results) >= 30:  # a full page: read a few more
        with ThreadPoolExecutor(max_workers=HTML_PAGES - 1) as pool:
            for page_results in pool.map(lambda p: _search_html_page(base, query, p, top_code), range(2, HTML_PAGES + 1)):
                results.extend(page_results)
    if codes:
        results = [r for r in results if r["category_code"] in codes or r["category_code"] // 100 * 100 in codes]
    for r in results:
        r.pop("category_code", None)
    return results


def _details_html(base, torrent_id):
    page = fetch_soup(f"{base}/torrent/{torrent_id}/", NAME)
    title_el = page.select_one("#title")
    if not title_el:
        return None
    name = title_el.get_text(strip=True)
    info = []
    code = 0
    imdb = None
    for dl in page.select("#details dl"):
        for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
            label = dt.get_text(strip=True).rstrip(":")
            value = dd.get_text(" ", strip=True).replace("\xa0", " ")
            browse = dd.find("a", href=re.compile(r"/browse/\d+"))
            if browse:
                code = int(re.findall(r"/browse/(\d+)", browse["href"])[-1])
            imdb_link = dd.find("a", href=re.compile(r"imdb\.com/title/tt\d+"))
            if imdb_link:
                imdb = re.search(r"tt\d+", imdb_link["href"]).group(0)
            if value:
                info.append((label, value))
    values = dict(info)
    nfo = page.select_one(".nfo pre") or page.select_one(".nfo")
    description = nfo.get_text("\n", strip=True) if nfo else ""
    magnet = page.find("a", href=re.compile(r"^magnet:"))
    info_hash = re.search(r"btih:([0-9A-Fa-f]{40})", magnet["href"]).group(1).upper() if magnet else None

    files = []
    try:
        # What the page's own "Files" link loads
        listing = BeautifulSoup(_get(f"{base}/ajax_details_filelist.php?id={torrent_id}", NAME).content, "html.parser")
        for tr in listing.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) >= 2:
                files.append({"name": cells[0].get_text(strip=True), "size": parse_size(cells[1].get_text(" ", strip=True).replace("\xa0", " "))})
    except ScraperError:
        pass

    size = re.match(r"[\d.]+ \w+", values.get("Size", ""))
    links, image_links = _text_links(description)
    if nfo:
        links += [a["href"] for a in nfo.find_all("a", href=True)]
        image_links += [(a["href"], a.img.get("src")) for a in nfo.find_all("a", href=True) if a.img]
    return {
        "link": f"{base}/torrent/{torrent_id}/",
        "title": name,
        "site_category": values.get("Type") or _category_name(code),
        "kind": _kind(code),
        "info": info,
        "description": description,
        "images": [img.get("src") for img in nfo.find_all("img")] if nfo else [],
        "links": links + ([f"https://www.imdb.com/title/{imdb}/"] if imdb else []),
        "image_links": image_links,
        "files": files,
        "magnet": magnet["href"] if magnet else None,
        "info_hash": info_hash,
        "seeds": values.get("Seeders"),
        "leeches": values.get("Leechers"),
        "size": display_size(size.group(0) if size else values.get("Size")),
        "uploader": values.get("By"),
        "uploaded": (values.get("Uploaded") or "")[:10] or None,
        "imdb": imdb,
    }
