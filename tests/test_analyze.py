"""The analysis every site's details go through, whatever page they came from."""
from sources.analyze import analyze, detect_kind, fix_mojibake, format_bytes, parse_size


def fact(result, label):
    return next((f["value"] for f in result["facts"] if f["label"] == label), None)


def section_item(result, section_id, label):
    return next((i["value"] for s in result["sections"] if s["id"] == section_id
                 for i in s["items"] if i["label"] == label), None)


class TestSizes:
    def test_reads_decimal_and_binary_units(self):
        assert parse_size("2.2 GB") == 2_200_000_000
        assert parse_size("1 GiB") == 1024 ** 3
        assert parse_size("845.4 MB") == 845_400_000

    def test_unreadable_size_is_none_not_zero(self):
        assert parse_size("?") is None
        assert parse_size("") is None

    def test_format_drops_a_pointless_decimal(self):
        assert format_bytes(3_000_000_000) == "3 GB"
        assert format_bytes(1_400_000_000) == "1.4 GB"

    def test_format_keeps_bytes_for_small_values(self):
        assert format_bytes(512) == "512 B"
        assert format_bytes(None) is None


class TestSizeFact:
    """Regression: a list of files with unknown sizes summed to 0, and format_bytes(0)
    is "0 B" - which reads as a measurement rather than a gap. Nyaa returns every file
    with no size, so this was on screen."""

    def test_no_file_sizes_means_no_size_shown(self):
        result = analyze({"title": "Some Release 1080p",
                          "files": [{"name": "a.mkv", "size": None}, {"name": "b.mkv", "size": None}]})
        assert fact(result, "Size") is None

    def test_no_files_at_all_means_no_size_shown(self):
        assert fact(analyze({"title": "Some Release 1080p", "files": []}), "Size") is None

    def test_real_sizes_are_still_added_up(self):
        result = analyze({"title": "X", "files": [{"name": "a.mkv", "size": 2_000_000_000},
                                                  {"name": "b.mkv", "size": 1_000_000_000}]})
        assert fact(result, "Size") == "3 GB"

    def test_the_sites_own_size_wins(self):
        result = analyze({"title": "X", "size": "4.2 GB", "files": [{"name": "a.mkv", "size": None}]})
        assert fact(result, "Size") == "4.2 GB"


class TestAlbum:
    """Regression: _find answers with whichever key appears first, so asking for
    "album" or "title" together labelled a torrent with its track name."""

    def test_an_album_row_beats_a_title_row_above_it(self):
        result = analyze({"title": "Artist - Album Name", "kind": "music",
                          "description": "Title: Some Track\nAlbum: The Real Album\n",
                          "files": [{"name": "01.flac", "size": 1000}]})
        assert section_item(result, "music", "Album") == "The Real Album"

    def test_falls_back_to_the_name_when_nothing_is_listed(self):
        result = analyze({"title": "Artist - Album Name", "kind": "music",
                          "files": [{"name": "01.flac", "size": 1000}]})
        assert section_item(result, "music", "Album") == "Album Name"


class TestKind:
    def test_the_sites_own_category_is_trusted_first(self):
        assert detect_kind({"kind": "tv"}, {}) == "tv"
        assert detect_kind({"site_category": "Movies > HEVC/x265"}, {}) == "movie"
        assert detect_kind({"site_category": "Anime - English-translated"}, {}) == "tv"

    def test_falls_back_to_the_files_when_the_site_says_nothing(self):
        video = {"video": {"type": "video", "count": 1, "size": 2_000_000_000}}
        assert detect_kind({"title": "Some Film 2020"}, video) == "movie"
        assert detect_kind({"title": "Some Show S01E02"}, video) == "tv"

    def test_an_audiobook_is_a_book_not_music(self):
        audio = {"audio": {"type": "audio", "count": 9, "size": 500_000_000}}
        assert detect_kind({"title": "Some Title audiobook unabridged"}, audio) == "book"
        assert detect_kind({"title": "Some Artist - Album"}, audio) == "music"

    def test_knows_a_repack_from_an_application(self):
        disc = {"disc": {"type": "disc", "count": 1, "size": 40_000_000_000}}
        assert detect_kind({"title": "Some Game FitGirl Repack"}, disc) == "game"
        assert detect_kind({"title": "Some Suite 2024 x64"}, disc) == "app"


class TestWarnings:
    def test_program_files_in_a_film_are_called_out(self):
        result = analyze({"title": "Some Film 2020 1080p", "kind": "movie",
                          "files": [{"name": "movie.mkv", "size": 2_000_000_000},
                                    {"name": "setup.exe", "size": 400_000}]})
        assert any("program files" in w for w in result["warnings"])

    def test_an_installer_in_a_game_is_not_called_out(self):
        result = analyze({"title": "Some Game Repack", "kind": "game",
                          "files": [{"name": "setup.exe", "size": 4_000_000_000}]})
        assert not any("program files" in w for w in result["warnings"])

    def test_a_shortcut_is_called_out_even_in_a_game(self):
        result = analyze({"title": "Some Game Repack", "kind": "game",
                          "files": [{"name": "setup.exe", "size": 4_000_000_000},
                                    {"name": "readme.lnk", "size": 1000}]})
        assert any("shortcut" in w for w in result["warnings"])

    def test_a_film_hidden_inside_an_archive_is_called_out(self):
        result = analyze({"title": "Some Film 2020 1080p", "kind": "movie",
                          "files": [{"name": "film.rar", "size": 2_000_000_000}]})
        assert any("archive" in w for w in result["warnings"])

    def test_a_cinema_recording_is_called_out(self):
        result = analyze({"title": "Some Film 2024 HDCAM", "kind": "movie", "files": []})
        assert any("cinema" in w.lower() for w in result["warnings"])


class TestMojibake:
    def test_repairs_utf8_read_as_latin1(self):
        assert fix_mojibake("PÃ©rez") == "Pérez"

    def test_leaves_correct_text_alone(self):
        for text in ("Pérez", "Ubuntu 24.04", "", None):
            assert fix_mojibake(text) == text
