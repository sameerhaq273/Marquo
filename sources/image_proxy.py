"""Fetches pictures for the browser, so the web UI only ever loads images from our own API.

Browsers often can't load posters and screenshots straight from torrent sites and image
hosts: ad/malware blockers and Safe Browsing block those domains, some hosts refuse
hotlinks, and some networks block them. The server can usually reach them, so it fetches
the picture and hands it over.

Only public http(s) images are fetched: addresses on this machine or the local network are
refused (including through redirects), non-images are refused, and size is capped.
"""
import ipaddress
import socket
import time
from collections import OrderedDict
from urllib.parse import urljoin, urlparse

import requests

from .base import session

MAX_BYTES = 15 * 1024 * 1024
MAX_REDIRECTS = 4
TIMEOUT = 15
CACHE_BYTES = 150 * 1024 * 1024
_cache = OrderedDict()  # url -> (time, content_type, bytes)
_cache_size = 0
CACHE_TTL = 24 * 60 * 60


class ImageError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _check_public(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ImageError("Only http(s) image URLs are allowed.", 400)
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except socket.gaierror:
        raise ImageError(f"Can't find {parsed.hostname}.", 502)
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global:
            raise ImageError("Refusing to fetch a local or private address.", 400)


def fetch_image(url):
    """(content_type, bytes) for a public image URL; cached."""
    global _cache_size
    cached = _cache.get(url)
    if cached and time.time() - cached[0] < CACHE_TTL:
        _cache.move_to_end(url)
        return cached[1], cached[2]

    current = url
    client = session()
    for _ in range(MAX_REDIRECTS + 1):
        _check_public(current)
        parsed = urlparse(current)
        try:
            response = client.get(
                current,
                timeout=TIMEOUT,
                stream=True,
                allow_redirects=False,
                # Many hosts only serve pictures to pages on their own site
                headers={"Referer": f"{parsed.scheme}://{parsed.netloc}/", "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"},
            )
        except requests.RequestException as e:
            raise ImageError(f"Couldn't load the image from {parsed.hostname} ({type(e).__name__}).")
        if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
            current = urljoin(current, response.headers.get("location", ""))
            response.close()
            continue
        break
    else:
        raise ImageError("Too many redirects.")

    if response.status_code != 200:
        response.close()
        raise ImageError(f"{urlparse(current).hostname} answered HTTP {response.status_code}.", 404 if response.status_code == 404 else 502)
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if not content_type.startswith("image/"):
        response.close()
        raise ImageError("That address isn't an image.", 415)

    chunks, total = [], 0
    for chunk in response.iter_content(64 * 1024):
        total += len(chunk)
        if total > MAX_BYTES:
            response.close()
            raise ImageError("Image is too large.", 413)
        chunks.append(chunk)
    data = b"".join(chunks)

    _cache[url] = (time.time(), content_type, data)
    _cache_size += len(data)
    while _cache_size > CACHE_BYTES and _cache:
        _, (_, _, old) = _cache.popitem(last=False)
        _cache_size -= len(old)
    return content_type, data
