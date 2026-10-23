# Contributing

This is a personal project published so people can read it and run it themselves. Pull
requests are welcome; so is forking it and going your own way, which the licence exists
to protect.

Before spending real time on something, open an issue. It is a short conversation that
saves you writing code I might not merge.

## Running it

```bash
git clone https://github.com/sameerhaq273/Marquo.git
cd Marquo
python -m venv .venv
.venv/Scripts/activate        # Windows; on macOS or Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
npm install
```

Two terminals:

```bash
python server.py    # the API on :5000
npm run dev         # the UI on :5173
```

`python server.py --mock` serves sample data, so you can work on the interface with no
network and without touching an indexer.

## Tests

```bash
npm run test:all    # both suites
npm test            # the TypeScript side
npm run test:py     # the Python side
```

CI runs all of this on your pull request, plus the lint and the readiness audit, so you
will see the same result either way. Running it locally first is faster.

A test should say what behaviour it pins, not what line it covers. Several here exist
because something was once wrong: the year filter that silently matched nothing, the
image cache that counted a picture twice, the scraper that went quiet when a site
changed its layout. If you fix a bug, leave the test that would have caught it.

## Adding an indexer

You probably do not need to change this repository at all. The indexer list is
configuration: write a module against the contract at the top of `sources/__init__.py`,
put it in a directory of your own, and point `pluginDirs` or `MARQUO_INDEXER_DIR` at it.
Nothing needs registering and nothing needs merging.

I am unlikely to merge new indexers into the repository itself. Shipping a longer list of
sites changes what this project is, and the plugin mechanism exists precisely so that
choice stays with whoever runs it.

## What makes a pull request easy to merge

- One thing per pull request.
- A commit message that says why, not what. The diff already says what.
- Tests for new logic, and the test that would have caught the bug you fixed.
- Match the surrounding code: comments explain reasoning the code cannot, naming follows
  what is already there, no new dependency for a few lines of work.
- No em dashes.

## What will not be merged

- Anything that hosts, serves or proxies content, or that would turn this into a service.
- Anything that circumvents an access control: DRM, a paywall, a login, a rate limit.
- Ads, donate links, affiliate codes, premium tiers, analytics, telemetry or crash
  reporting. The readiness audit fails the build for most of these, and the README says
  the project does none of them.
- Deployment configuration for a public instance. There is not going to be one.

## Licence

Contributions are offered under the same licence as the project,
[AGPL-3.0](LICENSE). There is no contributor agreement to sign. Part of
`sources/x1337.py` is MIT and carries its own notice; see [NOTICE](NOTICE) before
reworking that function.
