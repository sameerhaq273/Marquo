"""1337x: server-rendered HTML. Search pages list 20 results each; the magnet
link is only on each torrent's detail page, so it's fetched on demand.

Mirrors share the same layout and torrent ids, so every call takes the mirror's base
URL and the public functions try the main site first, then the backups.

Also lives on the phone, as src/sources/x1337.ts in the marquo-mobile repository.
Same selectors and the same mirror list; a layout change breaks both at once.
Change one and change the other.
"""
import os
import re
from concurrent.futures import ThreadPoolExecutor

from .base import ScraperError, fetch_soup, first_working, host
from .analyze import imdb_id, parse_size, poster_for_imdb
from .release import parse_print, parse_release, parse_resolution

ID = "1337x"
NAME = "1337x"
BASE_URL = os.environ.get("SCRAPER_BASE_URL", "https://1337x.la").rstrip("/")  # Main site
# Backups, tried only when the main site fails or returns nothing (comma-separated to override)
FALLBACK_URLS = [u.strip().rstrip("/") for u in os.environ.get("SCRAPER_FALLBACK_URLS", "https://www.1337xx.to").split(",") if u.strip()]
MIRRORS = [BASE_URL] + [u for u in FALLBACK_URLS if u != BASE_URL]
MAX_PAGES = 5  # search() collects up to this many pages (20 results each)

CATEGORIES = {
    "movies": "Movies",
    "tv": "TV",
    "music": "Music",
    "games": "Games",
    "apps": "Apps",
    "documentaries": "Documentaries",
    "anime": "Anime",
    "other": "Other",
    "adult": "XXX",
}

DETAIL_PATH = re.compile(r"^/torrent/\d+/[^/?#\s]+/?$")

# Row icon links look like /sub/<category>/<subcategory>/1/
_KINDS = {
    "movies": "movie",
    "documentaries": "movie",
    "tv": "tv",
    "anime": "tv",  # mostly series
    "games": "game",
    "apps": "app",
    "music": "music",
    "xxx": "adult",
}
_BOOK_SUBCATEGORIES = {"e-books", "audiobook", "comics"}

# Print words too generic to trust when found in free-text descriptions
_LOOSE_PRINTS = {"WEB", "Telesync", "Screener", "CAM", "DVD"}


def _fetch(url):
    return fetch_soup(url, NAME)


def _kind(row):
    icon = row.select_one("td.name a.icon")
    parts = (icon.get("href", "") if icon else "").strip("/").split("/")
    if len(parts) < 3 or parts[0] != "sub":
        return "other"
    category, subcategory = parts[1].lower(), parts[2].lower()
    if category == "other" and subcategory in _BOOK_SUBCATEGORIES:
        return "book"
    return _KINDS.get(category, "other")


def get_search_results(query, page=1):
    return search_page(query, page)[0]


def _attempts(call):
    """[(mirror host, call bound to that mirror)], main site first."""
    return [(host(base), lambda base=base: call(base)) for base in MIRRORS]


def search(query, category=None, max_pages=MAX_PAGES, notes=None):
    """All results from the first max_pages pages. category is a 1337x name like "Movies".

    1337x matches ANY of the words and ranks by seeders, so a multi-word query buries
    the titles that have them all. Searching its longest word instead returns 5-13x more
    of those; the server then keeps only titles containing every word."""
    words = query.split()
    if len(words) > 1:
        query = max(words, key=len)
    return first_working(NAME, _attempts(lambda base: _search_mirror(base, query, category, max_pages)), notes) or []


def _search_mirror(base, query, category, max_pages):
    results, has_next = search_page(query, 1, category, base)
    if has_next and max_pages > 1:
        pages = range(2, max_pages + 1)
        with ThreadPoolExecutor(max_workers=len(pages)) as pool:
            # Pages past the last one just come back empty
            for page_results, _ in pool.map(lambda p: search_page(query, p, category, base), pages):
                results.extend(page_results)
    return results


def search_page(query, page=1, category=None, base=BASE_URL):
    """Returns (results, has_next) for one page of search results."""
    query = query.strip().replace(" ", "+")
    if category:
        soup = _fetch(f"{base}/category-search/{query}/{category}/{page}/")
    else:
        soup = _fetch(f"{base}/search/{query}/{page}/")
    return _parse_table(soup, page, base)


