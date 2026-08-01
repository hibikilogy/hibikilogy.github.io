import type Swup from 'swup'
import type { AppContext } from './types.ts'
import { effectScope, onScopeDispose } from '@vue/reactivity'
import { createSearchService, getSearchBootstrap, useSearchNavigation } from '../features/search/index.ts'
import { createFetchLatencyMonitor } from '../infrastructure/network/index.ts'
import { SwupPagePreloadPlugin } from '../infrastructure/swup/index.ts'
import { getRuntimeConfig } from '../shared/runtime-config/index.ts'
import { useNavigationPriority, useNavigationProgress, usePaginationNavigation, useRoute } from './hooks/index.ts'

export function createAppContext(swup: Swup): AppContext {
  const scope = effectScope(true)
  const config = getRuntimeConfig()
  const route = scope.run(() => useRoute(swup))
  if (!route)
    throw new Error('Unable to create application route scope')

  const searchService = createSearchService({
    workerUrl: config.searchWorkerUrl,
    getBootstrap: () => getSearchBootstrap(config),
  })

  scope.run(() => {
    setupNavigationFeatures(route, searchService)
    setupNetworkAndPreload(swup)
  })

  return {
    scope,
    route,
    searchService,
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
  useSearchNavigation(route, searchService)
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
