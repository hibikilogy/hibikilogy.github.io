import { describe, expect, it } from 'vitest'
import { readViewCount, resolvePageViewKey } from './core.ts'

describe('resolvePageViewKey', () => {
  it('combines the identity host with the page path', () => {
    expect(resolvePageViewKey('/articles/foo', 'https://hibikilogy.github.io/'))
      .toBe('hibikilogy.github.io/articles/foo')
  })

  it('strips trailing slashes and keeps the root path', () => {
    expect(resolvePageViewKey('/articles/foo/', 'https://hibikilogy.github.io/'))
      .toBe('hibikilogy.github.io/articles/foo')
    expect(resolvePageViewKey('/', 'https://hibikilogy.github.io/'))
      .toBe('hibikilogy.github.io/')
  })

  it('ignores the current host so every deployment shares one key', () => {
    const identity = 'https://hibikilogy.github.io'

    expect(resolvePageViewKey('/docs/join-us', identity))
      .toBe(resolvePageViewKey('/docs/join-us', `${identity}/`))
  })

  it('returns null when the identity base is missing or unusable', () => {
    expect(resolvePageViewKey('/articles/foo', '')).toBeNull()
    expect(resolvePageViewKey('/articles/foo', 'not a url')).toBeNull()
  })
})

describe('readViewCount', () => {
  it('reads viewCount from the API payload', () => {
    expect(readViewCount({ data: { reaction: { viewCount: 42 } } })).toBe(42)
    expect(readViewCount({ data: { reaction: { viewCount: 0 } } })).toBe(0)
  })

  it('rejects missing or malformed counts', () => {
    expect(readViewCount(null)).toBeNull()
    expect(readViewCount({})).toBeNull()
    expect(readViewCount({ data: {} })).toBeNull()
    expect(readViewCount({ data: { reaction: { viewCount: '42' } } })).toBeNull()
    expect(readViewCount({ data: { reaction: { viewCount: Number.NaN } } })).toBeNull()
  })
})