def _parse_table(soup, page, base):
    """The torrent table, the same on search, category and top-100 pages."""
    table = soup.find('table', class_='table-list')
    if not table:
        # 1337x renders a plain "No results were returned" box instead of a table
        return [], False

    pagination = soup.find('div', class_='pagination')
    has_next = bool(pagination and pagination.find('a', href=lambda h: h and h.rstrip('/').endswith(f"/{page + 1}")))

    results = []
    rows = table.find_all('tr')[1:]  # Skip header row
    for row in rows:
        try:
            title_td = row.find('td', class_='coll-1 name')
            link_tag = title_td.find_all('a')[-1]
            title = link_tag.text.strip()
            detail_href = link_tag['href']

            seeds = row.find('td', class_='coll-2 seeds').text.strip()
            leeches = row.find('td', class_='coll-3 leeches').text.strip()
            size_td = row.find('td', class_=lambda c: c and 'coll-4' in c and 'size' in c)
            # Size cell also contains a hidden seeds <span>; drop it
            if size_td and size_td.span:
                size_td.span.decompose()
            size = size_td.get_text(strip=True) if size_td else "?"

            uploader_td = row.find('td', class_='coll-5')
            uploader = uploader_td.text.strip() if uploader_td else "?"

            date_td = row.find('td', class_='coll-date')
            upload_date = " ".join(date_td.text.split()) if date_td else "?"

            results.append({
                'kind': _kind(row),
                'title': title,
                # Read off the release name so the year filter has something to work with
                'year': parse_release(title)['year'],
                'path': detail_href,
                'link': base + detail_href,
                'seeds': seeds,
                'leeches': leeches,
                'size': size,
                'uploader': uploader,
                'upload_date': upload_date
            })
        except Exception:
            continue
    # One unreadable row is an odd row. Every row unreadable is the table's shape having
    # changed, and swallowing that showed the user "nothing found" for a site that had
    # answered with a full page. Failing here lets a backup mirror be tried and puts a
    # real message on screen instead.
    if rows and not results:
        raise ScraperError(f"{host(base)}: the results table has {len(rows)} rows but none could be read")
    return results, has_next


def get_magnet(path, notes=None):
    def from_mirror(base):
        soup = _fetch(base + path)
        magnet = soup.find('a', href=lambda x: x and x.startswith('magnet:?'))
        return magnet['href'] if magnet else None
    return first_working(NAME, _attempts(from_mirror), notes)


def featured(movies=12, tv=12, notes=None):
    """Home page picks: the featured movie slider (posters) and the most popular
    TV torrents, one per show. Detail pages fill in poster, size, seeds and magnet.
    (The server saves the result for the day; see server.featured.)"""
    return first_working(NAME, _attempts(lambda base: _featured_from(base, movies, tv)), notes) or []


def _featured_from(base, movies, tv):
    home = _fetch(f"{base}/home/")
    picks = [("movie", a["href"]) for a in home.select("div.banner-box.movie ul.slider a[href^='/torrent/']")[:movies]]

    tv_box = next(
        (box for box in home.select("div.featured-list")
         if box.find(class_="featured-heading") and "Popular TV" in box.find(class_="featured-heading").get_text()),
        None,
    )
    # The home list is often several episodes of the same couple of shows, so keep
    # reading the longer popular lists until there are enough different shows
    tv_lists = [lambda: tv_box, lambda: _fetch(f"{base}/popular-tv"), lambda: _fetch(f"{base}/popular-tv-week")]
    shows = set()
    for get_list in tv_lists:
        if len(shows) >= tv:
            break
        try:
            listing = get_list()
        except ScraperError:
            continue
        for a in listing.select("td.name a[href^='/torrent/']") if listing else []:
            show = parse_release(a.get_text(strip=True))["title"].lower()
            if show not in shows:
                shows.add(show)
                picks.append(("tv", a["href"]))
            if len(shows) >= tv:
                break

    with ThreadPoolExecutor(max_workers=max(1, len(picks))) as pool:
        return [item for item in pool.map(lambda p: _featured_item(base, *p), picks) if item]


def _absolute_image(src, base=BASE_URL):
    if not src:
        return None
    if src.startswith("//"):
        src = "https:" + src
    elif src.startswith("/"):
        src = base + src
    if "image.tmdb.org" in src:
        # Full-size TMDB originals are huge; w500 is plenty for a card
        src = src.replace("http://", "https://").replace("/t/p/original/", "/t/p/w500/")
    return src


