import type { SearchQuery, SearchSort } from '../types.ts'
import { normalizePageNumber } from 'components/site-pagination/utils.ts'
import { serializeUrl } from 'shared/url.ts'

export function parseSearchLocation(href: string): SearchQuery {
  const url = new URL(href, window.location.href)
  return {
    term: url.searchParams.get('q')?.trim() || '',
    page: normalizePageNumber(url.searchParams.get('p')),
    sort: normalizeSearchSort(url.searchParams.get('sort')),
  }
}

export function buildSearchHref(currentHref: string, query: SearchQuery): string {
  const url = new URL(currentHref, window.location.href)

  if (!query.term) {
    url.searchParams.delete('q')
    url.searchParams.delete('p')
    url.searchParams.delete('sort')
  }
  else {
    url.searchParams.set('q', query.term)
    query.page > 1
      ? url.searchParams.set('p', String(query.page))
      : url.searchParams.delete('p')
    query.sort === 'title'
      ? url.searchParams.set('sort', 'title')
      : url.searchParams.delete('sort')
  }

  return serializeUrl(url)
}

export function normalizeSearchSort(value: string | null | undefined): SearchSort {
  return value === 'title' ? 'title' : 'relevance'
}

// Deliberately excludes the hash: the snapshot key identifies a result set,
// and the hash only tracks the last focused heading.
export function getSearchLocationKey(href: string): string {
  const url = new URL(href, window.location.href)
  return `${url.pathname}${url.search}`
}
