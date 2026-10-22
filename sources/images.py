"""Turns links to image-host pages into the images themselves, for any site.

Uploaders rarely embed full screenshots; they link to pages on hosts like pixhost,
imgbox, ibb, trafficimage or imagetwist, often wrapped around a small thumbnail.
Each candidate page is opened once and the real image read from it, mostly from its
og:image tag (the host's own "this page's picture"), otherwise the page's main <img>.
"""
import re
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .base import session

MAX_PAGES = 12  # image pages opened per torrent
TIMEOUT = 10
CACHE_TTL = 6 * 60 * 60
_cache = OrderedDict()  # page URL -> (time, image URL or None)

# Hosts whose name says "images"; plus any link that wraps a thumbnail counts
_IMAGE_HOST = re.compile(r"img|image|pic|photo|pix|screen|shot|snap|imgur|ibb\.co|postimg|fastpic|imagetwist", re.I)
# Reference / download sites that are never picture pages
_NOT_IMAGE_PAGES = re.compile(
    r"imdb|themoviedb|thetvdb|tvmaze|yts|t\.me|telegram|youtube|youtu\.be|torrent|1337x|piratebay|steampowered|gog\.com|"
    r"discogs|musicbrainz|goodreads|myanimelist|anilist|rottentomatoes|trakt|wikipedia|facebook|twitter|x\.com|"
    r"instagram|reddit|patreon|discord|github|mega\.nz|drive\.google|pastebin|paste",
    re.I,
)
_DIRECT_IMAGE = re.compile(r"\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)", re.I)
_JUNK = re.compile(r"logo|favicon|sprite|banner|avatar|icon|blank|spacer|placeholder|loading", re.I)


def _is_candidate(url, wraps_thumbnail):
    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https") or _NOT_IMAGE_PAGES.search(parsed.netloc):
        return False
    return wraps_thumbnail or bool(_IMAGE_HOST.search(parsed.netloc))


def _resolve(page_url):
    """The picture behind an image-host page, or None."""
    cached = _cache.get(page_url)
    if cached and time.time() - cached[0] < CACHE_TTL:
        return cached[1]
    image = None
    try:
        response = session().get(page_url, timeout=TIMEOUT)
        if response.ok:
            if response.headers.get("content-type", "").startswith("image/"):
                image = page_url  # the link was already the picture
            else:
                image = _image_on_page(BeautifulSoup(response.content, "html.parser"), response.url)
    except (requests.RequestException, ValueError):
        image = None
    _cache[page_url] = (time.time(), image)
    while len(_cache) > 2000:
        _cache.popitem(last=False)
    return image


def _image_on_page(page, base_url):
    found = []
    for selector, attr in (
        ("meta[property='og:image']", "content"),
        ("meta[name='twitter:image']", "content"),
        ("link[rel='image_src']", "href"),
        ("img#image, img#img, img#main-image, img#show_image, img.pic, img.main-image, img.image-viewer, img#imgpreview", "src"),
    ):
        found += [el.get(attr) for el in page.select(selector) if el.get(attr)]
    # Last resort: the first big-looking <img> that isn't site chrome
    found += [
        img.get("src") for img in page.find_all("img", src=True)
        if _DIRECT_IMAGE.search(img["src"]) and not re.search(r"thumb|_t\.", img["src"], re.I)
    ][:3]
    for src in found:
        absolute = urljoin(base_url, src.strip())
        if absolute.startswith("http") and not _JUNK.search(urlparse(absolute).path):
            return absolute
    return None


def resolve_screenshots(raw, screenshots, poster=None):
    """Screenshots for the details dialog: images linked from the description are fetched
    from their host pages; a resolved full image replaces the thumbnail it was wrapped around.

    raw["image_links"]: [(page URL, thumbnail URL or None)] from <a><img></a> in the description
    raw["links"]:       every other URL in the description
    """
    wrapped = list(raw.get("image_links") or [])
    thumbs_by_page = {page: thumb for page, thumb in wrapped}
    pages = [page for page, _ in wrapped if _is_candidate(page, True)]
    pages += [url for url in raw.get("links") or [] if url not in thumbs_by_page and _is_candidate(url, False)]
    pages = list(OrderedDict.fromkeys(p for p in pages if not _DIRECT_IMAGE.search(urlparse(p).path)))[:MAX_PAGES]

    resolved = {}
    if pages:
        with ThreadPoolExecutor(max_workers=min(8, len(pages))) as pool:
            resolved = dict(zip(pages, pool.map(_resolve, pages)))

    replaced = {thumbs_by_page[p] for p, image in resolved.items() if image and thumbs_by_page.get(p)}
    full_images = [image for image in resolved.values() if image]
    # Links straight to a picture file need no page visit
    linked_files = [
        url for url in [p for p, _ in wrapped] + list(raw.get("links") or [])
        if _DIRECT_IMAGE.search(urlparse(url).path) and not _NOT_IMAGE_PAGES.search(urlparse(url).netloc)
    ]
    full_images += linked_files
    others = [s for s in screenshots if s not in replaced]
    result = list(OrderedDict.fromkeys(i for i in full_images + others if i and i != poster))
    return result[:24]
