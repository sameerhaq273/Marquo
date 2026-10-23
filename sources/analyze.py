"""Reads a torrent's detail content and organizes it, whatever site it came from.

Site modules only collect raw facts (see RawDetails below). Everything here works on
plain text, key/value pairs and file names, so a new site gets the same analysis
just by filling in RawDetails from its own page or API.

RawDetails (dict):
    title           release name
    site_category   the site's own category text, e.g. "Movies > HEVC/x265" (optional)
    kind            shared type if the site already knows it (optional)
    info            [(label, value)] metadata the page lists (Category, Language, ...)
    description     uploader's description as plain text, newlines kept
    images          image URLs, the site's poster first if it has one
    links           URLs linked from the description
    image_links     [(page URL, thumbnail URL)] for thumbnails linking to an image-host page (optional)
    files           [{"name": str, "size": int bytes | None}]
    magnet, info_hash, seeds, leeches, size, uploader, uploaded, imdb   (any may be None)

Also lives on the phone, as src/lib/analyze.ts in the marquo-mobile repository.
The phone ports the useful half. The size helpers in particular must agree: reading
a decimal size as binary there once moved torrents across the smart-TV size line.
Change one and change the other.
"""
import re
from collections import OrderedDict

from .dates import format_date
from .release import parse_print, parse_release, parse_resolution

# ---------------------------------------------------------------- files

_EXTENSIONS = {
    "video": "mkv mp4 avi m4v mov wmv ts m2ts mpg mpeg webm flv vob ogm divx",
    "audio": "mp3 flac m4a aac ogg opus wav alac ape wma dsf m4b",
    "subtitle": "srt ass ssa sub idx vtt sup smi",
    "image": "jpg jpeg png gif bmp webp",
    "ebook": "epub pdf mobi azw azw3 djvu fb2 cbz cbr cb7 lit",
    "archive": "rar zip 7z tar gz bz2 xz r00 r01 001 002",
    "disc": "iso img bin cue mdf mds nrg dmg",
    "executable": "exe msi bat cmd com scr vbs js jar apk ps1 lnk pif",
    "text": "txt nfo md log sfv md5 sha1 url",
}
_FILE_TYPES = {ext: kind for kind, exts in _EXTENSIONS.items() for ext in exts.split()}
_FILE_LABELS = {
    "video": "Video", "audio": "Audio", "subtitle": "Subtitles", "image": "Images", "ebook": "Books",
    "archive": "Archives", "disc": "Disc images", "executable": "Programs", "text": "Text / info", "other": "Other",
}
# Promo files that release groups and sites add; harmless but not content
_PROMO = re.compile(r"(www\.|https?://|official site|\(tor\)|rarbg\.txt|torrent downloaded from|visit |\.url$|ads?\b.*\.txt$)", re.I)
# File types that can run code; worth flagging outside software/games
_RISKY = {"exe", "msi", "bat", "cmd", "com", "scr", "vbs", "js", "jar", "ps1", "lnk", "pif"}


def _ext(name):
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def _file_type(name):
    if re.search(r"(^|[\\/._ -])sample([\\/._ -]|$)", name, re.I):
        return "sample"
    return _FILE_TYPES.get(_ext(name), "other")


def format_bytes(size):
    if size is None:
        return None
    for unit, factor in (("TB", 1e12), ("GB", 1e9), ("MB", 1e6), ("KB", 1e3)):
        if size >= factor:
            return f"{size / factor:.1f} {unit}".replace(".0 ", " ")
    return f"{size} B"


def display_size(text):
    """One unit everywhere: "3.4 GiB" -> "3.7 GB". Sizes already in GB / MB are left as given."""
    if not text or not re.search(r"\diB|\d\s*[KMGTP]iB", text):
        return text
    size = parse_size(text)
    return format_bytes(size) if size is not None else text


def parse_size(text):
    """"2.2 GB" / "3.4 GiB" / "845.4 MB" -> bytes."""
    match = re.search(r"([\d.,]+)\s*([KMGT]?)(i?)B", text or "", re.I)
    if not match:
        return None
    base = 1024 if match.group(3) else 1000
    power = " KMGT".index(match.group(2).upper() or " ")
    return int(float(match.group(1).replace(",", "")) * base ** power)


def _analyze_files(files):
    groups = OrderedDict()
    listed = []
    promo, risky = [], []
    for f in files:
        name, size = f["name"], f.get("size")
        ftype = _file_type(name)
        if _PROMO.search(name.rsplit("/", 1)[-1]):
            ftype = "promo"
            promo.append(name)
        if _ext(name) in _RISKY:
            risky.append(name)
        group = groups.setdefault(ftype, {"type": ftype, "count": 0, "size": 0})
        group["count"] += 1
        group["size"] += size or 0
        listed.append({"name": name, "size": format_bytes(size), "type": ftype})

    labels = {**_FILE_LABELS, "sample": "Samples", "promo": "Extras / promo"}
    summary = [
        {"type": g["type"], "label": labels.get(g["type"], g["type"]), "count": g["count"], "size": format_bytes(g["size"]) if g["size"] else None}
        for g in sorted(groups.values(), key=lambda g: -g["size"])
    ]
    return {"total": len(files), "groups": summary, "list": listed[:300], "truncated": len(files) > 300}, groups, risky, promo


