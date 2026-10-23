# Security

## Reporting something

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: the **Security** tab, then **Report a
vulnerability**. It opens a thread only you and I can read, so the problem can be fixed
before it is described in public.

Tell me what you did, what happened, and why it matters. A short description of the
mechanism beats a scanner's output.

This is one person's side project, so there is no bounty and no response-time promise. I
will reply when I see it.

## What counts

This project runs on a machine you control and talks to indexers over the network, so the
interesting problems are about what it does with what those sites send back, and about
what a page in your browser can reach.

Worth reporting:

- The image proxy (`/api/image`) fetching something it should refuse. It resolves every
  address and rejects anything that is not global, re-checking on each redirect, and it
  caps size and content type. A way past that is a real finding.
- A detail route (`/api/details`, `/api/compat`, `/api/magnet`) reaching a path the site's
  own `DETAIL_PATH` should have blocked.
- Anything a scraper returns that executes, escapes or is rendered as markup, rather than
  being treated as text.
- A path that writes or reads a file outside the project directory.
- A plugin or configuration file leading to code execution that an operator would not
  expect from "pick which indexers to search".

## What does not count

- That the project searches torrent indexers. That is the project.
- That an indexer serves something unpleasant or untrue. The README is explicit: indexers
  are third parties, and what they return is their doing.
- That the Flask development server is not a hardened production server. It is not meant
  to be, there is no hosted instance, and there is not going to be one.
- That requests go out over your own connection and your IP is visible to the indexers you
  query. That is how it works without a backend, and it is documented.
- Dependency advisories with no path to exploitation here. Please say how it is reachable.

## Known limitation

The image proxy resolves a hostname to check it is public, and the request then resolves
it again. DNS that changes between the two could still reach a private address. The
limit is marked in `sources/image_proxy.py`, with a note on what closing it would take:
pinning the checked address through a custom adapter and handling SNI and certificate
verification by hand, which is a larger risk than the one it removes while this binds to
localhost. If you are running it somewhere reachable by other machines, that trade is no
longer the right one.
