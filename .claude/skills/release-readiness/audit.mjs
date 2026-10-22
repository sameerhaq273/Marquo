#!/usr/bin/env node
/**
 * Marquo open-source readiness audit.
 *
 * Reads the rules in criteria.mjs, checks the repository against them, and prints a
 * report: every check as PASS, FAIL or N-A with file:line evidence, then one verdict
 * line. Exits 1 when any blocker fails, so it also works in a hook or a pipeline.
 *
 * It reads. It never edits a file, never rewrites history, never pushes.
 *
 * Usage:
 *   node audit.mjs
 *   MARQUO_EXTRA_REPOS="../marquo-mobile" node audit.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import criteria from './criteria.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')

const rx = (p, flags = 'i') => new RegExp(p, flags)
const anyMatch = (patterns, text) => patterns.some((p) => rx(p).test(text))

/**
 * Merge in the identifiers that are deliberately not committed.
 *
 * See criteria.mjs for why they are not: this file's directory is excluded from every
 * scan, so a name or a domain written in it would be published and unscannable at once.
 * A missing file is normal - for anyone who is not the author, it is the only state - so
 * it is not an error. What it is not is silent: the header says whether one was found,
 * and the identity checks report N-A without one instead of passing.
 */
const identity = (() => {
  const path = join(HERE, criteria.localIdentityFile)
  if (!existsSync(path)) return { loaded: false, allow: [], patterns: [], allowedEmails: [], forbiddenDomains: [] }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const list = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [])
    return {
      loaded: true,
      allow: list(raw.allow),
      patterns: list(raw.patterns),
      allowedEmails: list(raw.allowedEmails),
      forbiddenDomains: list(raw.forbiddenDomains),
    }
  } catch (e) {
    console.error(`could not read ${criteria.localIdentityFile}: ${e.message}`)
    process.exit(2)
  }
})()

criteria.personal.content = [...criteria.personal.content, ...identity.patterns]
criteria.personal.allow = [...criteria.personal.allow, ...identity.allow]
criteria.authors.allowedEmails = [...criteria.authors.allowedEmails, ...identity.allowedEmails]
criteria.authors.forbiddenDomains = [...criteria.authors.forbiddenDomains, ...identity.forbiddenDomains]

/** Whether the audit has been told who the author is supposed to be */
const knowsAuthor = criteria.authors.allowedEmails.length > 0

function git(repo, args, { max = 40 * 1024 * 1024 } = {}) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: max, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

// ------------------------------------------------------------------ gathering

function ignored(path) {
  return criteria.ignorePaths.some((p) => rx(p).test(path.replace(/\\/g, '/')))
}

/** Every tracked file's path and text, skipping what the rules exclude */
function workingTree(repo) {
  const listed = git(repo, ['ls-files']).split('\n').map((l) => l.trim()).filter(Boolean)
  const files = []
  for (const path of listed) {
    if (ignored(path)) continue
    const full = join(repo, path)
    try {
      if (!existsSync(full) || statSync(full).size > 2 * 1024 * 1024) continue
      const text = readFileSync(full, 'utf8')
      // A file with NUL bytes is binary whatever its extension says
      if (text.includes('\u0000')) continue
      files.push({ path, text })
    } catch {
      /* unreadable: nothing to scan */
    }
  }
  return files
}

/**
 * Every line ever added, across all branches, with the commit and file it came from.
 *
 * `git log -p` is the point of this: a secret deleted in a later commit is still in the
 * history, and still published the moment the repository goes public.
 */
