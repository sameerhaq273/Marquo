"""The HTTP surface, driven in mock mode so no test touches a torrent site."""
import os

import pytest

os.environ["SCRAPER_MOCK"] = "1"


@pytest.fixture(scope="module")
def client():
    import server
    server.app.config["TESTING"] = True
    return server.app.test_client()


class TestConfig:
    def test_health_names_the_indexers_this_install_searches(self, client):
        body = client.get("/healthz").get_json()
        assert body["ok"] is True
        assert body["sources"]

    def test_config_reports_sources_and_categories(self, client):
        body = client.get("/api/config").get_json()
        assert body["sources"] and body["categories"]
        assert all({"id", "name", "url"} <= set(s) for s in body["sources"])
        assert body["mock"] is True


class TestSearchValidation:
    def test_an_empty_query_is_refused(self, client):
        assert client.get("/api/search?q=").status_code == 400

    def test_an_unknown_source_is_refused(self, client):
        assert client.get("/api/search?q=ubuntu&sources=no-such-site").status_code == 400

    def test_an_unknown_category_is_refused(self, client):
        assert client.get("/api/search?q=ubuntu&category=nonsense").status_code == 400

    def test_a_real_search_answers_with_results(self, client):
        body = client.get("/api/search?q=ubuntu").get_json()
        assert body["results"]
        assert all({"title", "source", "path", "size", "seeds"} <= set(r) for r in body["results"])


class TestPathGuards:
    """Every detail route takes a path from the query string. The site's own DETAIL_PATH
    is what stops that being any path at all."""

    @pytest.mark.parametrize("route", ["/api/details", "/api/compat", "/api/magnet"])
    @pytest.mark.parametrize("path", [
        "/../../etc/passwd",
        "/torrent/1/x/../../admin",
        "https://example.com/evil",
        "//example.com/evil",
        "",
    ])
    def test_a_path_the_site_would_never_produce_is_refused(self, client, route, path):
        response = client.get(route, query_string={"source": "1337x", "path": path})
        assert response.status_code == 400

    @pytest.mark.parametrize("route", ["/api/details", "/api/compat"])
    def test_an_unknown_source_is_refused(self, client, route):
        response = client.get(route, query_string={"source": "no-such-site", "path": "/torrent/1/x/"})
        assert response.status_code == 400


class TestTorrentFile:
    def test_something_that_is_not_a_magnet_is_refused(self, client):
        response = client.post("/api/torrent-file", json={"magnet": "https://example.com/evil"})
        assert response.status_code == 400

    def test_a_missing_body_is_refused_rather_than_crashing(self, client):
        assert client.post("/api/torrent-file").status_code == 400

    def test_an_invalid_conversion_id_is_refused(self, client):
        assert client.get("/api/torrent-file/status?gid=../../etc").status_code == 400

    def test_an_unknown_download_token_has_expired(self, client):
        assert client.get("/api/torrent-file/download/nosuchtoken").status_code == 404


class TestImageRoute:
    def test_a_local_address_is_refused(self, client):
        assert client.get("/api/image", query_string={"url": "http://127.0.0.1/a.png"}).status_code == 400

    def test_a_non_http_scheme_is_refused(self, client):
        assert client.get("/api/image", query_string={"url": "file:///etc/passwd"}).status_code == 400


class TestCaches:
    """Regression: the compat cache had two writers and only one of them trimmed, so
    browsing detail pages grew it without limit."""

    def test_both_writers_are_bounded(self):
        import server
        source = open("server.py", encoding="utf-8").read()
        assert source.count("len(_compat_cache) > COMPAT_MAX") == 2
        assert isinstance(server.COMPAT_MAX, int)
