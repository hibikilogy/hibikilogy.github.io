import type { AppContext, PageContext } from '../../app/types.ts'
import { createSingleFlight } from 'shared/singleFlight.ts'

type SearchPageModule = typeof import('./page/index.ts')

const loadSearchPage = createSingleFlight<SearchPageModule>(() => import('./page/index.ts'))

export async function preloadSearchPage(): Promise<void> {
  await loadSearchPage.run()
}

export async function mountSearchPage(
  app: AppContext,
  page: PageContext,
): Promise<void> {
  const module = await loadSearchPage.run()
  if (!page.scope.active || !page.root.isConnected)
    return

  page.run(() => module.mountSearchPage(app, page))
}
