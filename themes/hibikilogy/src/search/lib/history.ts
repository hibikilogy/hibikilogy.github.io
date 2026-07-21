import type { HistoryAdapter } from '../../ui/lib/page-context.ts'
import type { SearchSort } from './snapshot-store.ts'

/**
 * Owns the URL ↔ history translation for the search page.
 *
 * Centralises the search-param rules (`q`, `p`, `sort`) and routes
 * `history.replaceState` (or a swup-aware adapter when one is supplied)
 * so feature code doesn't need to reference `window.history` directly.
 */
export interface SearchHistory {
  /** Build a same-document href for a search result page. */
  buildHref: (page: number) => string
  /** Replace the current history entry with the search URL for `term` / `page`. */
  replace: (term: string, page: number) => void
}

export function createSearchHistory(
  adapter: HistoryAdapter,
  getTerm: () => string,
  getSort: () => SearchSort,
): SearchHistory {
  const setSearchParams = (url: URL, term: string, page: number): void => {
    if (term) {
      url.searchParams.set('q', term)
      if (page > 1)
        url.searchParams.set('p', String(page))
      else
        url.searchParams.delete('p')

      if (getSort() === 'title')
        url.searchParams.set('sort', 'title')
      else
        url.searchParams.delete('sort')
    }
    else {
      url.searchParams.delete('q')
      url.searchParams.delete('p')
      url.searchParams.delete('sort')
    }
  }

  const buildHref = (page: number): string => {
    const url = new URL(window.location.href)
    setSearchParams(url, getTerm(), page)
    return `${url.pathname}${url.search}${url.hash}`
  }

  const replace = (term: string, page: number): void => {
    const url = new URL(window.location.href)
    setSearchParams(url, term, page)
    adapter.replace(`${url.pathname}${url.search}${url.hash}`)
  }

  return { buildHref, replace }
}