/**
 * What the release-readiness audit looks for. Edit this file as the project changes.
 *
 * Everything here is data. `audit.mjs` reads it and does not need changing to add a
 * pattern, allow a false positive, or add another repository to scan.
 *
 * Patterns are JavaScript regular expressions written as source strings so they can be
 * tuned without escaping surprises. They are matched case-insensitively unless a check
 * says otherwise.
 *
 * NOTE: this file is itself excluded from every scan. A rule that names a secret pattern
 * would otherwise report itself.
 */

export default {
  /**
   * Repositories to audit, relative to the repo the skill runs in.
   *
   * Deliberately only "." by default: an absolute path to another checkout is itself the
   * kind of machine-specific detail blocker 2 is looking for, so it does not belong in a
   * committed file. Point at sibling checkouts with the environment variable instead:
   *
   *   MARQUO_EXTRA_REPOS="../marquo-mobile;D:/code/whatever" node audit.mjs
   */
  repos: ['.'],
  extraRepoEnv: 'MARQUO_EXTRA_REPOS',

  /** Paths never scanned, in the working tree or in history */
  ignorePaths: [
    '\\.claude/skills/release-readiness/', // the audit would match its own rules
    'node_modules/',
    'package-lock\\.json$',
    '\\.venv/',
    '__pycache__/',
    '^dist/',
    '\\.(png|jpg|jpeg|gif|webp|ico|ttf|otf|woff2?|apk|aab|jks|keystore|zip|gz)$',
  ],

  /** How many pieces of evidence to print per failing check before summarising */
  maxEvidence: 8,

  // ----------------------------------------------------------------- BLOCKERS

  /** 1. Secrets anywhere in full history */
  secrets: {
    /** Committed file paths that should never exist */
    paths: ['\\.jks$', '\\.keystore$', '(^|/)\\.env$', '(^|/)\\.env\\.(local|production)$', 'google-services\\.json$', 'service-account.*\\.json$'],
    /** Content that looks like a credential wherever it appears */
    content: [
      '-----BEGIN [A-Z ]*PRIVATE KEY-----',
      'AKIA[0-9A-Z]{16}', // AWS access key id
      'gh[pousr]_[A-Za-z0-9]{36,}', // GitHub tokens
      'sk-[A-Za-z0-9]{32,}', // OpenAI-style
      'AIza[0-9A-Za-z_\\-]{35}', // Google API key
      'xox[baprs]-[0-9A-Za-z-]{10,}', // Slack
      'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}', // JWT
      '(api[_-]?key|secret|password|passwd|token)\\s*[:=]\\s*["\'][^"\'\\s]{12,}["\']',
      'KEYSTORE_PASSWORD|KEY_PASSWORD|STORE_PASSWORD',
    ],
    /**
     * Matches that are not secrets. Keep this list short and specific - a broad allow
     * rule here is how a real key gets through.
     */
    allow: [
      'VITE_API_BASE=https://your-api-host\\.example\\.com', // placeholder in .env.example
      'EXAMPLE|PLACEHOLDER|your-?api-?host|<your',
    ],
  },

  /**
   * Where the person-specific identifiers live: NOT here.
   *
   * This file is committed, and the skill's own directory is excluded from every scan, so
   * anything written here is both published and invisible to the audit. That is how the
   * work-email domain this check exists to remove ended up shipped inside the check
   * itself, where nothing could see it. A gate that greps for an email address must not
   * publish the email address.
   *
   * So the names, the work domain and the allowed author addresses go in
   * identity.local.json next to this file, which is gitignored. identity.example.json
   * documents the shape. Without that file the generic patterns still run, and the commit
   * identity check reports N-A rather than silently passing: the audit cannot know whose
   * repository this is unless someone tells it.
   */
  localIdentityFile: 'identity.local.json',

  /** 2. Personal data in full history */
  personal: {
    /** Generic shapes only. Anything naming a person belongs in the local identity file. */
    content: [
      'C:\\\\\\\\Users\\\\\\\\[A-Za-z0-9._-]+', // a Windows home directory
      '/(home|Users)/[A-Za-z0-9._-]+/', // a POSIX home directory
    ],
    // Things that look personal but are supposed to be there - the name on the licence
    // line B6 requires, a published account slug - also name a person, so they live in
    // the local identity file's `allow` rather than here.
    allow: [],
    /**
     * Commit metadata is checked separately from file content: an author line is supposed
     * to carry a name, but it must be the personal identity, not a work one.
     * Anything here that is NOT in `authors.allowedEmails` is reported.
     */
    checkCommitIdentities: true,
  },

  /** 3. Real copyrighted titles in fixtures, sample queries, docs */
  copyrighted: {
    /** Where a real title would be most damaging. youtube-dl was taken down over one. */
    scanPaths: [
      'test', 'spec', 'fixture', 'sample', 'demo', 'mock', 'seed',
      'README', '\\.md$', 'docs/',
    ],
    /**
     * Titles and brands to flag. This list is meant to be grown: add anything that
     * appears in a fixture when you notice it.
     */
    content: [
      'the\\.?\\s?matrix', 'inception', 'blade runner', 'spider-?man', 'avengers',
      'breaking bad', 'doctor sleep', 'one piece', 'game of thrones', 'oppenheimer',
      'titanic', 'interstellar', 'stranger things', 'the office',
      'yts|yify|rarbg|brazzers|bangbros|naughtyamerica|realitykings|evilangel',
      'vevo', 'netflix|disney\\+?|hbo ?max|amazon prime video',
    ],
    allow: [
      // An indexer's name is not a media title. Shipping a list of them is a separate
      // problem, caught by the indexer check below.
      '(1337x|1337xx|The Pirate Bay|piratebay|apibay|Nyaa|YTS|YIFY|EZTV)',
    ],
  },

  /**
   * 4. The indexer list must be config-driven and overridable.
   *
   * Note what this does and does not require, because the two were conflated when this
   * file was first written. It does NOT require that the repository ship no indexer
   * modules: bundling them is a deliberate decision, so that a fresh clone and an
   * installed APK both work without the user having to write a scraper first.
   *
   * What it requires is that no code decides the list. Which indexers an install
   * searches must come from that install's own configuration, and an operator must be
   * able to add or replace one without editing the app. So the thing to catch is a
   * literal array of modules assigned to the site list, anywhere outside the one config
   * file whose entire job is to be that list.
   */
  indexers: {
    /**
     * An array literal assigned to the site list. Deliberately narrow: a named import of
     * an indexer module is fine (something has to reference it), and so is a config file
     * listing ids as strings. Hardcoding the modules themselves is not.
     */
    forbidden: [
      // The first element must be a bare name followed by a comma or the closing bracket,
      // so a list built from the real list - `sources=[s.ID for s in SITES]` - is not a
      // hardcoded list and does not match.
      '(SITES|SOURCES|INDEXERS|BY_ID)\\s*(:[^=\\n]*)?=\\s*\\[\\s*[A-Za-z_$][\\w$]*\\s*[,\\]]',
      'from\\s+\\.\\s+import\\s+(nyaa|piratebay|x1337|yts)\\s*,',
    ],
    /** Evidence the mechanism exists: at least one of these must be found */
    expectedConfig: [
      'indexers?\\.(example\\.)?(json|ya?ml|toml)$',
      'indexers\\.config\\.[jt]s$',
      'loadIndexers|registerIndexer|INDEXER_DIR|INDEXERS_PATH|MARQUO_INDEXER',
    ],
  },

  /** 5. README must assert all five positions, in its own words */
  readmeAssertions: [
    { id: 'metadata-only', label: 'Searches metadata only, hosts no content', patterns: ['metadata only', 'does not host', 'hosts no (content|files)', 'no content is hosted'] },
    { id: 'no-distribution', label: 'Distributes no torrents', patterns: ['distributes? no torrents', 'does not distribute', 'no \\.torrent files are distributed'] },
    { id: 'no-trackers', label: 'Operates no trackers', patterns: ['operates? no trackers', 'does not (run|operate) (a )?tracker', 'no trackers are (run|operated)'] },
    { id: 'no-circumvention', label: 'Circumvents no access controls', patterns: ['circumvents? no', 'does not circumvent', 'no (access control|DRM|paywall).{0,30}circumvent'] },
    // The brief called this one position, but it is three separate claims and an
    // assertion passes on any single pattern - so bundled, "not affiliated" alone
    // satisfied all three. Split, because each has to be said to count as said.
    { id: 'user-supplied', label: 'Indexers are the operator\'s choice, and users can supply their own', patterns: ['user-?supplied', 'supply your own', 'indexers? (it searches )?(is|are) configuration'] },
    { id: 'user-responsible', label: 'User is responsible for lawful use', patterns: ['you are responsible', 'user is responsible', 'responsible for lawful'] },
    { id: 'no-affiliation', label: 'Not affiliated with any indexer', patterns: ['not affiliated'] },
  ],

  /** 6. Licence */
  license: {
    file: 'LICENSE',
    mustMatch: ['GNU AFFERO GENERAL PUBLIC LICENSE', 'Version 3'],
    mustNotMatch: ['MIT License', 'Apache License', 'BSD'],
    /** The copyright line has to name someone, and it has to be the right someone */
    copyrightPattern: 'Copyright \\(C\\) \\d{4}',
  },

  /** 7. Monetization of any kind */
  monetization: {
    content: [
      'adsense|googlesyndication|doubleclick|adsbygoogle',
      // A real funding link, not a brand name appearing inside some other list
      'https?://(www\\.)?(patreon\\.com|buymeacoffee\\.com|ko-?fi\\.com|opencollective\\.com|paypal\\.me)',
      'github\\.com/sponsors/',
      '(^|/)FUNDING\\.ya?ml$',
      'stripe|lemonsqueezy|paddle\\.com|gumroad',
      'premium (tier|plan|account)|upgrade to pro|pro version',
      'aff(iliate)?[_-]?(id|code|tag)|[?&]tag=[a-z0-9-]+-20',
    ],
    allow: [],
  },

  /** 8. Artifacts that only exist to run a public instance */
  publicInstance: {
    paths: [
      '^Dockerfile$', '^docker-compose\\.ya?ml$',
      '^firebase\\.json$', '^\\.firebaserc$',
      '^vercel\\.json$', '^netlify\\.toml$', '^render\\.ya?ml$', '^fly\\.toml$',
      '^public/_headers$', '^public/_redirects$',
      '^public/sitemap\\.xml$', '^public/robots\\.txt$',
      'docs/deploy\\.md$',
      '\\.github/workflows/.*deploy.*',
    ],
    content: [
      'https://marquo\\.(app|pages\\.dev)',
      '\\b(sign ?up|create an account|registration form)\\b',
    ],
    allow: [],
  },

  // ------------------------------------------------------------------ SHOULDS

  /** Sources that are unambiguously lawful to index */
  legitimateSources: {
    content: ['archive\\.org', 'linuxtracker|distrowatch|ubuntu\\.com/download|releases\\.ubuntu', 'creativecommons|\\bCC[ -]BY\\b', 'academictorrents'],
  },

  /** DRM or decryption code has no place here */
  drm: {
    content: ['widevine|playready|fairplay', 'decrypt(Content|Drm|Licence|License)', 'cdm\\b|license[_-]?server', 'AACS|CSS decrypt|libdvdcss'],
    allow: ['decrypt' + 'ionNotSupported'],
  },

  /** .gitignore must cover the things that must never be committed */
  gitignoreMustCover: ['\\.env', 'keystore|\\.jks', 'node_modules', 'dist|build'],

  /**
   * Author identity on every commit.
   *
   * Both lists come from the local identity file, for the reason given at the top. With
   * no allowed addresses declared there, the identity checks report N-A: an empty list
   * would otherwise mean "every author is wrong", and defaulting to "nothing is wrong"
   * would be worse still.
   */
  authors: {
    allowedEmails: [],
    forbiddenDomains: [],
  },

  /** Telemetry and analytics */
  telemetry: {
    content: [
      'google-analytics|googletagmanager|gtag\\(',
      'sentry|bugsnag|datadog|newrelic|mixpanel|amplitude|posthog|segment\\.com',
      'expo-analytics|firebase/analytics|logEvent\\(',
    ],
    allow: ['\\[observability\\]'],
  },
}
