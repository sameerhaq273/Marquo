"""Magnet link -> downloadable .torrent file, through magnet2torrent.com.

Mirrors what the site's own page does:
  POST /upload/index.php  (magnet=...)  -> the .torrent file right away (known torrent), or
                                          {"gid": ...} while it fetches the metadata from peers
  POST /upload/status.php (gid=...)     -> {"status": "active"} while still working, any other
                                          status = failed, or the .torrent file when done
Finished files are kept in memory briefly and handed to the browser as a download.
"""
import re
import secrets
import time
from collections import OrderedDict

import requests

from .base import ScraperError, session

SITE = "https://magnet2torrent.com"
_HEADERS = {"Referer": f"{SITE}/", "Origin": SITE}
MAGNET = re.compile(r"^magnet:\?xt=urn:btih:[0-9A-Za-z]{32,40}(&|$)")
GID = re.compile(r"^[0-9A-Za-z]{4,64}$")
FILE_TTL = 10 * 60
_files = OrderedDict()  # token -> (time, filename, bytes)


def _post(path, data):
    try:
        return session().post(f"{SITE}{path}", data=data, headers=_HEADERS, timeout=60)
    except requests.RequestException as e:
        raise ScraperError(f"Couldn't reach magnet2torrent.com ({type(e).__name__})") from e


def _filename(response):
    disposition = response.headers.get("content-disposition", "")
    match = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", disposition)
    name = match.group(1).strip() if match else "Magnet2Torrent_com.torrent"
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name)  # safe on every OS
    return name if name.lower().endswith(".torrent") else f"{name}.torrent"


def _keep(response):
    token = secrets.token_urlsafe(16)
    _files[token] = (time.time(), _filename(response), response.content)
    while len(_files) > 50 or (_files and time.time() - next(iter(_files.values()))[0] > FILE_TTL):
        _files.popitem(last=False)
    return {"status": "ready", "token": token, "filename": _files[token][1]}


def _read(response):
    """A finished file, a pending gid, or a failure, whichever the site answered."""
    if response.status_code != 200:
        raise ScraperError(f"magnet2torrent.com answered HTTP {response.status_code}", response.status_code)
    content_type = response.headers.get("content-type", "")
    if "json" in content_type:
        try:
            data = response.json()
        except ValueError:
            data = {}
        if data.get("gid"):
            return {"status": "pending", "gid": str(data["gid"])}
        if data.get("status") == "active":
            return {"status": "pending"}
        return {"status": "failed", "error": "magnet2torrent.com couldn't get this torrent. Few or no peers may be sharing it."}
    if response.content[:1] == b"d":  # a bencoded .torrent starts with a dictionary
        return _keep(response)
    return {"status": "failed", "error": "magnet2torrent.com sent something that isn't a .torrent file."}


def start(magnet):
    if not MAGNET.match(magnet or "") or len(magnet) > 8192:
        raise ValueError("That isn't a magnet link.")
    return _read(_post("/upload/index.php", {"magnet": magnet}))


def status(gid):
    if not GID.match(gid or ""):
        raise ValueError("Invalid conversion id.")
    result = _read(_post("/upload/status.php", {"gid": gid}))
    return {**result, "gid": gid} if result["status"] == "pending" else result


def take(token):
    """(filename, bytes) for a finished conversion, or None."""
    entry = _files.get(token or "")
    if not entry or time.time() - entry[0] > FILE_TTL:
        return None
    return entry[1], entry[2]
