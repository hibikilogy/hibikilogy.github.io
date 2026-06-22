import { getPathname, normalizePathname } from '../shared/url.ts'

export type PaginationTransitionDirection = 'forward' | 'backward'

export function getPaginationTransitionDirection(
  fromUrl: string,
  toUrl: string,
  origin = 'https://hibikilogy.local',
): PaginationTransitionDirection | null {
  const fromPage = parsePaginationLocation(fromUrl, origin)
  const toPage = parsePaginationLocation(toUrl, origin)

  if (!fromPage || !toPage)
    return null
  if (fromPage.basePath !== toPage.basePath)
    return null
  if (fromPage.pageNumber === toPage.pageNumber)
    return null

  return toPage.pageNumber > fromPage.pageNumber ? 'forward' : 'backward'
}

function parsePaginationLocation(url: string, origin: string): { basePath: string, pageNumber: number } | null {
  const pathname = normalizePathname(getPathname(url, origin))
  const match = pathname.match(/^(.*?)(?:\/page\/(\d+))?$/)
  if (!match)
    return null

  const basePath = normalizePathname(match[1] || '/')
  const pageNumber = Number.parseInt(match[2] || '1', 10)

  if (!Number.isFinite(pageNumber) || pageNumber < 1)
    return null
  return { basePath, pageNumber }
}