function history(repo) {
  const raw = git(repo, ['log', '--all', '--full-history', '-p', '--no-color', '--format=%x00COMMIT%x00%H%x00%an%x00%ae%x00%cn%x00%ce%x00%s'])
  // --all on purpose: a tag or a stale branch publishes its commits just as surely as the
  // current one does. But a commit reachable only from some other ref is usually a local
  // safety tag from a history rewrite, which is a different problem from one on the branch
  // about to be pushed, so note which is which rather than reporting them identically.
  const onBranch = new Set(
    git(repo, ['rev-list', 'HEAD']).split('\n').map((l) => l.trim()).filter(Boolean),
  )
  const entries = []
  const commits = []
  const selfEntries = []
  let commit = null
  let path = null

  for (const line of raw.split('\n')) {
    if (line.startsWith('\u0000COMMIT\u0000')) {
      const [, , hash, an, ae, cn, ce, subject] = line.split('\u0000')
      commit = { hash: (hash || '').slice(0, 9), an, ae, cn, ce, subject, onBranch: onBranch.has(hash) }
      commits.push(commit)
      path = null
      continue
    }
    if (line.startsWith('+++ b/')) {
      path = line.slice(6).trim()
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++') && commit && path && path !== '/dev/null') {
      const entry = { commit: commit.hash, path, text: line.slice(1) }
      // The skill's own files are kept separately rather than dropped. ignorePaths exists
      // so a rule naming a pattern does not report itself, but that also made this
      // directory the one place a committed identifier was unscannable - which is where
      // one was found. B9 scans these with the identity patterns only, which cannot
      // self-match because they are not in any committed file.
      if (SELF_DIR.test(path.replace(/\\/g, '/'))) selfEntries.push(entry)
      if (ignored(path)) continue
      entries.push(entry)
    }
  }
  return { entries, commits, selfEntries }
}

/** This skill's own directory, the one place ignorePaths deliberately blinds the scan */
const SELF_DIR = /(^|\/)\.claude\/skills\/release-readiness\//

/** Files of this skill that a repository has committed, read without ignorePaths */
function selfFiles(repo) {
  const listed = git(repo, ['ls-files']).split('\n').map((l) => l.trim()).filter(Boolean)
  const files = []
  for (const path of listed) {
    if (!SELF_DIR.test(path.replace(/\\/g, '/'))) continue
    try {
      const text = readFileSync(join(repo, path), 'utf8')
      if (!text.includes('\u0000')) files.push({ path, text })
    } catch {
      /* unreadable: nothing to scan */
    }
  }
  return files
}

// -------------------------------------------------------------------- results

const results = []
function record(section, id, label, status, evidence = [], note = '') {
  results.push({ section, id, label, status, evidence, note })
}

function scanFiles(files, patterns, allow = []) {
  const hits = []
  for (const f of files) {
    const lines = f.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!anyMatch(patterns, line)) continue
      if (allow.length && anyMatch(allow, line)) continue
      hits.push({ where: `${f.path}:${i + 1}`, line: line.trim().slice(0, 140) })
    }
  }
  return hits
}

function scanHistory(entries, patterns, allow = []) {
  const hits = []
  for (const e of entries) {
    if (!anyMatch(patterns, e.text)) continue
    if (allow.length && anyMatch(allow, e.text)) continue
    hits.push({ where: `${e.commit} ${e.path}`, line: e.text.trim().slice(0, 140) })
  }
  return hits
}

// --------------------------------------------------------------------- checks

/**
 * Why the identity check failed, in a way that distinguishes the two causes.
 *
 * Commits off HEAD are almost always a recovery tag kept after a squash. They are a real
 * finding - pushing that tag would publish them - but they go when the tag does, which is
 * worth saying rather than leaving someone to wonder why a fresh history still fails.
 */
function identityNote(bad) {
  if (!bad.length) return ''
  const off = bad.filter((c) => !c.onBranch).length
  if (!off) return `${bad.length} commit(s) carry an identity outside the allowed list`
  if (off === bad.length) {
    return `${bad.length} commit(s) carry an identity outside the allowed list, none of them on HEAD - `
      + 'a tag or other ref is holding them; delete it and they go'
  }
  return `${bad.length} commit(s) carry an identity outside the allowed list (${off} not on HEAD, held by another ref)`
}