# ---------------------------------------------------------------- description text

_HEADER = re.compile(r"^\W*(?:\.:)?\s*([A-Za-z][A-Za-z #/&()]{1,40}?)\s*(?::\.)?\W*$")
_KEY_VALUE = re.compile(r"^\s*([A-Za-z][\w ()/#.'&+-]{0,40}?)\s*\.{0,20}\s*[:：=]\s*(.+?)\s*$")
_SECTION_WORDS = {
    "video": ("video",), "audio": ("audio",), "subtitles": ("subtitle", "subs", "text"),
    "general": ("general", "file", "format", "media info", "mediainfo", "technical", "specs"),
    "info": ("info", "release", "tmdb", "imdb", "movie", "details", "about", "show", "series", "film"),
    "cast": ("cast", "starring", "actors"),
    "plot": ("plot", "synopsis", "storyline", "overview", "summary", "description", "story"),
    "requirements": ("requirement", "system", "minimum", "recommended"),
    "tracklist": ("tracklist", "track list", "tracks"),
}


def _section_of(header):
    h = header.lower()
    for section, words in _SECTION_WORDS.items():
        if any(w in h for w in words):
            return section
    return None


def _parse_description(text):
    """Key/value pairs (with the section they were under), header-less prose paragraphs,
    and lines under a cast / tracklist header."""
    pairs, prose, cast, tracks = [], [], [], []
    section = None
    paragraph = []
    text = (text or "").replace("\r", "")
    # YIFY-style "[FORMAT]:.........[ MP4 [GENRE]:......[ Action" -> one "Format: MP4" per line
    text = re.sub(r"\[\s*([A-Z][A-Z ()/-]{1,30}?)\s*\]\s*:[\s.]*\[?\s*", lambda m: "\n" + m.group(1).title() + ": ", text)
    lines = text.split("\n")

    def flush():
        if paragraph:
            prose.append(" ".join(paragraph))
            paragraph.clear()

    for raw in lines:
        line = raw.strip()
        if not line:
            flush()
            continue
        if re.fullmatch(r"[-=_*~.#\s]{3,}", line):  # rules like ------ or ======
            flush()
            continue
        kv = _KEY_VALUE.match(line)
        if kv and not re.match(r"https?$", kv.group(1), re.I):
            flush()
            value = kv.group(2).strip()
            # "Source: 720p A computer hacker learns..." : a short value with the plot run on after it
            run_on = re.match(r"^(\S{1,12})\s+([A-Z][^.]{20,}\..*)$", value)
            if run_on:
                value = run_on.group(1)
                prose.append(run_on.group(2))
            pairs.append((section, kv.group(1).strip(" ."), value))
            continue
        # A key with its value on the next line ("Overview:" / "TmDb Url:")
        if re.fullmatch(r"[A-Za-z][\w ()/#.'&-]{0,40}:", line):
            flush()
            # "Cast:" / "Tracklist:" start a list rather than a single value
            list_section = _section_of(line[:-1])
            if list_section in ("cast", "tracklist"):
                section = list_section
            else:
                pairs.append((section, line[:-1].strip(), None))
            continue
        bare = re.sub(r"^[\W_]+|[\W_]+$", "", line)
        header = _HEADER.match(line)
        if header and len(bare) <= 40 and (_section_of(bare) or line != bare or line.isupper()):
            flush()
            section = _section_of(bare) or section
            continue
        if pairs and pairs[-1][2] is None:  # value for "Key:" on the previous line
            s, k, _ = pairs[-1]
            pairs[-1] = (s, k, line)
            continue
        if section == "cast":
            cast.append(line)
            continue
        if section == "tracklist" or re.match(r"^\d{1,3}[.)\-\s]+\S.*\d{1,2}:\d{2}\s*$", line):
            tracks.append(line)
            continue
        paragraph.append(line)
    flush()
    return pairs, prose, cast, tracks


_EMPTY = {"n/a", "na", "-", "--", "none", "unknown", "null", "tba", "?"}


def _find(pairs, *keys, section=None):
    """First real value whose key matches one of keys (case-insensitive, exact or prefix)."""
    for s, k, v in pairs:
        if v is None or (section and s != section):
            continue
        v = v.strip(" :.-|[]\t")
        if not v or v.lower() in _EMPTY:
            continue
        kl = k.lower()
        if any(kl == key or kl.startswith(key + " ") for key in keys):
            return v
    return None


# ---------------------------------------------------------------- detectors over all text

