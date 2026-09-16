import type { SearchNavigation, SearchPageScope, SearchService } from './types.ts'
import { createSingleFlight } from 'shared/singleFlight.ts'

type SearchPageModule = typeof import('./page/index.ts')

const loadSearchPage = createSingleFlight<SearchPageModule>(() => import('./page/index.ts'))

export async function preloadSearchPage(): Promise<void> {
  await loadSearchPage.run()
}

export async function mountSearchPage(
  nav: SearchNavigation,
  service: SearchService,
  scope: SearchPageScope,
): Promise<void> {
  const module = await loadSearchPage.run()
  if (!scope.isActive || !scope.root.isConnected)
    return

  scope.run(() => module.mountSearchPage(nav, service, scope.root))
}
