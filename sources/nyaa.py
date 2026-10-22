"""Nyaa - anime, and the Asian media around it, scraped from its result table.

Nyaa publishes an RSS feed as well, but reading it needs an XML parser this project does
not carry, and the HTML table holds more anyway: the detail path, the category and the
trust colour of each row all come from it.

Adult material lives on a separate site (sukebei), never on this one, so nothing here
needs the Adult category.
"""
import os
import re
from datetime import datetime, timezone

from .analyze import display_size
from .base import fetch_soup, first_working, host
from .release import parse_release

ID = "nyaa"
NAME = "Nyaa"

BASE_URL = os.getenv("NYAA_BASE_URL", "https://nyaa.si")
FALLBACK_URLS = [u for u in os.getenv("NYAA_FALLBACK_URLS", "https://nyaa.land").split(",") if u]
MIRRORS = [BASE_URL] + FALLBACK_URLS

# Nyaa's own top-level categories. Live Action (4_0) mixes films and series with no way to
# tell them apart, so it is left unmapped rather than filed under the wrong one.
CATEGORIES = {
    "anime": "1_0",
    "music": "2_0",
    "apps": "6_0",
}

DETAIL_PATH = re.compile(r"^/view/\d+$")

# The category code that starts a row's link -> shared type
_KINDS = {"1": "tv", "2": "music", "3": "book", "4": "movie", "5": "other", "6": "app"}

# Each page holds 75 rows
MAX_PAGES = 2


def _attempts(call):
    """[(mirror host, call bound to that mirror)], main site first."""
    return [(host(base), lambda base=base: call(base)) for base in MIRRORS]


def _kind(category_href):
    """"/?c=1_2" -> "tv". Anime is filed as TV, the way 1337x's anime category is."""
    match = re.search(r"c=(\d)_", category_href or "")
    return _KINDS.get(match.group(1), "other") if match else "other"


def search(query, category=None, notes=None):
    """Results from the first MAX_PAGES pages, most seeded first."""
    return first_working(NAME, _attempts(lambda base: _search(base, query, category)), notes) or []


def _search(base, query, category):
    results = []
    for page in range(1, MAX_PAGES + 1):
        rows = _page(base, query, category, page)
        results.extend(rows)
        # A short page is the last one
        if len(rows) < 70:
            break
    return results


def _page(base, query, category, page):
    soup = fetch_soup(f"{base}/?q={query.strip()}&c={category or '0_0'}&s=seeders&o=desc&p={page}", NAME)
    table = soup.find("table", class_=lambda c: c and "torrent-list" in c)
    if not (table and table.tbody):
        return []

    results = []
    for row in table.tbody.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 8:
            continue
        name_link = cells[1].find_all("a")[-1]
        path = name_link.get("href") or ""
        if not DETAIL_PATH.match(path):
            continue
        # The title attribute carries the untruncated name; the cell text may be cut short
        title = name_link.get("title") or name_link.get_text(strip=True)
        magnet = cells[2].find("a", href=lambda h: h and h.startswith("magnet:"))
        category_link = cells[0].find("a")

        stamp = cells[4].get("data-timestamp")
        results.append({
            "kind": _kind(category_link.get("href") if category_link else ""),
            "title": title,
            "year": parse_release(title)["year"],
            "path": path,
            "link": base + path,
            "seeds": cells[5].get_text(strip=True) or "0",
            "leeches": cells[6].get_text(strip=True) or "0",
            # The table prints GiB; display_size converts to the GB the rest of the app uses
            "size": display_size(cells[3].get_text(strip=True)) or "?",
            # The table names no uploader; the detail page does
            "uploader": "?",
            "upload_date": _date(stamp) or cells[4].get_text(strip=True) or "?",
            "magnet": magnet.get("href") if magnet else None,
        })
    return results


def _date(stamp):
    if not stamp:
        return None
    try:
        return datetime.fromtimestamp(int(stamp), timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def get_details(path, notes=None):
    """Raw facts for sources.analyze (see RawDetails there)."""
    return first_working(NAME, _attempts(lambda base: _details(base, path)), notes)


def _details(base, path):
    soup = fetch_soup(base + path, NAME)
    heading = soup.select_one("h3.panel-title")
    if not heading:
        return None
    title = heading.get_text(strip=True)

    # The panel lists its facts as label / value pairs spread across two columns per row
    facts = {}
    for row in soup.select(".panel-body .row"):
        cells = [c.get_text(" ", strip=True) for c in row.select(".col-md-1, .col-md-5, .col-md-2")]
        for label, value in zip(cells[::2], cells[1::2]):
            facts[label.rstrip(":").strip().lower()] = value

    description = soup.select_one("#torrent-description")
    files = [
        {"name": li.get_text(" ", strip=True), "size": None}
        for li in soup.select(".torrent-file-list li")
    ]
    magnet = soup.find("a", href=lambda h: h and h.startswith("magnet:"))
    category = facts.get("category")
    links = [a["href"] for a in soup.select("#torrent-description a[href^='http']")]

    return {
        "title": title,
        "site_category": category,
        "kind": _kind(f"c={_category_code(soup)}_") if _category_code(soup) else None,
        "info": [(label.title(), value) for label, value in facts.items() if label != "info hash"],
        "description": description.get_text("\n", strip=True) if description else "",
        "images": [],
        "links": links,
        "image_links": [],
        "files": files,
        "magnet": magnet.get("href") if magnet else None,
        "info_hash": facts.get("info hash"),
        "seeds": facts.get("seeders"),
        "leeches": facts.get("leechers"),
        "size": display_size(facts.get("file size") or "") or facts.get("file size"),
        "uploader": facts.get("submitter"),
        "uploaded": (facts.get("date") or "").split(" ")[0] or None,
        "imdb": None,
    }


def _category_code(soup):
    """The leading digit of the category link on a detail page, e.g. "1" for Anime."""
    link = soup.select_one(".panel-body a[href*='/?c=']")
    match = re.search(r"c=(\d)_", link.get("href", "")) if link else None
    return match.group(1) if match else None