_STREAMING = {
    "AMZN": "Amazon Prime Video", "NF": "Netflix", "DSNP": "Disney+", "HMAX": "HBO Max", "MAX": "Max",
    "ATVP": "Apple TV+", "PCOK": "Peacock", "PMTP": "Paramount+", "HULU": "Hulu", "IT": "iTunes",
    "CRAV": "Crave", "STAN": "Stan", "ROKU": "Roku", "CR": "Crunchyroll", "HS": "Hotstar", "JC": "JioCinema",
}
_LANGUAGES = {
    "english": "English", "eng": "English", "en": "English", "italian": "Italian", "ita": "Italian",
    "spanish": "Spanish", "spa": "Spanish", "esp": "Spanish", "latino": "Spanish (Latin America)",
    "french": "French", "fre": "French", "fra": "French", "vff": "French", "vfq": "French", "truefrench": "French",
    "german": "German", "ger": "German", "deu": "German", "hindi": "Hindi", "hin": "Hindi",
    "japanese": "Japanese", "jpn": "Japanese", "jap": "Japanese", "korean": "Korean", "kor": "Korean",
    "russian": "Russian", "rus": "Russian", "portuguese": "Portuguese", "por": "Portuguese", "pt-br": "Portuguese (Brazil)",
    "chinese": "Chinese", "chi": "Chinese", "zho": "Chinese", "mandarin": "Chinese", "cantonese": "Cantonese",
    "arabic": "Arabic", "ara": "Arabic", "turkish": "Turkish", "tur": "Turkish", "polish": "Polish", "pol": "Polish",
    "dutch": "Dutch", "dut": "Dutch", "nld": "Dutch", "tamil": "Tamil", "tam": "Tamil", "telugu": "Telugu", "tel": "Telugu",
    "malayalam": "Malayalam", "kannada": "Kannada", "bengali": "Bengali", "urdu": "Urdu", "persian": "Persian",
    "swedish": "Swedish", "swe": "Swedish", "danish": "Danish", "norwegian": "Norwegian", "finnish": "Finnish",
    "greek": "Greek", "hebrew": "Hebrew", "czech": "Czech", "hungarian": "Hungarian", "romanian": "Romanian",
    "ukrainian": "Ukrainian", "thai": "Thai", "vietnamese": "Vietnamese", "indonesian": "Indonesian",
}
# Short codes only count in release names / language fields, not in free prose
_SHORT_CODES = {k for k in _LANGUAGES if len(k) <= 3}


def _languages(texts, strict=False):
    found = []
    for text in texts:
        for token in re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)?", text or ""):
            key = token.lower()
            if key in _LANGUAGES and (not strict or key not in _SHORT_CODES or token.isupper() or len(key) > 2):
                name = _LANGUAGES[key]
                if name not in found:
                    found.append(name)
    return found


def _video(title, text, pairs):
    blob = f"{title}\n{text}"
    items = []
    codec = None
    if re.search(r"\b(x\.?265|h\.?265|hevc)\b", blob, re.I):
        codec = "HEVC (H.265)"
    elif re.search(r"\b(x\.?264|h\.?264|avc)\b", blob, re.I):
        codec = "AVC (H.264)"
    elif re.search(r"\bav1\b", blob, re.I):
        codec = "AV1"
    elif re.search(r"\b(xvid|divx)\b", blob, re.I):
        codec = "XviD / DivX"
    elif re.search(r"\bvp9\b", blob, re.I):
        codec = "VP9"
    items.append(("Codec", codec))

    width = re.search(r"(\d{3,4})\s*[x×X*]\s*(\d{3,4})", text) or None
    w = _find(pairs, "width", section="video") or _find(pairs, "width")
    h = _find(pairs, "height", section="video") or _find(pairs, "height")
    if width:
        dims = f"{width.group(1)}×{width.group(2)}"
    elif w and h:
        dims = f"{re.sub(r'[^0-9]', '', w)}×{re.sub(r'[^0-9]', '', h)}"
    else:
        dims = None
    res = parse_resolution(title) or parse_resolution(text)
    items.append(("Resolution", " · ".join(x for x in (res, dims) if x) or None))

    hdr = []
    if re.search(r"\b(dv|dovi|dolby[ .]?vision)\b", blob, re.I):
        hdr.append("Dolby Vision")
    if re.search(r"\bhdr10\+|hdr10plus\b", blob, re.I):
        hdr.append("HDR10+")
    elif re.search(r"\bhdr10\b", blob, re.I):
        hdr.append("HDR10")
    elif re.search(r"\bhdr\b", blob, re.I):
        hdr.append("HDR")
    if re.search(r"\bhlg\b", blob, re.I):
        hdr.append("HLG")
    items.append(("HDR", ", ".join(hdr) or None))

    depth = re.search(r"\b(8|10|12)[ -]?bits?\b", blob, re.I)
    items.append(("Bit depth", f"{depth.group(1)}-bit" if depth else None))
    fps = re.search(r"(\d{2}(?:\.\d{1,3})?)\s*(?:fps|frames per second)", text, re.I)
    items.append(("Frame rate", f"{fps.group(1)} fps" if fps else None))
    items.append(("Bitrate", _find(pairs, "video bitrate", "bit rate", "bitrate", section="video") or _find(pairs, "video bitrate")))
    items.append(("Aspect ratio", _find(pairs, "aspect ratio(ar)", "aspect ratio", "display aspect ratio")))
    items.append(("Duration", _find(pairs, "duration", "runtime", "run time", "length")))
    items.append(("Container", _find(pairs, "container", "format", section="general") or _find(pairs, "container")))
    return items


