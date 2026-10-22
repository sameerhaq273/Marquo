from urllib.parse import quote, urlparse

import cloudscraper
import requests
from bs4 import BeautifulSoup


class ScraperError(Exception):
    """Raised when a site can't be scraped (blocked, layout changed, network, bad status)."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status  # HTTP status when the site answered with an error code


def session():
    # cloudscraper = requests + Cloudflare's basic JS challenge
    return cloudscraper.create_scraper()


def host(url):
    return urlparse(url).netloc or url


def _get(url, site_name, params=None):
    try:
        response = session().get(url, params=params, timeout=30)
    except requests.exceptions.Timeout as e:
        raise ScraperError(f"{host(url)} timed out") from e
    except requests.exceptions.ConnectionError as e:
        raise ScraperError(f"couldn't connect to {host(url)}") from e
    except Exception as e:
        raise ScraperError(f"{host(url)}: {type(e).__name__}") from e
    if not 200 <= response.status_code < 300:
        # 404 for a missing torrent, 403/503 for blocks, 5xx for outages: all count as "didn't work"
        raise ScraperError(f"{host(url)} answered HTTP {response.status_code}", response.status_code)
    return response


def fetch_soup(url, site_name):
    response = _get(url, site_name)
    # Raw bytes: BeautifulSoup reads the page's own <meta charset>, whereas response.text
    # falls back to ISO-8859-1 and garbles names like "Pérez"
    soup = BeautifulSoup(response.content, 'html.parser')

    title = soup.title.text if soup.title else ""
    if "Just a moment" in title or "Access denied" in title:
        raise ScraperError(f"Cloudflare is blocking {host(url)}", 403)
    return soup


def fetch_json(url, site_name, params=None):
    response = _get(url, site_name, params)
    try:
        return response.json()
    except ValueError as e:
        raise ScraperError(f"{host(url)} sent something other than JSON") from e


def first_working(site_name, attempts, notes=None):
    """Try a site's mirrors in order and return the first useful answer.

    attempts: [(label, callable)], main site first. A backup is only tried when the one
    before it failed (error, block, unexpected HTTP status) or came back empty (no results,
    no such torrent, no magnet). When a backup answers, a line saying so is added to notes.
    Returns None when every mirror answered but none had anything; raises ScraperError
    when none of them worked at all."""
    problems = []
    answered = False
    for i, (label, call) in enumerate(attempts):
        try:
            result = call()
        except ScraperError as e:
            problems.append(str(e))
            answered = answered or e.status == 404  # "no such page" is an answer, not an outage
            continue
        except Exception as e:  # an answer we couldn't read (changed layout, odd JSON): try the next mirror
            problems.append(f"{label} sent something unexpected ({type(e).__name__})")
            continue
        if result:
            if i > 0 and notes is not None:
                notes.append(f"{site_name}: the main site didn't work ({problems[0]}), so this came from backup {label}.")
            return result
        answered = True
        problems.append(f"{label} found nothing")
    if answered:
        return None
    raise ScraperError("main site and backups all failed: " + "; ".join(problems) if len(attempts) > 1 else problems[0])


#: Public trackers added to every magnet link built here. Taken from the main.js of
#: a site that publishes its own list; long-dead ones dropped.
TRACKERS = [
    "udp://tracker.opentrackr.org:1337",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.bittor.pw:1337/announce",
    "udp://public.popcorn-tracker.org:6969/announce",
    "udp://tracker.dler.org:6969/announce",
    "udp://exodus.desync.com:6969",
    "udp://open.demonii.com:1337/announce",
]


def magnet_link(info_hash, name):
    """A magnet URI from an info hash. No indexer is involved: a magnet is the hash,
    a display name and a tracker list, so it is built here rather than fetched."""
    trackers = "".join(f"&tr={quote(t, safe='')}" for t in TRACKERS)
    return f"magnet:?xt=urn:btih:{info_hash}&dn={quote(name, safe='')}{trackers}"
