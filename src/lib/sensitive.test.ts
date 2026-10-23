import { describe, expect, it } from 'vitest'
import { isSensitive } from './sensitive'

describe('isSensitive: what it hides', () => {
  it('hides anything the site filed as Adult, whatever the name says', () => {
    expect(isSensitive({ kind: 'adult', title: 'Ubuntu 24.04 LTS' })).toBe(true)
  })

  it('matches a prefix through its inflections', () => {
    for (const title of ['Porn', 'Porno Movie', 'Pornstar Compilation', 'Pornography 1080p']) {
      expect(isSensitive({ title })).toBe(true)
    }
  })

  it('sees through release-name separators', () => {
    // Names are flattened before matching, so dots and underscores do not hide a word
    expect(isSensitive({ title: 'Some.Title.XXX.1080p.WEB-DL' })).toBe(true)
    expect(isSensitive({ title: 'strap_on_collection' })).toBe(true)
    expect(isSensitive({ title: '[Hentai] Something 720p' })).toBe(true)
  })

  it('matches a phrase while leaving its separate words alone', () => {
    expect(isSensitive({ title: 'Celebrity Sex Tape 2019' })).toBe(true)
    expect(isSensitive({ title: 'Soft Core Collection' })).toBe(true)
  })

  it('checks the release name as well as the title', () => {
    expect(isSensitive({ title: 'Clean Title', release: 'Clean.Title.XXX.1080p' })).toBe(true)
  })
})

describe('isSensitive: what it must not hide', () => {
  // These four words were removed from the list deliberately: each appears in ordinary
  // titles often enough that blocking on it hid legitimate results.
  it('leaves the four withdrawn words alone on their own', () => {
    for (const title of ['Sex Ed For Teachers S01E01', 'The Naked Harbour 1988', 'Adult Learning Collection', 'Hard Core Engineering 1996']) {
      expect(isSensitive({ title })).toBe(false)
    }
  })

  it('does not match an ordinary release', () => {
    for (const title of ['Ubuntu 24.04.1 LTS Desktop amd64', 'Harbour Light Engineering 2nd Edition', 'Some Documentary 2021 1080p']) {
      expect(isSensitive({ title })).toBe(false)
    }
  })

  it('says nothing is sensitive when there is no name to judge', () => {
    expect(isSensitive({})).toBe(false)
    expect(isSensitive({ title: '', release: '' })).toBe(false)
  })
})