def _audio(title, text, pairs):
    blob = f"{title}\n{text}"
    codecs = [
        (r"\btrue-?hd\b", "Dolby TrueHD"), (r"\bdts[-: ]?x\b", "DTS:X"), (r"\bdts[-. ]?hd(?:[-. ]?ma)?\b", "DTS-HD MA"),
        (r"\b(ddp|dd\+|e-?ac-?3|eac3)", "Dolby Digital Plus"), (r"\b(dd|ac-?3)(?=\d|\b)", "Dolby Digital"),
        (r"\bdts\b", "DTS"), (r"\baac", "AAC"), (r"\bflac\b", "FLAC"), (r"\bopus\b", "Opus"),
        (r"\b(l?pcm)\b", "PCM"), (r"\bmp3\b", "MP3"),
    ]
    codec = next((label for pattern, label in codecs if re.search(pattern, blob, re.I)), None)
    atmos = bool(re.search(r"\batmos\b", blob, re.I))
    channels = re.search(r"(?<![\d.])([1-7]\.[0-2])(?![\d.])", title) or re.search(r"\b(ddp|dd|aac|ac3|eac3|dts)\s?([1-7]\.[0-2])", blob, re.I)
    if channels:
        ch = channels.group(channels.lastindex)
    else:
        count = re.search(r"(\d)\s*channels?", text, re.I)
        ch = {"1": "1.0", "2": "2.0", "6": "5.1", "8": "7.1"}.get(count.group(1)) if count else None
    language_values = [v for s, k, v in pairs if v and "language" in k.lower() and s in (None, "audio", "info", "general")]
    langs = _languages(language_values + [title], strict=True)
    if re.search(r"\bdual[ .-]?audio\b", blob, re.I):
        langs = langs or ["Dual audio"]
    if re.search(r"\bmulti\b", title, re.I) and "Multiple" not in langs:
        langs.append("Multiple")
    return [
        ("Codec", " ".join(x for x in (codec, "Atmos" if atmos else None) if x) or None),
        ("Channels", ch),
        ("Languages", ", ".join(langs) or None),
        ("Bitrate", _find(pairs, "bitrate", "bit rate", "audio bitrate", section="audio")),
        ("Sample rate", _find(pairs, "sample rate", "sampling rate", section="audio") or _find(pairs, "sample rate")),
    ]


def _subtitles(title, text, pairs, files):
    values = [v for s, k, v in pairs if v and (s == "subtitles" or re.match(r"sub", k, re.I))]
    names = [f["name"] for f in files if _file_type(f["name"]) == "subtitle"]
    langs = _languages(values + [re.sub(r"[._]", " ", n) for n in names], strict=True)
    extra = []
    if re.search(r"\b(esubs?|msubs?|multi[ .-]?subs?)\b", title, re.I):
        extra.append("Included")
    if re.search(r"\b(hc|hardcoded|hardsub)\b", title, re.I):
        extra.append("Hardcoded")
    if names:
        extra.append(f"{len(names)} subtitle file{'s' if len(names) != 1 else ''}")
    return [("Languages", ", ".join(langs) or None), ("Notes", ", ".join(extra) or None)]


def _release_info(title, text, pairs, file_groups, files):
    blob = f"{title}\n{text}"
    group = re.search(r"-([A-Za-z][A-Za-z0-9]*)(?:\.\w{2,4})?$", title.strip())
    if not group:
        # "[YTS]" style tag at the end, but not "[1080p]" / "[WEBRip]" / "[5.1]"
        bracket = re.search(r"\[([A-Za-z][A-Za-z0-9 .]*)\]\s*$", title)
        if bracket and not (parse_print(bracket.group(1)) or parse_resolution(bracket.group(1))):
            group = bracket
    service = None
    for code, name in _STREAMING.items():
        if re.search(rf"(?<![A-Za-z]){code}(?![A-Za-z])", title) and (code != "IT" or re.search(r"\biT\b", title)):
            service = name
            break
    editions = [label for pattern, label in (
        (r"extended", "Extended"), (r"director'?s[ .]?cut", "Director's Cut"), (r"unrated", "Unrated"),
        (r"imax", "IMAX"), (r"remaster(ed)?", "Remastered"), (r"criterion", "Criterion"), (r"theatrical", "Theatrical"),
        (r"\bproper\b", "Proper"), (r"\brepack\b", "Repack"), (r"\buncut\b", "Uncut"),
    ) if re.search(pattern, title, re.I)]
    source = parse_print(title) or (lambda v: parse_print(v) if v else None)(_find(pairs, "source"))
    containers = sorted({_ext(f["name"]).upper() for f in files if _file_type(f["name"]) == "video"})
    return [
        ("Source", source),
        ("Streaming service", service),
        ("Edition", ", ".join(editions) or None),
        ("Release group", group.group(1) if group else None),
        ("Container", ", ".join(containers) or None),
    ]