function auditRepo(name, repo) {
  const files = workingTree(repo)
  const { entries, commits, selfEntries } = history(repo)
  const S = `${name}`
  const text = (p) => files.find((f) => f.path === p)?.text ?? null

  // --- 1. secrets, in history as well as the tree
  // Both halves matter and for different reasons: history because a secret deleted in a
  // later commit is still published the moment the repo goes public, and the tree because
  // a secret staged but not yet committed is published by the very next commit.
  const secretPaths = [...new Set([...entries.map((e) => e.path), ...files.map((f) => f.path)])]
    .filter((p) => anyMatch(criteria.secrets.paths, p))
  const secretContent = [
    ...scanFiles(files, criteria.secrets.content, criteria.secrets.allow),
    ...scanHistory(entries, criteria.secrets.content, criteria.secrets.allow),
  ]
  record(S, 'B1', 'No secrets in git history or the tree',
    secretPaths.length || secretContent.length ? 'FAIL' : 'PASS',
    [...secretPaths.map((p) => ({ where: p, line: 'file of this type was committed at some point' })), ...secretContent])

  // --- 2. personal data
  const personalHits = [
    ...scanFiles(files, criteria.personal.content, criteria.personal.allow),
    ...scanHistory(entries, criteria.personal.content, criteria.personal.allow),
  ]
  const badIdentities = criteria.personal.checkCommitIdentities && knowsAuthor
    ? commits.filter((c) => [c.ae, c.ce].some((e) => e && !criteria.authors.allowedEmails.includes(e)))
    : []
  record(S, 'B2',
    knowsAuthor ? 'No personal data in git history or the tree' : 'No personal data in git history or the tree (content only)',
    personalHits.length || badIdentities.length ? 'FAIL' : 'PASS',
    [
      ...personalHits,
      ...badIdentities.slice(0, 6).map((c) => ({
        where: `${c.hash} (commit identity${c.onBranch ? '' : ', not on HEAD'})`,
        line: `${c.an} <${c.ae}> / committer <${c.ce}>`,
      })),
    ],
    knowsAuthor ? identityNote(badIdentities) : `no ${criteria.localIdentityFile}, so commit identities were not checked`)

  // --- 3. copyrighted titles where they do most harm
  const sensitive = files.filter((f) => anyMatch(criteria.copyrighted.scanPaths, f.path))
  const titleHits = scanFiles(sensitive, criteria.copyrighted.content, criteria.copyrighted.allow)
  record(S, 'B3', 'No real copyrighted titles in fixtures, samples or docs',
    titleHits.length ? 'FAIL' : 'PASS', titleHits,
    sensitive.length ? '' : 'no fixture or doc files matched the scan paths')

  // --- 4. the indexer list is config-driven, not decided in code
  const hardcoded = scanFiles(files, criteria.indexers.forbidden)
  const hasConfig = files.some((f) => anyMatch(criteria.indexers.expectedConfig, f.path)) ||
    scanFiles(files, criteria.indexers.expectedConfig).length > 0
  record(S, 'B4', 'Indexer list is config-driven and overridable',
    hardcoded.length || !hasConfig ? 'FAIL' : 'PASS', hardcoded,
    hasConfig ? '' : 'found nothing that loads indexers from configuration')

  // --- 5. README assertions
  const readme = text('README.md') ?? text('readme.md')
  if (readme === null) {
    record(S, 'B5', 'README asserts every position', 'FAIL', [], 'no README.md in this repository')
  } else {
    const missing = criteria.readmeAssertions.filter((a) => !anyMatch(a.patterns, readme))
    record(S, 'B5', 'README asserts every position',
      missing.length ? 'FAIL' : 'PASS',
      missing.map((m) => ({ where: 'README.md', line: `missing: ${m.label}` })))
  }

  // --- 6. licence
  const licence = text(criteria.license.file)
  if (licence === null) {
    record(S, 'B6', 'LICENSE present, AGPL-3.0, correct copyright', 'FAIL', [], `no ${criteria.license.file}`)
  } else {
    const problems = []
    for (const p of criteria.license.mustMatch) if (!rx(p).test(licence)) problems.push({ where: criteria.license.file, line: `missing: ${p}` })
    for (const p of criteria.license.mustNotMatch) if (rx(p).test(licence)) problems.push({ where: criteria.license.file, line: `should not say: ${p}` })
    if (!rx(criteria.license.copyrightPattern).test(licence)) problems.push({ where: criteria.license.file, line: 'no copyright line' })
    record(S, 'B6', 'LICENSE present, AGPL-3.0, correct copyright', problems.length ? 'FAIL' : 'PASS', problems)
  }

  // --- 7. monetization
  const money = scanFiles(files, criteria.monetization.content, criteria.monetization.allow)
  record(S, 'B7', 'No monetization of any kind', money.length ? 'FAIL' : 'PASS', money)

  // --- 8. public-instance artifacts
  const instancePaths = files.filter((f) => anyMatch(criteria.publicInstance.paths, f.path)).map((f) => ({ where: f.path, line: 'exists only to run a public instance' }))
  const instanceContent = scanFiles(files, criteria.publicInstance.content, criteria.publicInstance.allow)
  record(S, 'B8', 'No public-instance artifacts', instancePaths.length || instanceContent.length ? 'FAIL' : 'PASS', [...instancePaths, ...instanceContent])

  // --- 9. the audit's own committed files name nobody
  // B2 applied to the blind spot B2 cannot reach. An identity string in this skill's
  // files is both published and hidden from every other check, so it gets its own.
  const selfHits = identity.patterns.length
    ? [
      ...scanFiles(selfFiles(repo), identity.patterns, identity.allow),
      ...scanHistory(selfEntries, identity.patterns, identity.allow),
    ]
    : []
  record(S, 'B9', "The audit's own files carry no personal identifiers",
    !identity.patterns.length ? 'N-A' : selfHits.length ? 'FAIL' : 'PASS',
    selfHits,
    identity.patterns.length ? '' : `no ${criteria.localIdentityFile}: nothing to look for`)

  // ---------------------------------------------------------------- shoulds
  const legit = scanFiles(files, criteria.legitimateSources.content)
  record(S, 'S1', 'Working configs for legitimate sources', legit.length ? 'PASS' : 'FAIL', legit.slice(0, 3),
    legit.length ? '' : 'nothing references Linux ISOs, Internet Archive, CC or academic datasets')

  const drm = scanFiles(files, criteria.drm.content, criteria.drm.allow)
  record(S, 'S2', 'No DRM or decryption code', drm.length ? 'FAIL' : 'PASS', drm)

  const gitignore = text('.gitignore')
  if (gitignore === null) {
    record(S, 'S3', '.gitignore covers keystore, .env, build outputs', 'FAIL', [], 'no .gitignore')
  } else {
    const uncovered = criteria.gitignoreMustCover.filter((p) => !rx(p).test(gitignore))
    record(S, 'S3', '.gitignore covers keystore, .env, build outputs',
      uncovered.length ? 'FAIL' : 'PASS',
      uncovered.map((u) => ({ where: '.gitignore', line: `not covered: ${u}` })))
  }

  const wrongAuthor = commits.filter((c) => anyMatch(criteria.authors.forbiddenDomains, `${c.ae} ${c.ce}`))
  record(S, 'S4', 'Git author identity is the personal one on every commit',
    !knowsAuthor ? 'N-A' : wrongAuthor.length ? 'FAIL' : 'PASS',
    wrongAuthor.slice(0, 6).map((c) => ({ where: `${c.hash} ${c.subject?.slice(0, 48) ?? ''}`, line: `<${c.ae}>` })),
    !knowsAuthor
      ? `no ${criteria.localIdentityFile}: who the author should be is not declared`
      : wrongAuthor.length ? `${wrongAuthor.length} of ${commits.length} commits` : `${commits.length} commits checked`)

  const tel = scanFiles(files, criteria.telemetry.content, criteria.telemetry.allow)
  record(S, 'S5', 'No telemetry or analytics', tel.length ? 'FAIL' : 'PASS', tel)

  return { files: files.length, commits: commits.length, lines: entries.length }
}

