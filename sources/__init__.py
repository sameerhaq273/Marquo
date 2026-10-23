"""Torrent sites the app can search. One module per site.

Each site module defines:
    ID, NAME, BASE_URL
    CATEGORIES        {shared category id: the site's own value}; leave out ones it lacks
    search(query, category=None) -> list of result dicts:
        kind, title, path, link, seeds, leeches, size, uploader, upload_date, and optionally magnet
        kind is one of KINDS: the site's own category mapped to a shared type
    DETAIL_PATH       regex that a result's path must match (guards the detail/magnet calls)
    get_details(path) -> RawDetails dict (see sources/analyze.py): the raw facts from the
        torrent's own detail page or API, skipping ads; analyze() does the rest
    If results carry no magnet, also:
        get_magnet(path) -> magnet link or None
    Optional, for the home screen cards:
        featured() -> list of dicts: kind ("movie" | "tv"), title, year, episode, release,
            print, resolution, image, size, seeds, leeches, path, link, magnet

Nothing in this file names a site. Modules are found by looking for that contract, and
which of them an install actually searches comes from its own configuration, so the list
is the operator's choice rather than this repository's.

To add a site, either drop a module into this package, or point MARQUO_INDEXER_DIR at a
directory of your own and leave this package alone. To change which ones are searched,
write indexers.json (see indexers.example.json). The API and the web UI follow.
"""
import importlib
import importlib.util
import json
import os
import pkgutil
from pathlib import Path

from .base import ScraperError

#: Where an install declares which indexers it wants. Not committed: it is a local choice.
#: Resolved against the project directory, not the working one - a relative name meant the
#: file was silently ignored whenever the server was started from somewhere else.
_PROJECT_DIR = Path(__file__).resolve().parent.parent
INDEXERS_PATH = Path(os.getenv("MARQUO_INDEXERS") or _PROJECT_DIR / "indexers.json")

#: Extra directories of indexer modules, ';'-separated, outside this package entirely.
INDEXER_DIR = os.getenv("MARQUO_INDEXER_DIR", "")

#: What makes a module an indexer rather than one of the helpers next to it
_CONTRACT = ("ID", "NAME", "BASE_URL", "CATEGORIES", "DETAIL_PATH", "search", "get_details")


def _is_indexer(module):
    return all(hasattr(module, attr) for attr in _CONTRACT)


def read_config():
    """The install's indexer configuration, or an empty one when there isn't any.

    A missing or unreadable file is not an error: no configuration means "use whatever
    is bundled", which is what a fresh clone should do.
    """
    try:
        config = json.loads(INDEXERS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return config if isinstance(config, dict) else {}


def _plugin_dirs(config):
    raw = list(config.get("pluginDirs") or [])
    raw += [d for d in INDEXER_DIR.split(";") if d.strip()]
    return [Path(d).expanduser() for d in raw]


def _load_file(path):
    """Import a single indexer module from a path outside this package."""
    spec = importlib.util.spec_from_file_location(f"marquo_indexer_{path.stem}", path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_indexers(config=None):
    """Every indexer available to this install, keyed by ID.

    Bundled modules first, then plugin directories, so an operator can replace a bundled
    indexer by shipping one with the same ID.
    """
    config = read_config() if config is None else config
    found = {}

    for info in pkgutil.iter_modules(__path__):
        if info.name.startswith("_"):
            continue
        try:
            module = importlib.import_module(f"{__name__}.{info.name}")
        except Exception:  # a broken or half-written module must not take the app down
            continue
        if _is_indexer(module):
            found[module.ID] = module

    for directory in _plugin_dirs(config):
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.py")):
            if path.name.startswith("_"):
                continue
            try:
                module = _load_file(path)
            except Exception:
                continue
            if module is not None and _is_indexer(module):
                found[module.ID] = module

    return found


def _select(available, config):
    """Which indexers to search, in which order.

    `enabled` in the configuration decides both. Without it, everything available, in a
    stable order so two runs of the same install behave the same way.
    """
    wanted = config.get("enabled")
    if not isinstance(wanted, list) or not wanted:
        return [available[key] for key in sorted(available)]
    return [available[key] for key in wanted if key in available]


_CONFIG = read_config()
AVAILABLE = load_indexers(_CONFIG)
SITES = _select(AVAILABLE, _CONFIG)

BY_ID = {site.ID: site for site in SITES}

# Shared result types; the UI shows an icon for each
KINDS = ("movie", "tv", "game", "app", "book", "music", "adult", "other")

# Shared categories shown in the UI filter, in display order
CATEGORIES = {
    "movies": "Movies",
    "tv": "TV",
    "music": "Music",
    "games": "Games",
    "apps": "Apps",
    "documentaries": "Documentaries",
    "anime": "Anime",
    "other": "Other",
    "adult": "Adult (18+)",
}

__all__ = ["AVAILABLE", "SITES", "BY_ID", "CATEGORIES", "KINDS", "ScraperError", "load_indexers", "read_config"]
