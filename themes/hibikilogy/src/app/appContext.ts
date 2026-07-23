import type Swup from 'swup'
import type { AppContext } from './types.ts'
import { effectScope } from '@vue/reactivity'
import { createSearchService, getSearchBootstrap, useSearchNavigation } from '../features/search/index.ts'
import { getRuntimeConfig } from '../infrastructure/runtime-config/index.ts'
import { usePaginationNavigation, useRoute } from './hooks/index.ts'

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
    useSearchNavigation(route, searchService)
    usePaginationNavigation(route)
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