def _featured_item(base, kind, path):
    try:
        page = _fetch(base + path)
    except ScraperError:
        return None
    name = page.find("h1").get_text(strip=True) if page.find("h1") else path
    info = {
        li.strong.get_text(strip=True): li.span.get_text(" ", strip=True)
        for li in page.select("ul.list li") if li.strong and li.span
    }
    description = page.find(id="description")
    description_text = description.get_text(" ", strip=True)[:3000] if description else ""

    # 1. A TMDB image from the description: usually the poster, and sharp (w500)
    # 2. The site's own poster: right image but only 123x182
    # 3. Whatever the uploader put first in the description (often a wide banner)
    description_images = [
        img.get("data-original") or img.get("src") for img in (description.find_all("img") if description else [])
    ]
    tmdb = next((src for src in description_images if src and "image.tmdb.org/t/p/" in src), None)
    poster = page.select_one(".torrent-image img")
    links = [a["href"] for a in description.find_all("a", href=True)] if description else []
    imdb = imdb_id({"links": links}, description_text)
    # Best first; the UI falls back along the list: TMDB poster, IMDb poster (proper portrait
    # even for TV, where uploaders post banners), the site's small poster, then any image
    candidates = [tmdb, poster_for_imdb(imdb), poster.get("src") if poster else None, next((src for src in description_images if src), None)]
    images = list(dict.fromkeys(_absolute_image(c, base) for c in candidates if c))

    print_ = parse_print(name)
    if not print_:
        found = parse_print(description_text)
        print_ = found if found not in _LOOSE_PRINTS else None
    magnet = page.find("a", href=lambda h: h and h.startswith("magnet:?"))
    release = parse_release(name)
    return {
        'kind': kind,
        'title': release["title"],
        'year': release["year"],
        'episode': release["episode"],
        'release': name,
        'print': print_,
        'resolution': parse_resolution(name) or parse_resolution(description_text),
        'image': images[0] if images else None,
        'images': images,
        'size': info.get("Total size", "?"),
        'seeds': info.get("Seeders", "0"),
        'leeches': info.get("Leechers", "0"),
        'path': path,
        'link': base + path,
        'magnet': magnet["href"] if magnet else None,
    }


def get_details(path, notes=None):
    """Raw detail-page facts for sources.analyze (see RawDetails there), from the main
    site or, if that fails / has no such torrent, a backup mirror."""
    return first_working(NAME, _attempts(lambda base: _details_from(base, path)), notes)


def _details_from(base, path):
    """Skips the page's ad blocks and mirror buttons; keeps only the torrent's own content."""
    page = _fetch(base + path)
    title = page.find("h1").get_text(strip=True) if page.find("h1") else path
    info = [
        (li.strong.get_text(strip=True), li.span.get_text(" ", strip=True))
        for li in page.select(".torrent-detail-page ul.list li") if li.strong and li.span
    ]
    values = dict(info)

    description = page.find(id="description")
    images, links, image_links = [], [], []
    poster = page.select_one(".torrent-image img")
    if poster:
        images.append(_absolute_image(poster.get("src"), base))
    if description:
        images += [_absolute_image(img.get("data-original") or img.get("src"), base) for img in description.find_all("img")]
        links = [a.get("href") for a in description.find_all("a", href=True)]
        # Thumbnails that link to the full picture on an image host
        image_links = [
            (a["href"], _absolute_image(a.img.get("data-original") or a.img.get("src"), base))
            for a in description.find_all("a", href=True) if a.img
        ]

    files = []
    for li in page.select("#files li"):
        if li.find("ul"):  # folder: its files are listed in the nested <ul>
            continue
        text = li.get_text(" ", strip=True)
        match = re.match(r"^(.*?)\s*\(([\d.,]+\s*[KMGT]?i?B)\)\s*$", text)
        folder = [
            parent.find(text=True, recursive=False) for parent in li.find_parents("li")
        ]
        prefix = "/".join(f.strip() for f in reversed(folder) if f and f.strip())
        name = match.group(1) if match else text
        files.append({"name": f"{prefix}/{name}" if prefix else name, "size": parse_size(match.group(2)) if match else None})

    magnet = page.find("a", href=lambda h: h and h.startswith("magnet:?"))
    infohash = page.select_one(".infohash-box span") or page.select_one(".infohash-box")
    category = values.get("Category")
    sub_type = values.get("Type")
    kind = _KINDS.get((category or "").lower(), "other")
    if (category or "").lower() == "other" and (sub_type or "").lower() in _BOOK_SUBCATEGORIES:
        kind = "book"
    return {
        "link": base + path,
        "title": title,
        "site_category": " > ".join(x for x in (category, sub_type) if x) or None,
        "kind": kind,
        "info": info,
        "description": description.get_text("\n", strip=True) if description else "",
        "images": [i for i in images if i],
        "links": links,
        "image_links": image_links,
        "files": files,
        "magnet": magnet["href"] if magnet else None,
        "info_hash": re.sub(r"^.*?:\s*", "", infohash.get_text(" ", strip=True)) if infohash else None,
        "seeds": values.get("Seeders"),
        "leeches": values.get("Leechers"),
        "size": values.get("Total size"),
        "uploader": values.get("Uploaded By"),
        "uploaded": values.get("Date uploaded"),
        "imdb": None,
    }
