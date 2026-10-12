import { describe, expect, it } from 'vitest'
import {
  buildSearchHref,
  getSearchLocationKey,
  parseSearchLocation,
} from './searchLocation.ts'

describe('search location', () => {
  it('normalizes URL state into a query', () => {
    expect(parseSearchLocation('https://example.test/search?q=%20hello%20&p=3&sort=title')).toEqual({
      term: 'hello',
      page: 3,
      sort: 'title',
    })
  })

  it('omits default query values from generated URLs', () => {
    expect(buildSearchHref('https://example.test/search?legacy=1', {
      term: 'hello',
      page: 1,
      sort: 'relevance',
    })).toBe('/search?legacy=1&q=hello')
  })

  it('uses the full search location as a snapshot key', () => {
    expect(getSearchLocationKey('https://example.test/search?q=hello&p=2#result'))
      .toBe('/search?q=hello&p=2')
  })
})