def _software(title, text, pairs):
    blob = f"{title}\n{text}"
    # The release name is the most reliable place for the version; descriptions mention others
    version = (
        re.search(r"\bv(?:ersion)?\s?(\d+(?:\.\d+){1,3}[a-z]?)\b", title, re.I)
        or re.search(r"\b(\d+\.\d+(?:\.\d+){0,2})\b", title)
        or re.search(r"\bv(?:ersion)?\s?(\d+(?:\.\d+){1,3}[a-z]?)\b", text, re.I)
    )
    platforms = [label for pattern, label in (
        (r"\bwin(dows|\d{2}|64|32)?\b", "Windows"), (r"\b(mac ?os|osx|macintosh)\b", "macOS"), (r"\blinux\b", "Linux"),
        (r"\bandroid\b", "Android"), (r"\b(ios|iphone|ipad)\b", "iOS"), (r"\bps[345]\b", "PlayStation"),
        (r"\bswitch\b|\bnsp\b|\bxci\b", "Nintendo Switch"), (r"\bxbox\b", "Xbox"),
    ) if re.search(pattern, blob, re.I)]
    arch = [a for a in ("x64", "x86", "ARM64") if re.search(rf"\b{a}\b", blob, re.I)]
    packer = re.search(r"\b(fitgirl|dodi|elamigos|kaos|xatab|gog|codex|plaza|skidrow|rune|tenoke|empress|flt|razor1911|cpy)\b", blob, re.I)
    activation = next((label for pattern, label in (
        (r"pre-?activated", "Pre-activated"), (r"\bcrack(ed)?\b", "Cracked"), (r"\bpatch\b", "Patch included"),
        (r"\bkeygen\b", "Keygen included"), (r"\bportable\b", "Portable"),
    ) if re.search(pattern, blob, re.I)), None)
    return [
        ("Version", version.group(1) if version else None),
        ("Platform", ", ".join(platforms) or None),
        ("Architecture", ", ".join(arch) or None),
        ("Release / repack", _PACKERS.get(packer.group(1).lower()) if packer else None),
        ("Activation", activation),
        ("Languages", (_find(pairs, "language", "languages", "interface language") or "").strip(" ,") or None),
    ]


_PACKERS = {
    "fitgirl": "FitGirl", "dodi": "DODI", "elamigos": "ElAmigos", "kaos": "KaOs", "xatab": "xatab", "gog": "GOG",
    "codex": "CODEX", "plaza": "PLAZA", "skidrow": "SKIDROW", "rune": "RUNE", "tenoke": "TENOKE",
    "empress": "EMPRESS", "flt": "FLT", "razor1911": "Razor1911", "cpy": "CPY",
}


def _requirements(pairs):
    keys = (("os", "OS"), ("operating system", "OS"), ("processor", "Processor"), ("cpu", "Processor"),
            ("memory", "Memory"), ("ram", "Memory"), ("graphics", "Graphics"), ("video card", "Graphics"),
            ("gpu", "Graphics"), ("storage", "Storage"), ("hard drive", "Storage"), ("disk space", "Storage"),
            ("hdd", "Storage"), ("directx", "DirectX"))
    out = OrderedDict()
    for s, k, v in pairs:
        if not v:
            continue
        for key, label in keys:
            if k.lower() == key or k.lower().startswith(key + " "):
                out.setdefault(label, v)
    return list(out.items())


def _music(title, text, pairs, file_groups, tracks):
    blob = f"{title}\n{text}"
    fmt = next((label for pattern, label in (
        (r"\bflac\b", "FLAC"), (r"\balac\b", "ALAC"), (r"\bwav\b", "WAV"), (r"\bmp3\b", "MP3"),
        (r"\baac\b|\bm4a\b", "AAC"), (r"\bopus\b", "Opus"), (r"\bdsd\b|\bdsf\b", "DSD"),
    ) if re.search(pattern, blob, re.I)), None)
    quality = re.search(r"\b(320|256|192|128)\s?kbps\b|\b(V0|V2)\b|\b(16|24)[ -]?bit(?:[ /-]+(\d{2,3}(?:\.\d)?)\s?khz)?", blob, re.I)
    artist_album = re.match(r"\s*(.+?)\s+-\s+(.+?)(?:\s*[(\[]|$)", title)
    track_count = file_groups.get("audio", {}).get("count") or len(tracks) or None
    return [
        ("Artist", _find(pairs, "artist", "performer") or (artist_album.group(1) if artist_album else None)),
        # _find returns whichever key appears first, so asking for "album" or "title"
        # together could answer with the track title even when an Album row existed.
        ("Album", _find(pairs, "album") or _find(pairs, "title") or (artist_album.group(2) if artist_album else None)),
        ("Format", fmt),
        ("Quality", quality.group(0) if quality else None),
        ("Tracks", str(track_count) if track_count else None),
        ("Genre", _find(pairs, "genre", "style")),
    ]


