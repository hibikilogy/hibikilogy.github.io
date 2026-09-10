import {
  isCacheablePageResponse,
  isExcludedPath,
  isPageRequest,
  isSameOriginGet,
  isStaticAssetRequest,
  LEGACY_PAGE_CACHE_PREFIX,
  PAGE_CACHE_PREFIX,
  SERVICE_WORKER_VERSION,
  shouldUseNavigationPreload,
  STATIC_CACHE_PREFIX,
} from './policy.ts'

const worker = globalThis as unknown as ServiceWorkerGlobalScope
const scopeUrl = new URL(worker.registration.scope)
const scopePath = scopeUrl.pathname
const staticCacheName = `${STATIC_CACHE_PREFIX}${SERVICE_WORKER_VERSION}`
const pageCacheName = `${PAGE_CACHE_PREFIX}${SERVICE_WORKER_VERSION}`

worker.addEventListener('install', () => {
  // Do not precache the site. The worker only becomes active after the
  // current page is closed, preventing mixed app/cache versions in a tab.
})

worker.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await worker.registration.navigationPreload?.enable()
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => (
        (key.startsWith(STATIC_CACHE_PREFIX) && key !== staticCacheName)
        || (key.startsWith(PAGE_CACHE_PREFIX) && key !== pageCacheName)
        || key.startsWith(LEGACY_PAGE_CACHE_PREFIX)
      ))
      .map(key => caches.delete(key)))
  })())
})

worker.addEventListener('fetch', (event) => {
  const request = event.request
  const requestUrl = new URL(request.url)

  if (!isSameOriginGet(request, scopeUrl) || isExcludedPath(requestUrl.pathname, scopePath))
    return

  if (isPageRequest(request, scopePath)) {
    const preloadResponse = shouldUseNavigationPreload(request)
      ? event.preloadResponse
      : Promise.resolve(undefined)
    event.respondWith(networkFirstPage(request, preloadResponse, event))
    return
  }

  if (isStaticAssetRequest(request, scopePath))
    event.respondWith(cacheFirstStatic(request, event))
})

async function networkFirstPage(
  request: Request,
  preloadResponse: Promise<Response | undefined>,
  event: FetchEvent,
): Promise<Response> {
  try {
    const preloaded = await preloadResponse.catch(() => undefined)
    const response = preloaded ?? await fetch(new Request(request, { cache: 'no-cache' }))
    if (isCacheablePageResponse(response))
      event.waitUntil(cacheResponse(pageCacheName, request, response.clone()))
    return response
  }
  catch (error) {
    const cache = await caches.open(pageCacheName)
    const cached = await cache.match(request)
    if (cached)
      return cached
    throw error
  }
}

async function cacheFirstStatic(request: Request, event: FetchEvent): Promise<Response> {
  const cache = await caches.open(staticCacheName)
  const cached = await cache.match(request)
  if (cached)
    return cached

  const response = await fetch(request)
  if (response.ok && response.type !== 'opaque')
    event.waitUntil(cacheResponse(staticCacheName, request, response.clone()))
  return response
}

async function cacheResponse(
  cacheName: string,
  request: Request,
  response: Response,
): Promise<void> {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response)
  }
  catch {
    // Cache quota or storage failures must not hide a fresh network response.
  }
}
