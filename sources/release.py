"""Reads common details out of scene-style release names, e.g.
"Sunny Dancer 2026 1080p WEB-DL HEVC x265 5.1 BONE".

Also lives on the phone, as src/lib/release.ts in the marquo-mobile repository.
The regexes are kept identical so a release name reads the same on both.
Change one and change the other.
"""
import re

# Checked in order, so the more specific spellings win (WEB-DL before plain WEB, HDCAM before CAM)
_PRINTS = [
    ("Remux", r"remux"),
    ("BluRay", r"blu-?ray|bdrip|brrip|bd25|bd50"),
    ("WEB-DL", r"web-?dl"),
    ("WEBRip", r"web-?rip"),
    ("HDTV", r"hdtv"),
    ("HDRip", r"hdrip"),
    ("DVDRip", r"dvd-?rip"),
    ("DVD", r"dvd(?:5|9|r)?"),
    ("HDCAM", r"hd-?cam"),
    ("CAM", r"cam(?:rip)?"),
    ("Telesync", r"hd-?ts|telesync|ts"),
    ("Screener", r"dvdscr|screener|scr"),
    ("WEB", r"web"),
]
_PRINT_RES = [(label, re.compile(rf"(?<![a-z0-9])(?:{pattern})(?![a-z0-9])", re.I)) for label, pattern in _PRINTS]
_RESOLUTION = re.compile(r"(?<![a-z0-9])(2160p|4k|uhd|1440p|1080p|720p|576p|480p)(?![a-z0-9])", re.I)
_EPISODE = re.compile(r"(?<![a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})(?![0-9])|(?<![a-z0-9])s(\d{1,2})(?![a-z0-9])", re.I)
_YEAR = re.compile(r"(?<![0-9])(19[2-9]\d|20\d\d)(?![0-9])")


def parse_print(text):
    """"WEB-DL", "BluRay", ... or None."""
    for label, pattern in _PRINT_RES:
        if pattern.search(text or ""):
            return label
    return None


def parse_resolution(text):
    match = _RESOLUTION.search(text or "")
    if not match:
        return None
    res = match.group(1).lower()
    return "2160p" if res in ("4k", "uhd") else res


def parse_release(name):
    """{"title", "year", "episode"} from a release name. Title is everything before the
    year / SxxEyy marker, with dots and underscores turned into spaces."""
    text = re.sub(r"[._]+", " ", name)
    text = re.sub(r"\[[^\]]*\]", " ", text)  # [QxR], [Uzerus]
    episode = _EPISODE.search(text)
    # Details start at the first episode / resolution / print marker; the year is the last
    # year-like number before that ("Blade Runner 2049 (2017) 1080p" -> 2017)
    markers = [m.start() for m in (episode, _RESOLUTION.search(text)) if m]
    markers += [m.start() for _, pattern in _PRINT_RES if (m := pattern.search(text))]
    details_at = min(markers or [len(text)])
    years = [m for m in _YEAR.finditer(text) if m.start() < details_at and m.start() > 0]
    year = years[-1] if years else None

    cut = min([m.start() for m in (episode, year) if m] or [len(text)])
    title = re.sub(r"[\s(\-]+$", "", text[:cut]).strip(" -(")
    if episode and episode.group(1):
        episode_label = f"S{int(episode.group(1)):02d}E{int(episode.group(2)):02d}"
    elif episode:
        episode_label = f"Season {int(episode.group(3))}"
    else:
        episode_label = None
    return {
        "title": " ".join(title.split()) or name,
        "year": year.group(1) if year else None,
        "episode": episode_label,
    }