def _book(title, text, pairs, files):
    blob = f"{title}\n{text}"
    # Audiobooks are audio files, so count those formats too
    formats = sorted({_ext(f["name"]).upper() for f in files if _file_type(f["name"]) in ("ebook", "audio")})
    if not formats:
        formats = [f.upper() for f in ("epub", "pdf", "mobi", "azw3", "cbz", "cbr", "m4b") if re.search(rf"\b{f}\b", blob, re.I)]
    isbn = re.search(r"\bISBN(?:-1[03])?:?\s*([\d-]{10,17}X?)", blob, re.I)
    by = re.search(r"\bby\s+([A-Z][\w.'-]+(?:\s+(?!(?:EPUB|PDF|MOBI|AZW3|CBZ|CBR|M4B|MP3)\b)[A-Z][\w.'-]+){0,3})", title)
    return [
        ("Author", _find(pairs, "author", "authors", "writer", "written by") or (by.group(1) if by else None)),
        ("Narrator", _find(pairs, "narrator", "narrated by", "read by")),
        ("Publisher", _find(pairs, "publisher", "published by")),
        ("Format", ", ".join(formats) or None),
        ("Pages", _find(pairs, "pages", "print length", "page count")),
        ("ISBN", isbn.group(1) if isbn else _find(pairs, "isbn")),
        ("Language", _find(pairs, "language")),
    ]


# ---------------------------------------------------------------- kind (category)

_SITE_KIND_WORDS = (
    ("adult", r"xxx|porn|adult"), ("book", r"e-?books?|audio ?books?|comics?|books?"),
    ("tv", r"\btv\b|television|series|episodes?|anime"), ("movie", r"movies?|films?|documentar|video"),
    ("game", r"games?"), ("app", r"apps?|applications?|software|windows|mac|unix|android|ios"),
    ("music", r"music|audio|flac|mp3|lossless|album"),
)


def detect_kind(raw, file_groups):
    """Site's own category first; otherwise judged from title and files."""
    if raw.get("kind") and raw["kind"] != "other":
        return raw["kind"]
    site = (raw.get("site_category") or "").lower()
    for kind, pattern in _SITE_KIND_WORDS:
        if site and re.search(pattern, site):
            return kind
    title = raw.get("title", "")
    size_of = lambda t: file_groups.get(t, {}).get("size", 0)
    biggest = max(file_groups, key=lambda t: file_groups[t]["size"], default=None)
    if re.search(r"\bs\d{1,2}e\d{1,3}\b|\bseason\b|\bcomplete series\b", title, re.I) and biggest in ("video", "archive", None):
        return "tv"
    if biggest == "video":
        return "movie"
    if biggest == "audio":
        return "book" if re.search(r"audio ?book|unabridged|narrated", title, re.I) else "music"
    if biggest == "ebook":
        return "book"
    if biggest in ("executable", "disc", "archive") or size_of("executable"):
        return "game" if re.search(r"repack|fitgirl|dodi|codex|plaza|gog|\bgame\b|skidrow|tenoke", title, re.I) else "app"
    return raw.get("kind") or "other"


# ---------------------------------------------------------------- main entry

_REFERENCE_SITES = (
    (r"imdb\.com/title/(tt\d+)", "IMDb"), (r"themoviedb\.org/(movie|tv)/\d+", "TMDB"), (r"thetvdb\.com", "TheTVDB"),
    (r"myanimelist\.net/anime/\d+", "MyAnimeList"), (r"anilist\.co/anime/\d+", "AniList"),
    (r"store\.steampowered\.com/app/\d+", "Steam"), (r"gog\.com/(en/)?game/", "GOG"),
    (r"discogs\.com/", "Discogs"), (r"musicbrainz\.org/", "MusicBrainz"), (r"goodreads\.com/book/", "Goodreads"),
    (r"rottentomatoes\.com/", "Rotten Tomatoes"), (r"trakt\.tv/", "Trakt"),
)
_JUNK_IMAGE = re.compile(r"histats|logo|banner\.gif|counter|pixel|spacer|smiley|emoji|button|/ads?/", re.I)
# Image hosts that serve pictures from extension-less URLs
_IMAGE_HOSTS = re.compile(
    r"image\.tmdb\.org|i\.ibb\.co|postimg|imgbox|imgur|imageban|fastpic|pixhost|ezimg|imagetwist|/static/movie/", re.I
)


def _is_image_url(url):
    return bool(re.search(r"\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)", url, re.I) or _IMAGE_HOSTS.search(url))


def imdb_id(raw, text=""):
    """IMDb title id from the site's data or any IMDb link / mention in the description."""
    if raw.get("imdb"):
        return raw["imdb"]
    for source in list(raw.get("links") or []) + [text or ""]:
        match = re.search(r"imdb\.com/title/(tt\d{6,10})", source or "", re.I)
        if match:
            return match.group(1)
    return None


def poster_for_imdb(imdb):
    """Poster by IMDb id from metahub, the public poster service the Stremio app uses
    (IMDb itself answers scripts with a bot check). 404s for unknown ids, which the UI skips."""
    return f"https://images.metahub.space/poster/medium/{imdb}/img" if imdb else None


