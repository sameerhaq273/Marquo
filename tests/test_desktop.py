"""The Windows app's bridge from the page to the system."""
import os

import pytest

from desktop import Api


@pytest.fixture
def opened(monkeypatch):
    calls = []
    monkeypatch.setattr(os, "startfile", calls.append, raising=False)
    return calls


def test_a_magnet_goes_to_the_torrent_client(opened):
    assert Api().open_magnet("magnet:?xt=urn:btih:abc") is None
    assert opened == ["magnet:?xt=urn:btih:abc"]


def test_nothing_but_a_magnet_is_ever_opened(opened):
    # startfile runs whatever it is given, and the page's content comes from torrent sites
    for url in ("https://example.com", r"C:\Windows\System32\calc.exe", "file:///C:/x.exe", "", None):
        assert Api().open_magnet(url)
    assert opened == []


def test_no_torrent_client_is_reported_rather_than_raised(monkeypatch):
    def no_handler(_):
        raise OSError("no application is associated")

    monkeypatch.setattr(os, "startfile", no_handler, raising=False)
    assert "torrent client" in Api().open_magnet("magnet:?xt=urn:btih:abc")
