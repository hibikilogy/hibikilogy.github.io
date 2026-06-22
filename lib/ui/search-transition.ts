import { getPathname, normalizePathname } from '../shared/url.ts'

export const searchPath = '/search'

export type SearchTransitionScope = 'enter-search' | 'leave-search'

export function isSearchUrl(url: string, origin = 'https://hibikilogy.local'): boolean {
  return normalizePathname(getPathname(url, origin)) === searchPath
}

export function getSearchTransitionScope(
  fromUrl: string,
  toUrl: string,
  origin = 'https://hibikilogy.local',
): SearchTransitionScope | null {
  const fromSearch = isSearchUrl(fromUrl, origin)
  const toSearch = isSearchUrl(toUrl, origin)

  if (fromSearch === toSearch)
    return null
  return toSearch ? 'enter-search' : 'leave-search'
}
