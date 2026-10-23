import { describe, expect, it } from 'vitest'
import { parseDate, parseSize, toNumber } from './utils'

describe('parseSize', () => {
  it('reads the units the sites actually send', () => {
    expect(parseSize('5.7 GB')).toBe(5.7e9)
    expect(parseSize('845 MB')).toBe(845e6)
    expect(parseSize('1.5 TB')).toBe(1.5e12)
    expect(parseSize('512 B')).toBe(512)
  })

  it('treats a binary unit as 1024-based, not 1000', () => {
    expect(parseSize('1 GiB')).toBe(1024 ** 3)
    expect(parseSize('1 GB')).toBe(1e9)
  })

  it('ignores thousands separators and spacing', () => {
    expect(parseSize('1,024 MB')).toBe(1024e6)
    expect(parseSize('2GB')).toBe(2e9)
  })

  it('returns -1 for something that is not a size', () => {
    expect(parseSize('?')).toBe(-1)
    expect(parseSize('')).toBe(-1)
  })
})

describe('toNumber', () => {
  it('reads counts however a site writes them', () => {
    expect(toNumber('1,234')).toBe(1234)
    expect(toNumber('1234')).toBe(1234)
    expect(toNumber(1234)).toBe(1234)
  })

  it('treats anything unreadable as zero rather than NaN', () => {
    // NaN would poison every sort it touched
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber('')).toBe(0)
    expect(toNumber('n/a')).toBe(0)
    expect(toNumber(Number.NaN)).toBe(0)
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('parseDate', () => {
  it('reads the ISO form', () => {
    expect(parseDate('2026-10-06')).toBe(Date.UTC(2026, 9, 6))
  })

  it("reads 1337x's short form, with and without the ordinal", () => {
    expect(parseDate("Oct. 05th '26")).toBe(Date.UTC(2026, 9, 5))
    expect(parseDate("Jun 17, 2026")).toBe(Date.UTC(2026, 5, 17))
  })

  it('treats a clock time or "today" as now, which is what those sites mean', () => {
    const now = Date.now()
    expect(Math.abs(parseDate('3am') - now)).toBeLessThan(5000)
    expect(Math.abs(parseDate('2 hours ago') - now)).toBeLessThan(5000)
  })

  it('reads yesterday as a day back', () => {
    expect(Math.abs(parseDate('Yesterday') - (Date.now() - 86_400_000))).toBeLessThan(5000)
  })

  it('returns 0 for a date it cannot read, so it sorts last', () => {
    expect(parseDate('')).toBe(0)
    expect(parseDate('?')).toBe(0)
  })
})
