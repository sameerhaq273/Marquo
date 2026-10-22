---
name: release-readiness
description: Audit this repository for open-source release readiness. Checks the full git history, not just the working tree, for secrets, personal data and copyrighted titles, and checks the licence, README positions, indexer configuration, monetization and public-instance artifacts. Reports every check as PASS / FAIL / N-A with file:line evidence and one verdict line, READY or NOT READY. Use when preparing to publish, before creating the public repository, after rewriting history, or whenever the release criteria are changed. Read-only - it never edits files, rewrites history or pushes.
---

# Release readiness

Run the audit and show the report:

```bash
node .claude/skills/release-readiness/audit.mjs
```

To include another checkout in the same run - the Android app, say - pass its path.
It is not committed anywhere, because a machine-specific path is itself the kind of
thing blocker 2 is looking for:

```bash
MARQUO_EXTRA_REPOS="../marquo-mobile" node .claude/skills/release-readiness/audit.mjs
```

Exit code is 1 when any blocker fails, so this also works as a hook or a CI step.

## What to do with the output

Report it as printed. Do not fix anything as part of running it, and in particular
**do not rewrite git history** - if history is the problem, say so and lay out the
choice (below) rather than acting.

## Reading a result

Every check reports one of three states:

| | |
|---|---|
| **PASS** | the criterion is met |
| **FAIL** | the criterion is not met; evidence follows as `file:line` or `commit path` |
| **N-A** | the check could not run here, for example a path that is not a git repository |

A **blocker** (`B1`-`B9`) failing means NOT READY. A **should** (`S1`-`S6`) failing is
reported but does not block.

`B9` is the odd one: it checks this skill's own committed files for the identity strings,
in the tree and in history. `ignorePaths` excludes this directory from every other scan,
so without `B9` it is the one committed place an identifier could sit unseen - and that is
not hypothetical, it is where one was found.

History evidence is printed as `<commit> <path>` because the line no longer exists in
the working tree - that is the point of the check. A secret deleted in a later commit
is still published the moment the repository goes public.

A commit marked **not on HEAD** is reachable only from some other ref, which after a
history rewrite is almost always a recovery tag. It is still a real finding, since
pushing that tag would publish it, but it goes when the tag does. To see what a reader
of the published repository actually gets, clone the remote and run the audit there.

## The identity file

Names, usernames and a work email domain are **not** in `criteria.mjs`. That file is
committed, and this skill's own directory is excluded from every scan, so anything
written there would be published and invisible to the audit at the same time - which
is exactly how the work domain the check exists to remove first came to be shipped
inside the check.

They live in `identity.local.json`, which is gitignored. `identity.example.json` next
to it documents the shape. Copy, fill in, and the audit picks it up; the report's
header says whether it found one.

Without it the content patterns still run, but the audit has not been told who the
author is supposed to be, so `B2` narrows to content only and `S4` reports N-A. It
says so rather than quietly passing. Anyone who is not the author sees this state,
and for them it is the right one.

## Tuning the criteria

Everything the audit looks for lives in `criteria.mjs`, next to this file. It is data,
with comments. Adding a pattern, allowing a false positive, or adding a repository
needs no change to `audit.mjs`.

The two fields worth knowing:

- `ignorePaths` - never scanned. This skill's own directory is excluded, because a rule
  that names a secret pattern would otherwise report itself.
- `*.allow` - matches that are known not to be problems. Keep these narrow. A broad
  allow rule is how a real key gets through.

When a check fails on something that is genuinely fine, add to the relevant `allow`
list rather than deleting the pattern: the pattern is still right for the next case.

## If history is the problem

Both options destroy the current commit objects. Neither is something to run from an
audit, and the audit will not.

**Fresh history** - squash everything into one commit and publish that. Simple,
leaves nothing to miss, and loses the development record. Right when the history has
no value to anyone else, which for a personal project it usually does not.

**Filter the history** - `git filter-repo` to strip the offending paths, strings or
author identities and rewrite every commit. Keeps the record, but every commit hash
changes, anything already pushed anywhere must be force-replaced, and it is easy to
miss a string that appears in a form you did not search for.

Prefer fresh history unless the development record is worth preserving to someone
other than you.

## What it does not check

Judgement, mostly. It cannot tell whether a README assertion is honest, whether an
indexer config ships with something unlawful in it, or whether a title in a fixture is
actually copyrighted. It checks that the words are there and the shapes are right.
Read the diff before publishing.
