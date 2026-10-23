"""One date format for every site: "Jun 17, 2026".

Sites write upload dates their own way: 1337x "Oct. 05th '26" (or just "3am" for today),
apibay "2026-10-06", the classic Pirate Bay layout "10-06 11:31", "03-14 2021" or "Y-day".

Also lives on the phone, as src/lib/format.ts (formatDate) in the Android app, which is not published.
Both must produce "Jun 17, 2026" from every site format, since each app sorts on
what it formatted.
Change one and change the other.
"""
import re
from datetime import date, datetime, timedelta

_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}


def parse_date(text, today=None):
    """date, or None if the text isn't a recognizable date."""
    if not text:
        return None
    today = today or date.today()
    t = " ".join(str(text).replace("\xa0", " ").split()).strip().lower()

    match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", t)  # 2026-10-06
    if match:
        return _safe(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = re.match(r"^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+'?(\d{4}|\d{2})\b", t)  # oct. 05th '26 / jun 17, 2026
    if match and match.group(1) in _MONTHS:
        year = int(match.group(3))
        return _safe(year + 2000 if year < 100 else year, _MONTHS[match.group(1)], int(match.group(2)))
    match = re.match(r"^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})", t)  # 17 jun 2026
    if match and match.group(2) in _MONTHS:
        return _safe(int(match.group(3)), _MONTHS[match.group(2)], int(match.group(1)))
    match = re.match(r"^(\d{2})-(\d{2})\s+(\d{4})$", t)  # 03-14 2021
    if match:
        return _safe(int(match.group(3)), int(match.group(1)), int(match.group(2)))
    match = re.match(r"^(\d{2})-(\d{2})\s+\d{1,2}:\d{2}$", t)  # 10-06 11:31 (this year)
    if match:
        return _safe(today.year, int(match.group(1)), int(match.group(2)))
    if t.startswith(("today", "now")) or re.match(r"^\d{1,2}(:\d{2})?\s*(am|pm)$", t) or re.search(r"\b(sec|min|hour)s?\b.*ago", t):
        return today
    if t.startswith(("yesterday", "y-day")):
        return today - timedelta(days=1)
    match = re.match(r"^(\d+)\s+days?\s+ago", t)
    if match:
        return today - timedelta(days=int(match.group(1)))
    return None


def format_date(text, today=None):
    """ "Jun 17, 2026"; text that isn't a date is passed through unchanged."""
    parsed = parse_date(text, today)
    return f"{parsed:%b} {parsed.day}, {parsed.year}" if parsed else (text or "?")


def _safe(year, month, day):
    try:
        return datetime(year, month, day).date()
    except ValueError:
        return None
