"""Smart-TV compatibility rating, for formats the user's TV plays.

Audio (mandatory):  E-AC-3 / Dolby Digital Plus (DDP) 5.1 = best choice
                    AC-3 / Dolby Digital 5.1               = recommended
Video:              H.264 / x264                           = safe
                    HEVC / H.265 / x265 (incl. 10-bit)     = ok

Tiers (shades of green in the UI):
  best         right audio, and a movie / video under 6 GB, or any TV show (size and video skipped)
  recommended  movie of 6 GB or more with DDP 5.1
  safe         movie of 6 GB or more with AC-3 5.1 and H.264
  ok           movie of 6 GB or more with AC-3 5.1 and HEVC (or video not stated)
Anything without one of the two audio formats gets no rating.

A torrent's details (MediaInfo, description, file names) are the better source; the release
name is the fallback, and is what search results are rated from until details are checked.

Also lives on the phone, as src/lib/compat.ts in the marquo-mobile repository.
The tiers, the audio patterns and the 6 GB size line have to match, or the two apps
rate the same torrent differently.
Change one and change the other.
"""
import re

from .analyze import parse_size

SIZE_LIMIT = 6 * 1024**3  # "under 6 GB"
VIDEO_KINDS = ("movie", "adult")  # size rule applies
TV_KINDS = ("tv",)  # audio only

_CH51 = r"[ .\-_]?5[ .]1(?![0-9])"
# DDP5.1, DDPA5.1 (Atmos), DD+5.1, DD+ 5.1, EAC3 5.1, E-AC-3.5.1
_DDP51 = re.compile(rf"(?<![a-z0-9])(?:ddpa?|dd\+|e-?ac-?3|eac3|dolby[ .]digital[ .]?plus){_CH51}", re.I)
# DD5.1, DD 5.1, AC3 5.1, AC-3 5.1, Dolby Digital 5.1 (but not DD+/DDP)
_AC351 = re.compile(rf"(?<![a-z0-9+])(?:dd(?![+p])|ac-?3|dolby[ .]digital(?![ .]?plus)){_CH51}", re.I)
# Any other audio named in the release: the name settles the question (no details needed)
_OTHER_AUDIO = re.compile(
    r"(?<![a-z0-9])(?:aac|dts|truehd|true-hd|flac|opus|mp3|lpcm|pcm|ddpa?|dd\+|e-?ac-?3|eac3|ac-?3|dd[2-7][ .]?[0-9]|atmos)(?![a-z])",
    re.I,
)
_H264 = re.compile(r"(?<![a-z0-9])(?:x\.?264|h\.?264|avc)(?![0-9])", re.I)
_HEVC = re.compile(r"(?<![a-z0-9])(?:x\.?265|h\.?265|hevc)(?![0-9])", re.I)

LABELS = {"best": "Best for your TV", "recommended": "Recommended", "safe": "Safe", "ok": "OK"}
_AUDIO_NAMES = {"ddp51": "DD+ 5.1", "ac351": "AC-3 5.1"}
_VIDEO_NAMES = {"h264": "H.264", "hevc": "HEVC"}


def audio_in(text):
    """'ddp51' | 'ac351' | 'other' (some other audio is named) | None (nothing said)."""
    text = (text or "").replace("_", " ")
    if _DDP51.search(text):
        return "ddp51"
    if _AC351.search(text):
        return "ac351"
    return "other" if _OTHER_AUDIO.search(text) else None


def video_in(text):
    text = text or ""
    if _H264.search(text):
        return "h264"
    if _HEVC.search(text):
        return "hevc"
    return None


def rate(kind, size_bytes, audio, video, checked, size_text=None):
    """{tier, label, reason, checked} or None. checked: 'name' or 'details'."""
    shown = (size_text or "").strip() or (f"{size_bytes / 1024**3:.1f} GB" if size_bytes else "size unknown")
    if audio not in ("ddp51", "ac351") or kind not in VIDEO_KINDS + TV_KINDS:
        return None
    parts = [f"{_AUDIO_NAMES[audio]} audio"]
    if kind in TV_KINDS:
        tier = "best"
        parts.append("TV show (size not checked)")
    elif size_bytes is not None and size_bytes < SIZE_LIMIT:
        tier = "best"
        parts.append(f"{shown} (under 6 GB)")
    else:
        if audio == "ddp51":
            tier = "recommended"
        elif video == "h264":
            tier = "safe"
        else:
            tier = "ok"
        if video:
            parts.append(_VIDEO_NAMES[video])
        parts.append(f"{shown} (6 GB or more)" if size_bytes else shown)
    return {"tier": tier, "label": LABELS[tier], "reason": " · ".join(parts), "checked": checked}


def from_name(title, kind, size_text):
    """Rating from a release name, plus whether the details should be read to be sure."""
    audio = audio_in(title)
    rating = rate(kind, parse_size(size_text), audio, video_in(title), "name", size_text)
    # Movies / TV whose name doesn't say what the audio is: worth reading the details
    needs_details = audio is None and kind in VIDEO_KINDS + TV_KINDS
    return rating, needs_details


def from_details(raw, analysis):
    """Rating from a torrent's details: MediaInfo / description, release name and main file name."""
    files = raw.get("files") or []
    biggest = max(files, key=lambda f: f.get("size") or 0, default=None)
    text = " ".join(x for x in (
        raw.get("title"), biggest["name"] if biggest else "", raw.get("description"),
    ) if x)
    audio = audio_in(text)
    if audio not in ("ddp51", "ac351"):
        # MediaInfo style: "Audio Codec: E-AC-3" + "Channel Count: 6 channels" (no "5.1" written out)
        section = {i["label"]: i["value"] for s in analysis.get("sections", []) if s["id"] == "audio" for i in s["items"]}
        codec, channels = section.get("Codec", ""), section.get("Channels", "")
        if channels == "5.1" and codec.startswith("Dolby Digital Plus"):
            audio = "ddp51"
        elif channels == "5.1" and codec.startswith("Dolby Digital"):
            audio = "ac351"
    video = video_in(text)
    size = parse_size(raw.get("size") or "") or (sum(f.get("size") or 0 for f in files) or None)
    return rate(analysis.get("kind"), size, audio, video, "details", raw.get("size"))
