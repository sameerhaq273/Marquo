"""Marquo as a Windows app: server.py and the built UI, in a window of their own.

The window is the system's WebView2. It talks to the same Flask app as the dev setup, here on
loopback and on one port for everything. Packaged by packaging/windows/build.ps1.

Run from a checkout (after `npm run build`):  python desktop.py
"""
import ctypes
import os
import sys
import threading
from pathlib import Path

APP_DIR = Path(os.environ.get("APPDATA") or Path.home()) / "Marquo"
#: The UI lives in the bundle when packaged, in the checkout's build output otherwise
BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))

#: Fixed, because browser storage belongs to the origin: on a new port every launch, filters
#: and theme would start over. Anything else on it just costs them for that one run.
PORT = 48620
TITLE = "Marquo"
ERROR_ALREADY_EXISTS = 183
SW_RESTORE = 9


class Api:
    """Called from the page as window.pywebview.api."""

    def open_magnet(self, url):
        """Hands a magnet to the torrent client; returns an error message, or None."""
        if not str(url).startswith("magnet:"):
            return "That isn't a magnet link."
        try:
            os.startfile(url)
        except OSError:
            return "No torrent client is set up to open magnet links."
        return None


def _already_running():
    """True when another copy has the window open, which is then brought to the front."""
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    # Held until this process exits, so it needs no cleanup
    kernel32.CreateMutexW(None, False, "Marquo-SingleInstance")
    if kernel32.GetLastError() != ERROR_ALREADY_EXISTS:
        return False
    window = user32.FindWindowW(None, TITLE)
    if window:
        user32.ShowWindow(window, SW_RESTORE)
        user32.SetForegroundWindow(window)
    return True


def _serve(app):
    from werkzeug.serving import make_server

    try:
        server = make_server("127.0.0.1", PORT, app, threaded=True)
    except (OSError, SystemExit):  # werkzeug exits rather than raising when the port is taken
        server = make_server("127.0.0.1", 0, app, threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server.server_port


def main():
    if _already_running():
        return
    APP_DIR.mkdir(parents=True, exist_ok=True)
    if getattr(sys, "frozen", False):
        # A windowed app has no console, so what would go there is kept for troubleshooting
        sys.stdout = sys.stderr = open(APP_DIR / "marquo.log", "w", encoding="utf-8", buffering=1)

    # Program Files is read-only: everything the app saves goes under the user's profile.
    # Set before importing server.py and sources/, which read these once.
    os.environ.setdefault("DATA_DIR", str(APP_DIR / "data"))
    os.environ.setdefault("MARQUO_INDEXERS", str(APP_DIR / "indexers.json"))
    os.environ["WEB_DIR"] = str(BUNDLE_DIR / "dist")

    import webview

    from server import app

    port = _serve(app)
    webview.settings["ALLOW_DOWNLOADS"] = True  # .torrent files, through a Save dialog
    webview.create_window(TITLE, f"http://127.0.0.1:{port}/", width=1280, height=820, min_size=(400, 600), js_api=Api())
    webview.start(private_mode=False, storage_path=str(APP_DIR / "webview"))
    # Not sys.exit: it would wait for any search still running on the worker threads
    os._exit(0)


if __name__ == "__main__":
    main()