def _links(raw, text):
    urls = list(raw.get("links") or []) + re.findall(r"https?://[^\s<>\"')]+", text or "")
    if raw.get("imdb"):
        urls.append(f"https://www.imdb.com/title/{raw['imdb']}/")
    out, seen = [], set()
    for url in urls:
        for pattern, label in _REFERENCE_SITES:
            match = re.search(pattern, url, re.I)
            if match:
                key = (label, match.group(0).lower())
                if key not in seen and label not in {l["label"] for l in out}:
                    seen.add(key)
                    clean = url.replace("http://", "https://")
                    if label == "IMDb":
                        clean = f"https://www.imdb.com/title/{match.group(1)}/"
                    out.append({"label": label, "url": clean})
    return out


def _plot(pairs, prose, title):
    value = _find(pairs, "plot", "plot (en)", "overview", "synopsis", "storyline", "summary", "description", "story", "about")
    if value and len(value) > 30 and len(re.findall(r"[A-Za-z]{3,}", value)) >= 6:
        return value.strip(" :-|")
    # Otherwise the longest real paragraph: mostly words, not a list of specs
    candidates = [
        p for p in prose
        if len(p) >= 80 and len(re.findall(r"[A-Za-z]{3,}", p)) >= 12 and "http" not in p and p.strip() != title.strip()
        and len(re.findall(r"(?:^|\s)\d{1,3}[.)]\s", p)) < 3  # not a numbered list (tracks, episodes)
        and not re.search(r"[│┃├└═─]", p)  # not a box-drawn file tree / info table
    ]
    return max(candidates, key=len).strip(" :-|") if candidates else None


def _cast(pairs, cast_lines):
    value = _find(pairs, "cast", "starring", "actors", "stars")
    names = [re.split(r"\s+\.{2,}\s+|\s+as\s+", line)[0].strip() for line in cast_lines if len(line) < 80]
    if value:
        names = [n.strip() for n in re.split(r",|\|", value)] + names
    names = [n for n in names if n and not n.startswith("http")]
    return ", ".join(OrderedDict.fromkeys(names[:10])) or None


# A lead byte (Â..ô) followed by continuation bytes, as Latin-1 or Windows-1252 shows them
_CONTINUATION = "\u0080-¿ŒœŠšŸŽžƒˆ˜–-‘-„†-•…‰‹›€™"
_MOJIBAKE = re.compile(rf"[Â-ô][{_CONTINUATION}]{{1,3}}")


def fix_mojibake(text):
    """Repair UTF-8 text that was decoded as Latin-1 / Windows-1252 somewhere upstream
    ("PÃ©rez" -> "Pérez"). Uploaders' descriptions often arrive like this on torrent sites."""
    def repair(match):
        for codec in ("latin-1", "cp1252"):
            try:
                return match.group(0).encode(codec).decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
        return match.group(0)
    return _MOJIBAKE.sub(repair, text) if text else text


def _clean(items):
    return [{"label": label, "value": value} for label, value in items if value]


