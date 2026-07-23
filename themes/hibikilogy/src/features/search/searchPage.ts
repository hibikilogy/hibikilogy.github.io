import type { AppContext, PageContext } from '../../app/index.ts'

type SearchPageModule = typeof import('./page/index.ts')

let modulePromise: Promise<SearchPageModule> | null = null

function loadSearchPage(): Promise<SearchPageModule> {
  if (!modulePromise) {
    const pending = import('./page/index.ts')
    modulePromise = pending
    void pending.catch(() => {
      if (modulePromise === pending)
        modulePromise = null
    })
  }
  return modulePromise
}

export async function preloadSearchPage(): Promise<void> {
  await loadSearchPage()
}

export async function mountSearchPage(
  app: AppContext,
  page: PageContext,
): Promise<void> {
  const module = await loadSearchPage()
  if (!page.scope.active || !page.root.isConnected)
    return

  page.run(() => module.mountSearchPage(app, page))
}
