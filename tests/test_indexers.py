"""Which indexers an install searches is its configuration, not this repository's."""
import json

import sources


class TestConfigLocation:
    """Regression: the path was relative, so starting the server from anywhere else
    silently ignored the file and fell back to every indexer."""

    def test_the_config_path_is_absolute(self):
        assert sources.INDEXERS_PATH.is_absolute()

    def test_it_is_found_next_to_the_project_not_the_working_directory(self):
        assert sources.INDEXERS_PATH.parent == sources._PROJECT_DIR


class TestDiscovery:
    def test_every_bundled_module_is_found_by_its_contract(self):
        available = sources.load_indexers({})
        assert available, "no indexer modules were discovered at all"
        for module in available.values():
            for attribute in ("ID", "NAME", "BASE_URL", "CATEGORIES", "DETAIL_PATH", "search", "get_details"):
                assert hasattr(module, attribute), f"{module.ID} is missing {attribute}"

    def test_helper_modules_are_not_mistaken_for_indexers(self):
        for helper in ("base", "analyze", "compat", "dates", "matching", "release"):
            assert helper not in sources.load_indexers({})

    def test_no_configuration_means_everything_in_a_stable_order(self):
        available = sources.load_indexers({})
        chosen = sources._select(available, {})
        assert [s.ID for s in chosen] == sorted(available)


class TestSelection:
    def test_the_config_decides_which_and_in_what_order(self):
        available = sources.load_indexers({})
        wanted = list(sorted(available))[:2][::-1]
        assert [s.ID for s in sources._select(available, {"enabled": wanted})] == wanted

    def test_an_id_nothing_provides_is_skipped_rather_than_breaking(self):
        available = sources.load_indexers({})
        known = next(iter(sorted(available)))
        chosen = sources._select(available, {"enabled": [known, "no-such-indexer"]})
        assert [s.ID for s in chosen] == [known]

    def test_an_empty_list_falls_back_to_everything(self):
        available = sources.load_indexers({})
        assert len(sources._select(available, {"enabled": []})) == len(available)


class TestPlugins:
    def test_a_module_from_outside_the_package_is_loaded_and_can_replace_a_bundled_one(self, tmp_path):
        plugin_dir = tmp_path / "indexers"
        plugin_dir.mkdir()
        (plugin_dir / "demo.py").write_text(
            'ID = "demo"\n'
            'NAME = "Demo"\n'
            'BASE_URL = "https://archive.org"\n'
            'CATEGORIES = {"movies": "movies"}\n'
            'DETAIL_PATH = __import__("re").compile(r"^/details/.+$")\n'
            "def search(query, category=None, notes=None):\n"
            "    return []\n"
            "def get_details(path, notes=None):\n"
            "    return {}\n",
            encoding="utf-8")
        available = sources.load_indexers({"pluginDirs": [str(plugin_dir)]})
        assert "demo" in available
        assert available["demo"].NAME == "Demo"

    def test_a_broken_plugin_does_not_take_the_app_down(self, tmp_path):
        plugin_dir = tmp_path / "indexers"
        plugin_dir.mkdir()
        (plugin_dir / "broken.py").write_text("this is not python(", encoding="utf-8")
        assert sources.load_indexers({"pluginDirs": [str(plugin_dir)]})

    def test_a_missing_plugin_directory_is_not_an_error(self, tmp_path):
        assert sources.load_indexers({"pluginDirs": [str(tmp_path / "nope")]})


class TestConfigReading:
    def test_a_missing_file_means_no_configuration_not_a_crash(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sources, "INDEXERS_PATH", tmp_path / "absent.json")
        assert sources.read_config() == {}

    def test_unreadable_json_is_ignored_rather_than_fatal(self, tmp_path, monkeypatch):
        path = tmp_path / "indexers.json"
        path.write_text("{ not json", encoding="utf-8")
        monkeypatch.setattr(sources, "INDEXERS_PATH", path)
        assert sources.read_config() == {}

    def test_a_json_value_that_is_not_an_object_is_ignored(self, tmp_path, monkeypatch):
        path = tmp_path / "indexers.json"
        path.write_text(json.dumps(["1337x"]), encoding="utf-8")
        monkeypatch.setattr(sources, "INDEXERS_PATH", path)
        assert sources.read_config() == {}

    def test_a_real_config_is_read(self, tmp_path, monkeypatch):
        path = tmp_path / "indexers.json"
        path.write_text(json.dumps({"enabled": ["piratebay"]}), encoding="utf-8")
        monkeypatch.setattr(sources, "INDEXERS_PATH", path)
        assert sources.read_config()["enabled"] == ["piratebay"]
