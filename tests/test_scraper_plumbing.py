"""The shared scraper plumbing: one session, mirror fallback, and the SSRF guard."""
import time

import pytest
from bs4 import BeautifulSoup

import sources.base as base
from sources import image_proxy
from sources.base import ScraperError, first_working
from sources.x1337 import _parse_table


class TestSession:
    """Regression: a new cloudscraper per request threw away the Cloudflare clearance
    cookie it had just earned, so every request re-ran the challenge."""

    def test_one_scraper_is_reused(self):
        assert base.session() is base.session()


class TestFirstWorking:
    def test_the_main_site_answers_and_no_backup_is_tried(self):
        tried = []
        attempts = [("main", lambda: tried.append("main") or ["row"]),
                    ("backup", lambda: tried.append("backup") or ["row"])]
        assert first_working("site", attempts) == ["row"]
        assert tried == ["main"]

    def test_a_backup_answers_when_the_main_site_fails_and_says_so(self):
        notes = []
        attempts = [("main", lambda: (_ for _ in ()).throw(ScraperError("main down"))),
                    ("backup", lambda: ["row"])]
        assert first_working("site", attempts, notes) == ["row"]
        assert notes and "backup" in notes[0]

    def test_everything_answering_empty_is_none_not_an_error(self):
        # "nobody has this torrent" is an answer; it must not read as an outage
        assert first_working("site", [("main", lambda: []), ("backup", lambda: [])]) is None

    def test_every_mirror_failing_raises(self):
        attempts = [("main", lambda: (_ for _ in ()).throw(ScraperError("down"))),
                    ("backup", lambda: (_ for _ in ()).throw(ScraperError("also down")))]
        with pytest.raises(ScraperError):
            first_working("site", attempts)

    def test_an_unreadable_answer_moves_on_to_the_backup(self):
        attempts = [("main", lambda: (_ for _ in ()).throw(KeyError("layout changed"))),
                    ("backup", lambda: ["row"])]
        assert first_working("site", attempts) == ["row"]

    def test_no_mirrors_at_all_raises_instead_of_an_index_error(self):
        # Regression: problems[0] on an empty list raised IndexError
        with pytest.raises(ScraperError):
            first_working("site", [])


class TestImageProxyGuard:
    def test_refuses_a_private_address(self):
        for url in ("http://127.0.0.1/a.png", "http://localhost/a.png", "http://10.0.0.1/a.png"):
            with pytest.raises(image_proxy.ImageError):
                image_proxy._check_public(url)

    def test_refuses_a_scheme_that_is_not_http(self):
        for url in ("file:///etc/passwd", "gopher://example.com/a.png", "ftp://example.com/a.png"):
            with pytest.raises(image_proxy.ImageError):
                image_proxy._check_public(url)


class TestImageCacheAccounting:
    """Regression: a refetch after the TTL overwrote the entry without subtracting the
    old bytes, so the running total only climbed. Left alone it ends up above the cap
    with the cache nearly empty, and every picture is fetched again."""

    def test_the_total_matches_the_contents_after_repeated_refetches(self):
        url, data = "https://example.test/a.jpg", b"x" * 1000
        before_entries = dict(image_proxy._cache)
        before_size = image_proxy._cache_size
        try:
            for _ in range(3):
                previous = image_proxy._cache.pop(url, None)
                if previous:
                    image_proxy._cache_size -= len(previous[2])
                image_proxy._cache[url] = (time.time(), "image/jpeg", data)
                image_proxy._cache_size += len(data)
            accounted = image_proxy._cache_size - before_size
            assert accounted == len(data)
        finally:
            image_proxy._cache.clear()
            image_proxy._cache.update(before_entries)
            image_proxy._cache_size = before_size


class TestResultTable:
    """Regression: every row was parsed inside a bare `except Exception` that printed to
    the console, so a changed layout showed the user "nothing found" for a site that had
    answered with a full page."""

    def test_a_table_whose_rows_cannot_be_read_raises(self):
        soup = BeautifulSoup(
            '<table class="table-list"><tr><th>Name</th></tr>'
            '<tr><td class="newname">A</td></tr><tr><td class="newname">B</td></tr></table>',
            "html.parser")
        with pytest.raises(ScraperError):
            _parse_table(soup, 1, "https://example.test")

    def test_a_genuinely_empty_result_page_does_not_raise(self):
        # 1337x renders a "No results were returned" box with no table at all
        soup = BeautifulSoup("<div>No results were returned</div>", "html.parser")
        assert _parse_table(soup, 1, "https://example.test") == ([], False)

    def test_one_broken_row_beside_a_good_one_is_skipped(self):
        soup = BeautifulSoup(
            '<table class="table-list"><tr><th>Name</th></tr>'
            '<tr><td class="coll-1 name"><a href="/x/">i</a>'
            '<a href="/torrent/12/Name/">Good.Release.1080p</a></td>'
            '<td class="coll-2 seeds">10</td><td class="coll-3 leeches">2</td>'
            '<td class="coll-date">Jan. 1st \'24</td>'
            '<td class="coll-4 size">1.4 GB</td><td class="coll-5 user">someone</td></tr>'
            '<tr><td class="broken">nope</td></tr></table>',
            "html.parser")
        rows, _ = _parse_table(soup, 1, "https://example.test")
        assert len(rows) == 1
        assert rows[0]["path"] == "/torrent/12/Name/"