def analyze(raw):
    title = fix_mojibake(raw.get("title") or "")
    text = fix_mojibake(raw.get("description") or "")
    files = raw.get("files") or []
    pairs, prose, cast_lines, tracks = _parse_description(text)
    files_info, file_groups, risky, promo = _analyze_files(files)
    kind = detect_kind(raw, file_groups)
    release = parse_release(title)
    if kind not in ("movie", "tv", "adult"):
        # Versions and track numbers matter here, so keep dots; just drop [tags] and (notes)
        cleaned = re.sub(r"\s*[\[(][^\])]*[\])]", "", title).replace("_", " ")
        if kind in ("book", "music"):  # trailing format words: "... EPUB", "... FLAC 88"
            cleaned = re.sub(r"(\s+(epub|pdf|mobi|azw3|cbz|cbr|m4b|mp3|flac|aac|wav|alac|\d{2,3}))+\s*$", "", cleaned, flags=re.I)
        cleaned = cleaned.strip(" -")
        release = {**release, "title": cleaned or title}

    # Some sites use short names ("Movie (2026) [1080p]"); the main file's name usually
    # carries the codec / audio / group, so it's read as extra evidence
    biggest = max(files, key=lambda f: f.get("size") or 0, default=None)
    main_file = biggest["name"].rsplit("/", 1)[-1] if biggest else ""
    evidence = f"{title} {main_file}".strip()
    group_source = title if re.search(r"-[A-Za-z][A-Za-z0-9]*$", title.strip()) else main_file.rsplit(".", 1)[0] or title

    sections = []

    def add(section_id, label, icon, items):
        cleaned = _clean(items)
        if cleaned:
            sections.append({"id": section_id, "title": label, "icon": icon, "items": cleaned})

    is_video = kind in ("movie", "tv", "adult")
    if kind in ("movie", "tv"):
        add("info", "Movie info" if kind == "movie" else "Show info", "info", [
            ("Title", _find(pairs, "title", "original name", "original title", "name")),
            ("Genre", _find(pairs, "genre", "genres")),
            ("Released", _find(pairs, "release date", "released", "air date", "first aired", "year")),
            ("Rating", _find(pairs, "imdb rating", "rating", "tmdb rating", "score")),
            ("Director", _find(pairs, "director", "directed by", "directors")),
            ("Creator", _find(pairs, "creator", "created by")),
            ("Country", _find(pairs, "country")),
            ("Cast", _cast(pairs, cast_lines)),
        ])
    if is_video:
        add("video", "Video", "videocam", _video(evidence, text, pairs))
        add("audio", "Audio", "graphic_eq", _audio(evidence, text, pairs))
        add("subtitles", "Subtitles", "subtitles", _subtitles(evidence, text, pairs, files))
        add("release", "Release", "new_releases", _release_info(group_source, text, pairs, file_groups, files))
    elif kind in ("app", "game"):
        add("software", "Game" if kind == "game" else "Software", "sports_esports" if kind == "game" else "apps", _software(title, text, pairs))
        add("requirements", "System requirements", "memory", _requirements(pairs))
    elif kind == "music":
        add("music", "Music", "music_note", _music(title, text, pairs, file_groups, tracks))
    elif kind == "book":
        add("book", "Book", "menu_book", _book(title, text, pairs, files))

    images = [u for u in (raw.get("images") or []) if u and _is_image_url(u) and not _JUNK_IMAGE.search(u)]
    images = list(OrderedDict.fromkeys(images))
    tmdb = next((u for u in images if "image.tmdb.org/t/p/" in u), None)
    # Poster candidates, best first; the UI moves to the next one if a picture won't load.
    # An IMDb id gives a proper poster even when the site has none (The Pirate Bay) or a tiny one.
    imdb = imdb_id(raw, text)
    posters = [p for p in (tmdb, poster_for_imdb(imdb) if kind in ("movie", "tv") else None) if p]
    posters += [u for u in images[:1] if u not in posters]
    posters = list(OrderedDict.fromkeys(posters))
    poster = posters[0] if posters else None
    screenshots = [u for u in images if u not in posters][:12]

    warnings = []
    if risky and kind not in ("app", "game"):
        warnings.append(f"Contains program files ({', '.join(sorted({_ext(n) for n in risky}))}) in a {kind} torrent. Media torrents shouldn't need them; don't run them.")
    elif any(_ext(n) in ("lnk", "scr", "pif", "vbs") for n in risky):
        warnings.append("Contains shortcut or script files that can run code. Be careful.")
    if is_video and file_groups.get("archive") and not file_groups.get("video"):
        warnings.append("The video is packed inside an archive. Fake releases often do this to ask for a password or a download.")
    if re.search(r"\bpassword\b", text, re.I):
        warnings.append("The description mentions a password.")
    if kind in ("movie", "tv") and re.search(r"\b(cam|hdcam|telesync|hdts|ts)\b", title, re.I):
        warnings.append("Recorded in a cinema (CAM/TS): expect low picture and sound quality.")

    badges = [b for b in (
        parse_print(evidence), parse_resolution(evidence),
        next((i["value"] for s in sections if s["id"] == "video" for i in s["items"] if i["label"] == "HDR"), None),
        next((i["value"].split(" (")[0] for s in sections if s["id"] == "video" for i in s["items"] if i["label"] == "Codec"), None),
        next((i["value"] for s in sections if s["id"] == "audio" for i in s["items"] if i["label"] == "Codec"), None),
    ) if b]

    facts = _clean([
        # Only add the files up when at least one of them said how big it was: summing a
        # list of unknowns gives 0, and format_bytes(0) is "0 B", which reads as a fact.
        ("Size", raw.get("size") or (format_bytes(sum(f.get("size") or 0 for f in files))
                                     if any(f.get("size") for f in files) else None)),
        ("Seeds", str(raw["seeds"]) if raw.get("seeds") is not None else None),
        ("Leeches", str(raw["leeches"]) if raw.get("leeches") is not None else None),
        ("Files", str(len(files)) if files else None),
        ("Uploaded", format_date(raw.get("uploaded")) if raw.get("uploaded") else None),
        ("Uploader", raw.get("uploader")),
        ("Site category", raw.get("site_category")),
        ("Language", next((v for k, v in raw.get("info") or [] if k.lower() == "language"), None)),
    ])

    return {
        "kind": kind,
        "title": release["title"],
        "year": release["year"],
        "episode": release["episode"],
        "release": title,
        "badges": list(OrderedDict.fromkeys(badges)),
        "summary": _plot(pairs, prose, title),
        "poster": poster,
        "posters": posters,
        "imdb": imdb,
        "screenshots": screenshots,
        "facts": facts,
        "sections": sections,
        "files": files_info,
        "links": _links(raw, text),
        "warnings": warnings,
        "magnet": raw.get("magnet"),
        "info_hash": raw.get("info_hash"),
        "promo_files": len(promo),
    }
