import { getDefaultOrigin, isSearchUrl } from 'shared/url.ts'

export type SearchTransitionScope = 'enter-search' | 'leave-search'

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