// ---------------------------------------------------------------------- print

const BLOCKER = /^B\d$/
const pad = (s, n) => String(s).padEnd(n)

function report(stats) {
  const out = []
  out.push('')
  out.push('MARQUO RELEASE READINESS')
  out.push(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`)
  for (const [name, s] of Object.entries(stats)) {
    out.push(`  ${name}: ${s.files} tracked files, ${s.commits} commits, ${s.lines} added lines scanned`)
  }
  {
    out.push(identity.loaded
      ? `  identity: ${criteria.localIdentityFile} loaded (${criteria.authors.allowedEmails.length} allowed address(es), ${identity.patterns.length} extra pattern(s))`
      : `  identity: no ${criteria.localIdentityFile} - generic patterns only, commit identities not checked`)
  }

  for (const section of [...new Set(results.map((r) => r.section))]) {
    const rows = results.filter((r) => r.section === section)
    out.push('')
    out.push(`── ${section} ${'─'.repeat(Math.max(0, 58 - section.length))}`)
    for (const kind of ['BLOCKERS', 'SHOULDS']) {
      out.push('')
      out.push(`  ${kind}`)
      for (const r of rows.filter((x) => (kind === 'BLOCKERS') === BLOCKER.test(x.id))) {
        out.push(`  ${pad(r.status, 5)} ${r.id}  ${r.label}${r.note ? `  (${r.note})` : ''}`)
        for (const e of r.evidence.slice(0, criteria.maxEvidence)) {
          out.push(`           ${e.where}`)
          if (e.line) out.push(`             ${e.line}`)
        }
        const extra = r.evidence.length - criteria.maxEvidence
        if (extra > 0) out.push(`           ... and ${extra} more`)
      }
    }
  }

  const blockers = results.filter((r) => BLOCKER.test(r.id) && r.status === 'FAIL')
  const shoulds = results.filter((r) => !BLOCKER.test(r.id) && r.status === 'FAIL')
  out.push('')
  out.push('─'.repeat(62))
  if (blockers.length === 0) {
    out.push('VERDICT: READY')
    if (shoulds.length) out.push(`  ${shoulds.length} should(s) still open: ${shoulds.map((s) => s.id).join(', ')}`)
  } else {
    out.push('VERDICT: NOT READY')
    out.push(`  ${blockers.length} blocker(s):`)
    for (const b of blockers) out.push(`    ${b.section} ${b.id}  ${b.label}`)
    if (shoulds.length) out.push(`  plus ${shoulds.length} should(s): ${shoulds.map((s) => `${s.section} ${s.id}`).join(', ')}`)
  }
  out.push('')
  return { text: out.join('\n'), failed: blockers.length }
}

// ----------------------------------------------------------------------- main

const extra = (process.env[criteria.extraRepoEnv] || '').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
const repoPaths = [...criteria.repos, ...extra]
const stats = {}

for (const p of repoPaths) {
  const repo = resolve(ROOT, p)
  if (!existsSync(join(repo, '.git'))) {
    record(relative(ROOT, repo) || '.', 'B0', 'Repository readable', 'N-A', [], `not a git repository: ${repo}`)
    continue
  }
  const name = p === '.' ? (git(repo, ['rev-parse', '--show-toplevel']).trim().split(/[\\/]/).pop() || '.') : p
  stats[name] = auditRepo(name, repo)
}

const { text, failed } = report(stats)
process.stdout.write(text + '\n')
process.exit(failed ? 1 : 0)
