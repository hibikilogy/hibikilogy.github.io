const STATIC_PATH_PREFIXES = ['/js/chunks/', '/js/search/', '/styles/', '/fonts/']

// Bump only when the cache schema or invalidation behavior changes. Site
// content and ordinary frontend builds must not invalidate every cache.
export const SERVICE_WORKER_VERSION = 'v1'
export const STATIC_CACHE_PREFIX = 'hibikilogy-static-'
export const PAGE_CACHE_PREFIX = 'hibikilogy-pages-'
export const LEGACY_PAGE_CACHE_PREFIX = 'hibikilogy-articles-'

export interface ServiceWorkerScope {
  readonly origin: string
  readonly pathname: string
}

export function isSameOriginGet(request: Request, scope: ServiceWorkerScope): boolean {
  if (request.method !== 'GET')
    return false

  const url = new URL(request.url)
  return url.origin === scope.origin
}

export function isExcludedPath(pathname: string, scopePath = '/'): boolean {
  const path = pathWithinScope(pathname, scopePath)
  return path === 'admin' || path.startsWith('admin/')
}

export function isPageRequest(request: Request, scopePath = '/'): boolean {
  if (request.method !== 'GET')
    return false

  const url = new URL(request.url)
  if (isExcludedPath(url.pathname, scopePath))
    return false

  const path = pathWithinScope(url.pathname, scopePath)
  if (isExcludedPagePath(path))
    return false

  return request.mode === 'navigate'
    || request.headers.get('accept')?.includes('text/html') === true
}

export function shouldUseNavigationPreload(request: Request): boolean {
  return request.mode === 'navigate'
}

function isExcludedPagePath(path: string): boolean {
  return path === 'search'
    || path.startsWith('search/')
    || path.startsWith('search-articles/')
    || path.startsWith('search-tags/')
}

export function isStaticAssetRequest(request: Request, scopePath = '/'): boolean {
  if (request.method !== 'GET')
    return false

  const url = new URL(request.url)
  if (isExcludedPath(url.pathname, scopePath))
    return false

  const path = `/${pathWithinScope(url.pathname, scopePath)}`
  return url.searchParams.has('h')
    || STATIC_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

export function isCacheablePageResponse(response: Response): boolean {
  if (!response.ok || response.redirected || response.type === 'opaque')
    return false

  return response.headers.get('content-type')?.toLowerCase().includes('text/html') === true
}

function pathWithinScope(pathname: string, scopePath: string): string {
  const normalizedScope = scopePath.endsWith('/') ? scopePath : `${scopePath}/`
  if (!pathname.startsWith(normalizedScope))
    return pathname.replace(/^\//, '')

  return pathname.slice(normalizedScope.length)
}
