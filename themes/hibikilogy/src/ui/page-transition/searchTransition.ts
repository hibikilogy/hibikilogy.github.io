import { getDefaultOrigin, isSearchUrl } from 'shared/url.ts'

export type SearchTransitionScope = 'enter-search' | 'leave-search'

const searchResultLinkSelector = '#search-results a[href]'

export function getSearchTransitionScope(
  fromUrl: string,
  toUrl: string,
  origin = getDefaultOrigin(),
): SearchTransitionScope | null {
  const fromSearch = isSearchUrl(fromUrl, origin)
  const toSearch = isSearchUrl(toUrl, origin)

  if (fromSearch === toSearch)
    return null
  return toSearch ? 'enter-search' : 'leave-search'
}

/** Whether this visit leaves search by opening one of its rendered article results. */
export function isSearchResultArticleTransition(
  fromUrl: string,
  toUrl: string,
  trigger?: Element,
  origin = getDefaultOrigin(),
): boolean {
  if (getSearchTransitionScope(fromUrl, toUrl, origin) !== 'leave-search')
    return false

  const target = new URL(toUrl, origin)
  return target.pathname.startsWith('/articles/')
    && trigger?.closest(searchResultLinkSelector) != null
}
