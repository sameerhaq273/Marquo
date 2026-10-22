/**
 * The sensitive-content filter ("Hide 18+ and sensitive results"), on by default.
 *
 * A result is sensitive when its shared kind is Adult (18+), or when its name says so.
 * The name check matters because sites file plenty of explicit releases under Movies,
 * Video or Other, so the category alone misses them.
 *
 * Names are flattened first (lower case, every separator to a space), so release names
 * like `Some.Title.XXX.1080p` and `strap_on` are matched the same as plain words.
 */

/** Shared kinds (sources/__init__.py KINDS) that are sensitive whatever the name says */
const SENSITIVE_KINDS = new Set(['adult'])

/** Shared category ids (sources/__init__.py CATEGORIES) that only hold sensitive results */
export const SENSITIVE_CATEGORIES = ['adult']

/** Matched from the start of a word, so every inflection counts: porn, porno, pornstar, pornography */
const PREFIXES = [
  'porn',
  'hentai',
  'erotic',
  'fetish',
  'masturbat',
  'orgasm',
  'gangbang',
  'blowjob',
  'handjob',
  'footjob',
  'rimjob',
  'titjob',
  'cumshot',
  'creampie',
  'deepthroat',
  'bukkake',
  'dominatrix',
  'camgirl',
  'squirting',
  'fisting',
  'dildo',
  'lesbian',
  'shemale',
  'transsexual',
  'nudist',
  'nudity',
  'upskirt',
  'voyeur',
  'prostitut',
  'incest',
  'molest',
  'rape',
]

/** Matched as whole words only, so "anal" misses "banal" and "cum" misses "cumbersome" */
const WORDS = [
  'xxx',
  'r18',
  'nsfw',
  'sexy',
  'sexual',
  'nude',
  'nudes',
  'topless',
  'boob',
  'boobs',
  'tit',
  'tits',
  'titty',
  'titties',
  'nipple',
  'nipples',
  'anal',
  'cum',
  'milf',
  'dilf',
  'orgy',
  'orgies',
  'threesome',
  'bareback',
  'twink',
  'bdsm',
  'bondage',
  'femdom',
  'strapon',
  'gay',
  'lesbo',
  'homo',
  'homosexual',
  'bisexual',
  'tranny',
  'pedo',
  'pedophile',
  'pedophilia',
  'jailbait',
  'loli',
  // Studios whose whole catalogue is adult
  'brazzers',
  'bangbros',
  'naughtyamerica',
  'realitykings',
  'evilangel',
  'onlyfans',
  'blacked',
  'tushy',
]

/** Only sensitive together; the separate words are too ordinary to block on their own */
const PHRASES = [
  'strap on',
  'full frontal',
  'sex tape',
  'soft core',
  'x rated',
]

const PATTERN = new RegExp(
  [
    ...PREFIXES.map((word) => `\\b${word}[a-z0-9]*`),
    ...WORDS.map((word) => `\\b${word}\\b`),
    ...PHRASES.map((phrase) => `\\b${phrase}\\b`),
  ].join('|'),
)

/** Lower case, and every separator (dots, underscores, dashes, brackets) to a single space */
const flatten = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')

/** True for results the sensitive filter hides: search rows, featured cards and details alike */
export function isSensitive(item: { kind?: string; title?: string; release?: string }) {
  if (item.kind && SENSITIVE_KINDS.has(item.kind)) return true
  const name = `${item.title ?? ''} ${item.release ?? ''}`.trim()
  return name !== '' && PATTERN.test(flatten(name))
}
