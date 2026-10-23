# Marquo

**Search every torrent site at once.**

Search several torrent sites at once (currently **1337x**, **The Pirate Bay**, **YTS** and **Nyaa**), see detailed torrent info in one merged list, and copy magnet links to the clipboard, from a web UI (React + TypeScript + MUI) over a small Python API.

## Contents

- [What this is, and what it is not](#what-this-is-and-what-it-is-not)
  - [Choosing indexers](#choosing-indexers)
- [Features](#-features)
- [Project layout](#-project-layout)
- [Installation](#-installation)
- [Usage](#-usage)
- [Tests](#-tests)
- [Adding a site](#-adding-a-site)
- [Notes](#-notes)
- [Built with AI](#-built-with-ai)
- [Attribution](#-attribution)
- [License](#-license)

## What this is, and what it is not

Marquo is a **metadata search client**. It queries torrent indexers, reads the listings
they return, and shows them in one list. That is the whole of it.

- **It searches metadata only. It hosts no content.** No media, no `.torrent` files and no
  user uploads are stored by this project or by anyone running it.
- **It distributes no torrents.** A magnet link is a hash and a name. Marquo shows you the
  one the indexer published; it does not create, seed or serve anything.
- **It operates no trackers.** There is no tracker here, and the project runs no
  infrastructure of any kind.
- **It circumvents no access controls.** There is no DRM handling, no decryption, no
  paywall bypass and no authentication bypass anywhere in this codebase. It reads pages
  that are already public.
- **Which indexers it searches is configuration, not code.** Nothing in this codebase
  decides the list: it comes from your `indexers.json`, and you can supply your own
  indexer modules and have them loaded instead of, or alongside, the bundled ones. Some
  are bundled so that a fresh clone works, and you can disable or replace every one of
  them without touching the app.
- **You are responsible for how you use it.** What an indexer returns, and whether
  fetching it is lawful where you live, is your responsibility and nobody else's. This
  project is **not affiliated with any indexer**, endorses none of them, and makes no
  claim about the legality of anything they list.

There is no hosted instance, and there will not be one. You run it yourself or you do not
run it.

Not everything an indexer lists is unlawful to fetch, and for some things BitTorrent is
the publisher's own preferred channel: Ubuntu puts its images on releases.ubuntu.com as
torrents, the Internet Archive serves archive.org items the same way, and CC BY material
and the datasets on academictorrents.com are meant to be mirrored.

### Choosing indexers

Copy `indexers.example.json` to `indexers.json` and list the ids you want, in the order
their results should be interleaved:

```json
{ "enabled": ["1337x", "piratebay"], "pluginDirs": ["~/my-indexers"] }
```

`indexers.json` is not committed, because which sites you search is your business and not
this repository's. With no such file the app uses every module it can find.

To add one of your own, write a module against the contract at the top of
`sources/__init__.py` - `ID`, `NAME`, `BASE_URL`, `CATEGORIES`, `DETAIL_PATH`, `search()`
and `get_details()` - and either drop it in `sources/` or put it in a directory named in
`pluginDirs` (or `MARQUO_INDEXER_DIR`). A plugin whose `ID` matches a bundled module
replaces it. Nothing needs to be registered anywhere else; the API and the UI pick it up.

There is an Android build of Marquo, which is not published. It works the same way but
declares its list in one file rather than discovering modules, because Metro bundles
everything at build time and a phone has no directory to scan.


## 📦 Features
- Home screen: the Marquo banner, then 1337x's 12 featured movies and 12 most popular TV shows, with poster, print (WEB-DL, BluRay…) and resolution. Fetched once a day and saved to `data/featured.json`; reloads read the file
- **All images go through the server** (`/api/image`), so posters and screenshots show even when the browser can't reach torrent sites or image hosts (ad blockers, Safe Browsing, hotlink rules, network blocks)
- Real posters from IMDb ids (via metahub, the public poster service Stremio uses), so Pirate Bay items get posters too
- One upload date format for every site: `Jun 17, 2026`, and one size unit: GB / MB (The Pirate Bay's GiB sizes are converted)
- Quick animations: dialogs fade in and out, phone sheets slide up and down, results and cards ease in, buttons dip when pressed, the copied tick pops (all off when the system asks for reduced motion)
- **Phones**: results as cards with icon buttons (two columns on tablets), dialogs as bottom sheets you can swipe down, and a Search pill at the bottom centre. It opens a full-page search with the keyboard up, Clear + Search at the bottom (3 characters minimum), and goes back to the pill once results are in
- **Smart-TV rating**: names turn green (Best / Recommended / Safe / OK) for releases with DD+ (E-AC-3) 5.1 or AC-3 5.1 audio. Best = that audio and a movie under 6 GB, or any TV show. Read from the torrent's details when the name doesn't say; hover a green name for the reason
- **Details dialog** for any result or card: the torrent's own page is read from its site and analyzed into overview, Movie/Show info, Video, Audio, Subtitles, Release, Software, System requirements, Music, Book, screenshots, files and reference links (IMDb, TMDB, Steam…), with warnings for suspicious files
- One search across every site, results merged into a single table with a **Source** column
- "All of my words" matching on every site: a result is kept only if its title contains every search word
- A colored category icon before each title: Movie, TV, Game, Application, Book, Music, Adult (18+, the only red one), Other
- Filters (in a dialog): which sites to search, category, sort field and order, hide dead torrents, hide sensitive results
- **Sensitive filter**, on by default: Adult (18+) results are hidden, and so is anything whose name reads as explicit (nudity, sex, porn, orientation and fetish terms, adult studios), because sites file plenty of explicit releases under Movies, Video or Other. Turn it off in Filters to search 18+; the Adult category and a chip under the search bar follow it
- Click a column header (Name, Size, Seeds, Leeches, Uploaded) to sort: descending → ascending → default; column widths stay fixed
- Pagination of the merged results (20 / 50 / 100 rows per page). Phones scroll endlessly instead: 10 more cards are added as you near the end, and sorting and filters still apply to every result
- Title, size, seeds, leeches, uploader & upload date
- Copy magnet links to clipboard (the red-and-silver magnet button, with a confirmation beep), open them in your torrent client, **download a .torrent file** (converted from the magnet by [magnet2torrent.com](https://magnet2torrent.com/); rarely shared torrents can take a few minutes)
- Real URLs (React Router): `/`, `/search?q=…&page=…`, and `…/t/<site>/<id>` for a details dialog, so Back, reload and shared links all work
- **Backup mirrors**: if a site's main address fails (can't connect, blocked, unexpected HTTP status) or returns nothing, the same request is retried on its backup, and the UI says which mirror answered
- Screenshots linked from descriptions (pixhost, imgbox, ibb, trafficimage, imagetwist…) are opened on their host and shown full size
- Bypass Cloudflare's basic challenge with `cloudscraper`

## 🗂️ Project layout
| Path | What it is |
|---|---|
| `sources/` | One module per torrent site, plus the registry (`sources/__init__.py`) |
| `sources/x1337.py` | 1337x - scrapes the HTML search pages; magnet fetched from the detail page on demand. Backup: www.1337xx.to (same layout) |
| `sources/yts.py` | YTS - the site's own public JSON API, movies only. One row per quality, since that is the choice being made. Off by default; tick it in Filters. Main address `yts.lt`, because `yts.mx` does not resolve on many networks |
| `sources/nyaa.py` | Nyaa - anime and the Asian media around it, scraped from its result table. Its RSS would need an XML parser the project doesn't carry |
| `sources/piratebay.py` | The Pirate Bay - calls the apibay.org JSON API the site itself uses; magnet built from the info hash. Backup: piratebay.live (classic HTML layout, own parser) |
| `sources/matching.py` | The shared "all of my words" filter applied to every site's results |
| `sources/release.py` | Reads title, year, episode, print and resolution out of release names |
| `sources/analyze.py` | Site-agnostic details analyzer: categorizes a torrent and organizes its description, files and images |
| `sources/images.py` | Opens image-host pages linked from descriptions and returns the real images |
| `sources/image_proxy.py` | Fetches pictures for the browser (`/api/image`): public http(s) images only, size-capped, cached |
| `sources/dates.py` | Reads every site's date format and writes `Jun 17, 2026` |
| `sources/torrent_file.py` | Magnet → .torrent through magnet2torrent.com (same calls as its own page) |
| `sources/compat.py` | Smart-TV rating rules (audio mandatory, size rule for movies), from names or details |
| `sources/base.py` | Shared fetching (status checks, Cloudflare detection) and `first_working()`, the mirror fallback |
| `server.py` | Flask JSON API used by the web UI (`/api/config`, `/api/search`, `/api/details`, `/api/compat`, `/api/magnet`, `/api/torrent-file`, `/api/featured`, `/api/image`) |
| `src/` | React web UI (Vite proxies `/api` to `server.py`); routes in `src/router.tsx`, pages in `src/pages/` |
| `src/lib/sensitive.ts` | The sensitive filter: the Adult kind plus the word list matched against release names |
| `src/components/Logo.tsx` | The Marquo mark (a cinema marquee) and wordmark; `public/favicon.svg` is the same drawing |
| `src/components/HomeBanner.tsx` | The lit marquee board over the home screen |
| `src/lib/seo.ts` | Per-route title, description and canonical (the app routes on the client) |
| `public/_headers`, `public/_redirects` | Cloudflare Pages: caching, security headers and the SPA fallback |
| `src/theme.ts` | The MUI theme: all styling and theming (brand, neutrals, light / dark schemes, category and source colors, component defaults) |

## 🔧 Installation
```bash
git clone https://github.com/sameerhaq273/Marquo.git
cd Marquo
python -m venv .venv
.venv/Scripts/activate        # Windows; on macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt
npm install
```

## 🚀 Usage

### Web UI
Run the API and the dev server in two terminals:
```bash
python server.py
```
```bash
npm run dev
```
Then open http://localhost:5173.

Use `python server.py --mock` to work on the UI with sample data and no network access.

## 🧪 Tests

Two runners, because there are two languages. Both are fast and neither touches a
torrent site: the API tests run the server in mock mode.

```bash
npm test          # the TypeScript side (vitest)
npm run test:py   # the Python side (pytest), needs the venv active
npm run test:all  # both
```

What they cover: the pure logic on each side - release-name parsing, dates, the
smart-TV rating, the "every word" matcher, the sensitive filter, the saved-filter
migration, size and number formatting - plus the HTTP surface and its path guards, the
indexer discovery and plugin loading, and a regression test for every bug found in
review, each one naming the behaviour it pins.

Deliberately not covered: component rendering and end-to-end flows. Both need a browser
harness to say anything the type checker and a careful read do not, and neither has
earned that yet.

Fixture names are invented. A real title in a test file is what got youtube-dl taken
down in 2020, and `scripts/release-audit` checks for them.

## ➕ Adding a site
1. Create `sources/<site>.py` defining `ID`, `NAME`, `BASE_URL`, `CATEGORIES` and `search(query, category=None)`.
   Each result needs a `kind` (the site's category mapped to `movie`, `tv`, `game`, `app`, `book`, `music`, `adult` or `other`).
   Define `DETAIL_PATH` (regex for the site's detail paths) and `get_details(path)`, which returns the raw facts
   from the torrent's detail page or API (title, description text, info pairs, images, links, files, magnet), skipping ads.
   `sources/analyze.py` turns that into the details dialog, the same way for every site.
   If results don't include a magnet, also define `get_magnet(path)`.
   Optionally define `featured()` to contribute home screen cards.
   See the docstring in `sources/__init__.py` for the exact result fields.
   For backups, list them as mirrors and route each public function through `first_working()` from `sources/base.py`
   (see `x1337.py` for a same-layout mirror, `piratebay.py` for a mirror with a different layout). Public functions take `notes=None`.
2. Add the module to `SITES` in `sources/__init__.py`.

The API and the web UI (source filter, Source column, categories) pick it up automatically.

## 📌 Notes
- A source can start unchecked: add its id to `OFF_BY_DEFAULT` in `src/lib/filters.ts` and bump `FILTERS_VERSION`, which adds it to saved filters once without disturbing the sites someone turned off themselves. YTS is off this way.
- Mirrors can be changed with environment variables: `YTS_BASE_URL`, `YTS_FALLBACK_URLS`, `NYAA_BASE_URL`, `NYAA_FALLBACK_URLS`, `SCRAPER_BASE_URL` (1337x main, default `https://1337x.la`), `SCRAPER_FALLBACK_URLS` (comma-separated, default `https://www.1337xx.to`), `PIRATEBAY_BASE_URL`, `PIRATEBAY_API_URL` and `PIRATEBAY_FALLBACK_URLS` (default `https://piratebay.live`).
- Backups are only contacted when the main site fails or returns nothing; a genuinely empty search also asks the backup before giving up.
- 1337x results are collected from the first 5 search pages (up to 100); The Pirate Bay returns up to 100 in one go.
- 1337x's own search matches *any* word, so for multi-word searches it is sent the longest word and our filter keeps titles with all of them (5–13× more matches than sending the whole phrase).
- Featured cards are saved to `data/featured.json` once per day. If the day's refresh fails, the last saved cards are shown with a notice and the refresh is retried every 30 minutes. Delete the file to force a refresh.
- Icons are Material Symbols Rounded, outlined, loaded from Google Fonts with only the icons in use; add new icon names to the `icon_names` list in `index.html` (alphabetical).
- Torrent details are cached for 10 minutes. Descriptions garbled by double encoding ("PÃ©rez") are repaired automatically.
- The sensitive filter runs in the browser on the results the API returns, like hiding dead torrents does; the server is unchanged. Its word list is `PREFIXES` / `WORDS` / `PHRASES` in `src/lib/sensitive.ts`. Names are flattened first (lower case, every separator to a space), so `Some.Title.XXX.1080p` and `strap_on` match as words. Terms ordinary enough to appear in an everyday title (`sex`, `naked`, `adult …`, `hard core`) are deliberately left out, so ordinary releases that happen to contain them are not swept up; `sexy`, `sexual`, `sex tape` and the orientation terms are in. Nothing disappears silently either way: the result count reads "187 of 200".
- If one site fails or has no matching category, the others still return results and the UI shows a notice.
- Works on Windows, Linux, and macOS.

## 🤖 Built with AI

Most of this was written with Claude, directed and reviewed by me. The commit messages
say what changed and why, including the mistakes - a scraper that went quiet when a site
changed its layout, a size filter that silently matched nothing, a licence notice that
should have been here from the start.

Read it before you run it, the way you would with any code you did not write yourself.
The tests are there to help you: `npm run test:all`.

## 📄 Attribution

Marquo began as a derivative of [1337x_Scrapper](https://github.com/PyFolk-Devs/1337x_Scrapper)
(MIT), a single-file command-line tool. That file is no longer here, but the function
that reads 1337x's results table still comes from it. [NOTICE](NOTICE) says exactly
which part and carries their copyright and licence, as MIT requires.

## ✅ License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

AGPL because this is a network-facing program: anyone who runs a modified copy and lets
other people reach it has to offer them the source for that copy.
