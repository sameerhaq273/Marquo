"""Reading release names, dates and the smart-TV rating out of plain text."""
from sources.compat import from_name
from sources.dates import format_date
from sources.matching import matches_all_words
from sources.release import parse_print, parse_release, parse_resolution


class TestReleaseNames:
    def test_pulls_the_year_out_of_a_release_name(self):
        assert parse_release("Some.Film.1994.1080p.BluRay.x264")["year"] == "1994"
        assert parse_release("Quiet Harbour 2049 (2016) 1080p")["year"] == "2016"

    def test_no_year_in_the_name_is_none_not_a_guess(self):
        assert parse_release("Placeholder.Series.S01E02.2160p")["year"] is None

    def test_reads_the_episode(self):
        assert parse_release("Some.Show.S01E02.1080p")["episode"] == "S01E02"

    def test_a_resolution_is_not_mistaken_for_a_year(self):
        assert parse_release("Invented Title 1920x1080 2010")["year"] == "2010"

    def test_reads_resolution_and_source(self):
        assert parse_resolution("Some.Film.2020.1080p.WEB-DL") == "1080p"
        assert parse_print("Some.Film.2020.1080p.WEB-DL") == "WEB-DL"
        assert parse_resolution("Some.Film.2020.2160p.BluRay") == "2160p"

    def test_says_nothing_rather_than_guessing(self):
        assert parse_resolution("Some Title With No Numbers") is None
        assert parse_print("Some Title With No Numbers") is None


class TestMatching:
    """Our own "every word" filter, so sites that match loosely behave like ones
    that do not."""

    def test_every_word_must_appear(self):
        assert matches_all_words("Ubuntu 24.04 LTS Desktop", "ubuntu desktop")
        assert not matches_all_words("Ubuntu 24.04 LTS Desktop", "ubuntu server")

    def test_case_and_separators_do_not_matter(self):
        assert matches_all_words("Ubuntu.24.04.LTS", "UBUNTU lts")

    def test_accents_and_apostrophes_are_folded(self):
        assert matches_all_words("Zoë Pérez 2001", "zoe perez")
        assert matches_all_words("Don't Wake The Harbour", "dont wake")

    def test_a_word_may_span_joined_parts_of_a_title(self):
        assert matches_all_words("Harbour-Light Comes Home", "harbourlight")

    def test_an_empty_query_matches_everything(self):
        assert matches_all_words("Anything At All", "")


class TestDates:
    def test_one_format_for_every_site(self):
        assert format_date("2026-06-17") == "Jun 17, 2026"

    def test_passes_through_what_it_cannot_read(self):
        for value in ("", None, "?"):
            assert format_date(value) in (value, "", None, "?")


class TestSmartTvRating:
    """The rating shown beside a result: will this play on a TV without transcoding.

    Only DD+ 5.1 and AC-3 5.1 earn a rating at all - those are the two a TV decodes
    itself. Everything else is deliberately unrated rather than rated badly."""

    def test_a_small_file_with_tv_audio_rates_best(self):
        rating, _ = from_name("Some.Film.2020.1080p.WEB-DL.DDP5.1.H264", "movie", "2.0 GB")
        assert rating["tier"] == "best"
        assert "DD+ 5.1" in rating["reason"]

    def test_a_rating_read_from_the_name_says_where_it_came_from(self):
        rating, _ = from_name("Some.Film.2020.1080p.WEB-DL.DDP5.1.H264", "movie", "2.0 GB")
        assert rating["checked"] == "name"

    def test_a_large_file_drops_below_best(self):
        rating, _ = from_name("Some.Film.2020.2160p.BluRay.DDP5.1.HEVC", "movie", "25 GB")
        assert rating["tier"] == "recommended"
        assert "6 GB or more" in rating["reason"]

    def test_a_tv_episode_is_rated_without_weighing_it(self):
        rating, _ = from_name("Some.Show.S01E02.1080p.WEB-DL.AC3.5.1", "tv", "1.2 GB")
        assert rating["tier"] == "best"
        assert "size not checked" in rating["reason"]

    def test_audio_a_tv_cannot_decode_is_left_unrated(self):
        # The name does say what the audio is, so there is nothing to learn from the
        # details either - it simply is not one of the two that qualify
        rating, needs_details = from_name("Some.Film.2020.1080p.WEB-DL.H264.AAC", "movie", "2.0 GB")
        assert rating is None
        assert needs_details is False

    def test_a_name_that_does_not_say_asks_for_the_details(self):
        rating, needs_details = from_name("Some.Film.2020.1080p", "movie", "2.0 GB")
        assert rating is None
        assert needs_details is True

    def test_something_that_is_not_video_is_never_rated(self):
        rating, needs_details = from_name("Some Application 2024 x64 DDP5.1", "app", "500 MB")
        assert rating is None
        assert needs_details is False
