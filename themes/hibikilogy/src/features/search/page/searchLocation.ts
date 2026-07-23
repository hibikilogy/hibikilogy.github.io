import type { SearchQuery, SearchSort } from '../types.ts'
import { normalizePageNumber } from 'components/site-pagination/utils.ts'

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

  return `${url.pathname}${url.search}${url.hash}`
}

export function normalizeSearchSort(value: string | null | undefined): SearchSort {
  return value === 'title' ? 'title' : 'relevance'
}

export function getSearchLocationKey(href: string): string {
  const url = new URL(href, window.location.href)
  return `${url.pathname}${url.search}`
}
