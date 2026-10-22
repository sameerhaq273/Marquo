"""YTS - curated movie releases, through the site's own public JSON API.

Movies only, and every film is published in several qualities at once. Each quality is a
torrent of its own here, because that is the choice someone is actually making: one row
per movie would hide the 2160p behind the 720p.

The API is documented and stable, so there is no HTML parsing anywhere in this module.
`yts.mx` is the name the site uses, but plenty of networks do not resolve it, so the main
address here is `yts.lt`, which serves the identical API.
"""
import os
import re
from urllib.parse import quote

from .analyze import format_bytes
from .base import ScraperError, fetch_json, first_working, host
from .release import parse_release

ID = "yts"
NAME = "YTS"

# yts.lt redirects to yts.gg, which is the host that actually serves the API. yts.rs answers
# HTTP 200 but not with the API's own payload, so it is not useful as a mirror and is left out.
BASE_URL = os.getenv("YTS_BASE_URL", "https://yts.lt")
FALLBACK_URLS = [u for u in os.getenv("YTS_FALLBACK_URLS", "https://yts.am").split(",") if u]
MIRRORS = [BASE_URL] + FALLBACK_URLS

# YTS publishes films and nothing else, so the other shared categories are left out and the
# server tells the user this site was skipped when one of them is picked.
CATEGORIES = {"movies": "movies"}

# /movies/<id>/<info hash>: the id finds the film, the hash picks which quality of it
DETAIL_PATH = re.compile(r"^/movies/\d+/[0-9A-Fa-f]{40}$")

# The site's own announce list
TRACKERS = [
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:80",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://torrent.gresille.org:80/announce",
    "udp://p4p.arenabg.com:1337",
    "udp://tracker.leechers-paradise.org:6969",
]

# One request is plenty: the API caps a page at 50 and a query rarely has more
LIMIT = 50


def _attempts(call):
    """[(mirror host, call bound to that mirror)], main site first."""
    return [(host(base), lambda base=base: call(base)) for base in MIRRORS]


def _api(base, path, params=None):
    data = fetch_json(f"{base}/api/v2/{path}", NAME, params=params)
    if not isinstance(data, dict) or data.get("status") != "ok":
        raise ScraperError(f"{host(base)} answered {(data or {}).get('status_message', 'something unexpected')}")
    return data.get("data") or {}


def magnet_link(info_hash, name):
    trackers = "".join(f"&tr={quote(t, safe='')}" for t in TRACKERS)
    return f"magnet:?xt=urn:btih:{info_hash}&dn={quote(name, safe='')}{trackers}"


def _release_name(movie, torrent):
    """A release-style name, close to what YTS calls its own files.

    The quality and source matter to whoever is choosing, and the shared word filter on the
    server runs over this, so the words people search for have to be in here.
    """
    parts = [movie.get("title_long") or movie.get("title") or "", torrent.get("quality") or ""]
    kind = (torrent.get("type") or "").upper()
    if kind:
        parts.append({"BLURAY": "BluRay", "WEB": "WEB-DL"}.get(kind, kind))
    if torrent.get("video_codec"):
        parts.append(torrent["video_codec"])
    parts.append("[YTS]")
    return " ".join(p for p in parts if p)


def search(query, category=None, notes=None):
    """Every quality of every matching film, newest first. category is ignored: YTS is movies."""
    return first_working(NAME, _attempts(lambda base: _search(base, query)), notes) or []


def _search(base, query):
    data = _api(base, "list_movies.json", {"query_term": query.strip(), "limit": LIMIT})
    results = []
    for movie in data.get("movies") or []:
        for torrent in movie.get("torrents") or []:
            info_hash = (torrent.get("hash") or "").upper()
            if not info_hash:
                continue
            name = _release_name(movie, torrent)
            path = f"/movies/{movie['id']}/{info_hash}"
            results.append({
                "kind": "movie",
                "title": name,
                # Straight from the API rather than read off the name, which is better than
                # the parser can do
                "year": str(movie["year"]) if movie.get("year") else parse_release(name)["year"],
                "path": path,
                "link": movie.get("url") or f"{base}/movies/{movie.get('slug', '')}",
                "seeds": str(torrent.get("seeds") or 0),
                "leeches": str(torrent.get("peers") or 0),
                "size": format_bytes(torrent.get("size_bytes") or 0) or (torrent.get("size") or "?"),
                # Every release here is the site's own encode; there are no other uploaders
                "uploader": "YTS",
                "upload_date": (torrent.get("date_uploaded") or "").split(" ")[0] or "?",
                "magnet": magnet_link(info_hash, name),
            })
    return results


def get_details(path, notes=None):
    """Raw facts for sources.analyze (see RawDetails there)."""
    movie_id, info_hash = path.strip("/").split("/")[1:3]
    return first_working(NAME, _attempts(lambda base: _details(base, movie_id, info_hash.upper())), notes)


def _details(base, movie_id, info_hash):
    data = _api(base, "movie_details.json", {"movie_id": movie_id, "with_cast": "true"})
    movie = data.get("movie") or {}
    if not movie.get("id"):
        return None

    torrent = next((t for t in movie.get("torrents") or [] if (t.get("hash") or "").upper() == info_hash), None)
    if not torrent:
        return None

    name = _release_name(movie, torrent)
    runtime = movie.get("runtime")
    info = [
        ("Year", str(movie["year"]) if movie.get("year") else ""),
        ("Genre", ", ".join(movie.get("genres") or [])),
        ("Rating", f"{movie['rating']}/10" if movie.get("rating") else ""),
        ("Runtime", f"{runtime} min" if runtime else ""),
        ("Language", movie.get("language") or ""),
        ("Certification", movie.get("mpa_rating") or ""),
        ("Quality", torrent.get("quality") or ""),
        ("Source", torrent.get("type") or ""),
        ("Video codec", torrent.get("video_codec") or ""),
        ("Audio", torrent.get("audio_channels") or ""),
    ]
    posters = [movie.get("large_cover_image"), movie.get("medium_cover_image"), movie.get("background_image_original")]
    imdb = movie.get("imdb_code")
    return {
        "title": name,
        "site_category": "Movies",
        "kind": "movie",
        "info": [(label, value) for label, value in info if value],
        "description": movie.get("description_full") or movie.get("synopsis") or "",
        "images": [p for p in posters if p],
        "links": [f"https://www.imdb.com/title/{imdb}/"] if imdb else [],
        "image_links": [],
        # The API lists no file names; analyze() handles an empty list
        "files": [],
        "magnet": magnet_link(info_hash, name),
        "info_hash": info_hash,
        "seeds": str(torrent.get("seeds") or 0),
        "leeches": str(torrent.get("peers") or 0),
        "size": format_bytes(torrent.get("size_bytes") or 0) or torrent.get("size"),
        "uploader": "YTS",
        "uploaded": (torrent.get("date_uploaded") or "").split(" ")[0] or None,
        "imdb": imdb,
    }
