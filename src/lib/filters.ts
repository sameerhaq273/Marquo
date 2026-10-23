/**
 * Also lives on the phone, as src/lib/filters.ts in the marquo-mobile repository.
 * The phone has no saved-filter versioning, but the year cleaning, the sort cycle and
 * the active count all behave the same.
 * Change one and change the other.
 */
import { SENSITIVE_CATEGORIES } from './sensitive'

export type SortKey = 'match' | 'name' | 'size' | 'seeds' | 'leeches' | 'date'
export type SortDir = 'asc' | 'desc'

export interface Filters {
  /**
   * Source ids the user unchecked. Stored as exclusions so a site added to the
   * server later is searched by default.
   */
  excludedSources: string[]
  /** Category id, '' = all categories */
  category: string
  sort: SortKey
  sortDir: SortDir
  hideDead: boolean
  /** Hide Adult (18+) results and anything else whose name reads as explicit */
  safeSearch: boolean
  /** Release year, inclusive. null = open at that end */
  yearFrom: number | null
  yearTo: number | null
}

/** Nothing on these sites predates film itself; the upper end allows next year's releases */
export const MIN_YEAR = 1900
export const MAX_YEAR = new Date().getFullYear() + 1

/**
 * Sites that start unchecked. Everything else is searched by default, which is why the
 * filter stores exclusions rather than selections.
 */
export const OFF_BY_DEFAULT = ['yts', 'nyaa']

export const DEFAULT_FILTERS: Filters = {
  excludedSources: [...OFF_BY_DEFAULT],
  category: '',
  sort: 'match',
  sortDir: 'desc',
  // Dead torrents (0 seeds) can't be downloaded, so they're hidden unless asked for
  hideDead: true,
  // 18+ is off until the user asks for it
  safeSearch: true,
  yearFrom: null,
  yearTo: null,
}

/** Bumped when a default changes, so filters saved under the old defaults pick it up once */
export const FILTERS_VERSION = 6

export const SORT_LABELS: Record<SortKey, string> = {
  match: 'Best match',
  seeds: 'Seeds',
  leeches: 'Leeches',
  size: 'Size',
  date: 'Upload date',
  name: 'Name',
}

/**
 * What each ordering means in words a reader already has, rather than "ascending".
 * A list that says "Seeds, most first" needs no working out.
 */
export const DIRECTION_WORDS: Record<SortKey, { desc: string; asc: string }> = {
  match: { desc: '', asc: '' },
  seeds: { desc: 'most first', asc: 'fewest first' },
  leeches: { desc: 'most first', asc: 'fewest first' },
  size: { desc: 'largest first', asc: 'smallest first' },
  date: { desc: 'newest first', asc: 'oldest first' },
  name: { desc: 'Z to A', asc: 'A to Z' },
}

/** The current ordering, for the sort button's own label */
export function sortSummary(filters: Filters) {
  if (filters.sort === 'match') return SORT_LABELS.match
  return `${SORT_LABELS[filters.sort]}, ${DIRECTION_WORDS[filters.sort][filters.sortDir]}`
}

/** First click on a column sorts the "natural" way: A→Z for names, biggest / newest first otherwise */
export const defaultDir = (key: SortKey): SortDir => (key === 'name' ? 'asc' : 'desc')

/** Column header clicks cycle: natural direction → reversed → back to best match */
export function nextSort(filters: Filters, key: SortKey): Filters {
  if (filters.sort !== key) return { ...filters, sort: key, sortDir: defaultDir(key) }
  if (filters.sortDir === defaultDir(key)) return { ...filters, sortDir: defaultDir(key) === 'asc' ? 'desc' : 'asc' }
  return { ...filters, sort: 'match', sortDir: 'desc' }
}

/** Filters saved by older versions may miss fields or predate a default change */
export function normalizeFilters(stored: Partial<Filters> & { version?: number }): Filters {
  const { version, ...saved } = stored
  const filters = { ...DEFAULT_FILTERS, ...saved }
  // v2: hiding dead torrents became the default
  if ((version ?? 1) < 2) filters.hideDead = DEFAULT_FILTERS.hideDead
  // v3: the sensitive filter arrived, on by default
  if ((version ?? 1) < 3) filters.safeSearch = DEFAULT_FILTERS.safeSearch
  // v5 added YTS and v6 added Nyaa, both starting off. Each is added to whatever is
  // already excluded rather than replacing it, so a source someone turned off themselves
  // stays off.
  if ((version ?? 1) < 6) {
    filters.excludedSources = [...new Set([...(filters.excludedSources ?? []), ...OFF_BY_DEFAULT])]
  }
  const safeSearch = filters.safeSearch !== false
  return {
    ...filters,
    // After the spread, not before it: year() cleans the stored bounds, and spreading the
    // raw filters on top of its result put the uncleaned ones straight back.
    ...year(filters.yearFrom, filters.yearTo),
    excludedSources: Array.isArray(filters.excludedSources) ? filters.excludedSources : [],
    sort: filters.sort in SORT_LABELS ? filters.sort : 'match',
    sortDir: filters.sortDir === 'asc' ? 'asc' : 'desc',
    safeSearch,
    // Searching a sensitive category while hiding sensitive results would return nothing
    category: safeSearch && SENSITIVE_CATEGORIES.includes(filters.category) ? '' : filters.category,
  }
}

/**
 * A year bound only counts when it's a whole year inside the scale. Anything else - a
 * half-typed "20", a stray decimal, a reversed pair - is dropped rather than silently
 * returning nothing.
 */
function year(from: number | null | undefined, to: number | null | undefined) {
  const clean = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isInteger(v) && v >= MIN_YEAR && v <= MAX_YEAR ? v : null
  const yearFrom = clean(from)
  const yearTo = clean(to)
  // Entered the wrong way round: read it as the range they meant
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) return { yearFrom: yearTo, yearTo: yearFrom }
  return { yearFrom, yearTo }
}

/** True when a result's year sits inside the range; results with no year fall outside it */
export function inYearRange(value: string | null | undefined, filters: Filters) {
  if (filters.yearFrom === null && filters.yearTo === null) return true
  const y = Number(value)
  if (!y) return false
  return (filters.yearFrom === null || y >= filters.yearFrom) && (filters.yearTo === null || y <= filters.yearTo)
}

/** Sources to search; falls back to all if every one is excluded */
export function activeSources(allIds: string[], filters: Filters) {
  const active = allIds.filter((id) => !filters.excludedSources.includes(id))
  return active.length ? active : allIds
}

/** Sources and category change what the server returns; the rest is applied locally */
export function searchKey(filters: Filters) {
  return `${[...filters.excludedSources].sort().join()}|${filters.category}`
}

/** Sorting lives in its own control beside Filters, so it is not counted here */
export function countActive(filters: Filters, allIds: string[]) {
  const excluded = filters.excludedSources.filter((id) => allIds.includes(id)).length
  return (
    Number(excluded > 0) +
    Number(filters.category !== '') +
    Number(filters.hideDead !== DEFAULT_FILTERS.hideDead) +
    Number(filters.safeSearch !== DEFAULT_FILTERS.safeSearch) +
    Number(filters.yearFrom !== null || filters.yearTo !== null)
  )
}
