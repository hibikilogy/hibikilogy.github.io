import type Swup from 'swup'
import type { RouteModel } from './hooks/index.ts'
import type { AppContext } from './types.ts'
import { effectScope, onScopeDispose } from '@vue/reactivity'
import { HIBIKILOGY_CONFIG } from 'virtual:hibikilogy-config'
import { createPageViewCounter } from '../features/page-views/index.ts'
import { createSearchService, getSearchBootstrap, useSearchNavigation } from '../features/search/index.ts'
import { createFetchLatencyMonitor } from '../infrastructure/network/index.ts'
import { SwupPagePreloadPlugin } from '../infrastructure/swup/index.ts'
import { getRuntimeConfig } from '../shared/runtime-config/index.ts'
import { SEARCH_PATH } from '../shared/url.ts'
import { prepareSearchTransitionSource } from '../ui/page-transition/index.ts'
import { useNavigationPriority, useNavigationProgress, usePaginationNavigation, useRoute } from './hooks/index.ts'

export function createAppContext(swup: Swup): AppContext {
  const scope = effectScope(true)
  const config = getRuntimeConfig()
  const route = scope.run(() => useRoute(swup)) as RouteModel

  const searchService = createSearchService({
    workerUrl: config.searchWorkerUrl,
    getBootstrap: () => getSearchBootstrap(config),
  })

  // 计数键取生产基址，使预览站与本地开发读写正式站的同一份计数；
  // 未配置生产基址时退回当前来源。
  const pageViews = createPageViewCounter({
    endpoint: HIBIKILOGY_CONFIG.pageViewsEndpoint,
    identityBase: HIBIKILOGY_CONFIG.productionBaseUrl || window.location.origin,
  })

  scope.run(() => {
    setupNavigationFeatures(route, searchService)
    setupNetworkAndPreload(swup)
  })

  return {
    scope,
    route,
    searchService,
    pageViews,
    dispose: () => {
      searchService.dispose()
      scope.stop()
    },
  }
}

// Search shortcuts and the pagination page-change bridge.
function setupNavigationFeatures(
  route: AppContext['route'],
  searchService: AppContext['searchService'],
): void {
  useSearchNavigation(route, searchService, () => (
    prepareSearchTransitionSource(route.current.value.href, SEARCH_PATH)
  ))
  usePaginationNavigation(route)
}

// Network quality monitor, page preloading and the progress bar; seeded with
// the initial document fetch so classification starts one sample earlier.
function setupNetworkAndPreload(swup: Swup): void {
  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const latencyMonitor = createFetchLatencyMonitor({ seed: navigationEntry ? [navigationEntry.responseEnd] : [] })
  const preloader = new SwupPagePreloadPlugin({ isFastNetwork: () => latencyMonitor.isFast() })
  swup.use(preloader)
  onScopeDispose(() => swup.unuse(preloader.name))
  useNavigationPriority(swup, latencyMonitor, preloader)
  useNavigationProgress(swup, latencyMonitor)
}
