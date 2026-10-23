import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTERS,
  MAX_YEAR,
  OFF_BY_DEFAULT,
  activeSources,
  countActive,
  defaultDir,
  inYearRange,
  nextSort,
  normalizeFilters,
  searchKey,
  sortSummary,
  type Filters,
} from './filters'

const ALL = ['1337x', 'piratebay', 'yts', 'nyaa']
const base = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over })

describe('normalizeFilters: year bounds', () => {
  // Regression. year() cleaned the bounds and the raw filters were spread on top of its
  // result, so every case below passed straight through unsanitised.
  it('drops a half-typed year rather than filtering on it', () => {
    expect(normalizeFilters({ version: 6, yearFrom: 20 }).yearFrom).toBeNull()
  })

  it('reads a reversed pair as the range that was meant', () => {
    const f = normalizeFilters({ version: 6, yearFrom: 2020, yearTo: 2010 })
    expect([f.yearFrom, f.yearTo]).toEqual([2010, 2020])
  })

  it('drops a year that is not a whole number', () => {
    expect(normalizeFilters({ version: 6, yearFrom: 1999.5 }).yearFrom).toBeNull()
  })

  it('drops years outside the scale', () => {
    expect(normalizeFilters({ version: 6, yearFrom: 1800 }).yearFrom).toBeNull()
    expect(normalizeFilters({ version: 6, yearTo: MAX_YEAR + 50 }).yearTo).toBeNull()
  })

  it('keeps a valid range', () => {
    const f = normalizeFilters({ version: 6, yearFrom: 1999, yearTo: 2005 })
    expect([f.yearFrom, f.yearTo]).toEqual([1999, 2005])
  })
})

describe('normalizeFilters: migrating older saves', () => {
  it('adds newly-off-by-default sources without re-enabling ones turned off by hand', () => {
    const f = normalizeFilters({ version: 1, excludedSources: ['piratebay'] })
    expect(f.excludedSources.sort()).toEqual(['piratebay', ...OFF_BY_DEFAULT].sort())
  })

  it('restores the current default for settings that predate it', () => {
    const f = normalizeFilters({ version: 1, hideDead: false, safeSearch: false })
    expect(f.hideDead).toBe(DEFAULT_FILTERS.hideDead)
    expect(f.safeSearch).toBe(DEFAULT_FILTERS.safeSearch)
  })

  it('clears a sensitive category while the sensitive filter is on, which would match nothing', () => {
    expect(normalizeFilters({ version: 6, category: 'adult', safeSearch: true }).category).toBe('')
    expect(normalizeFilters({ version: 6, category: 'adult', safeSearch: false }).category).toBe('adult')
  })

  it('falls back to a usable sort when the stored one is unknown', () => {
    const f = normalizeFilters({ version: 6, sort: 'nonsense' as Filters['sort'], sortDir: 'sideways' as Filters['sortDir'] })
    expect(f.sort).toBe('match')
    expect(f.sortDir).toBe('desc')
  })

  it('survives a stored value of the wrong type', () => {
    const f = normalizeFilters({ version: 6, excludedSources: 'piratebay' as unknown as string[] })
    expect(Array.isArray(f.excludedSources)).toBe(true)
  })
})

describe('nextSort', () => {
  it('starts a new column in its natural direction', () => {
    expect(nextSort(base(), 'seeds')).toMatchObject({ sort: 'seeds', sortDir: 'desc' })
    expect(nextSort(base(), 'name')).toMatchObject({ sort: 'name', sortDir: 'asc' })
  })

  it('reverses, then returns to best match', () => {
    const once = nextSort(base(), 'size')
    const twice = nextSort(once, 'size')
    expect(twice.sortDir).toBe(defaultDir('size') === 'asc' ? 'desc' : 'asc')
    expect(nextSort(twice, 'size').sort).toBe('match')
  })
})

describe('inYearRange', () => {
  it('lets everything through when no bound is set', () => {
    expect(inYearRange(null, base())).toBe(true)
  })

  it('excludes a result with no year once a bound is set', () => {
    expect(inYearRange(null, base({ yearFrom: 2000 }))).toBe(false)
  })

  it('is inclusive at both ends', () => {
    const f = base({ yearFrom: 2000, yearTo: 2010 })
    expect(inYearRange('2000', f)).toBe(true)
    expect(inYearRange('2010', f)).toBe(true)
    expect(inYearRange('1999', f)).toBe(false)
    expect(inYearRange('2011', f)).toBe(false)
  })
})

describe('sources and counting', () => {
  it('searches everything rather than nothing when all sources are excluded', () => {
    expect(activeSources(ALL, base({ excludedSources: ALL }))).toEqual(ALL)
  })

  it('ignores an excluded source the server no longer offers', () => {
    expect(countActive(base({ excludedSources: ['gone'] }), ALL)).toBe(0)
  })

  it('does not count sorting, which has its own control', () => {
    expect(countActive(base({ sort: 'seeds', sortDir: 'asc' }), ALL)).toBe(countActive(base(), ALL))
  })

  it('already counts one at rest, because two sources start switched off', () => {
    // Pinning this rather than asserting zero: the badge on the Filters button reads 1
    // on a fresh load, since OFF_BY_DEFAULT excludes YTS and Nyaa before anyone touches
    // anything. Change the defaults and this is the test that should make you decide
    // whether the badge still means "you changed something".
    expect(countActive(DEFAULT_FILTERS, ALL)).toBe(1)
  })

  it('counts each changed group once', () => {
    const f = base({ excludedSources: ['yts'], category: 'movies', safeSearch: false, yearFrom: 2000 })
    expect(countActive(f, ALL)).toBe(4)
  })

  it('keys a search by what the server actually varies on', () => {
    expect(searchKey(base({ excludedSources: ['a', 'b'] }))).toBe(searchKey(base({ excludedSources: ['b', 'a'] })))
    expect(searchKey(base({ sort: 'seeds' }))).toBe(searchKey(base({ sort: 'name' })))
  })
})

describe('sortSummary', () => {
  it('states the ordering in words', () => {
    expect(sortSummary(base({ sort: 'seeds', sortDir: 'desc' }))).toBe('Seeds, most first')
    expect(sortSummary(base({ sort: 'name', sortDir: 'asc' }))).toBe('Name, A to Z')
  })

  it('says only "Best match" when unsorted, with no direction tacked on', () => {
    expect(sortSummary(base({ sort: 'match' }))).toBe('Best match')
  })
})
