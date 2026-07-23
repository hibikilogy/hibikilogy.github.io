import type { AppContext, PageContext } from '../../app/index.ts'

export async function mountSearchPage(
  app: AppContext,
  page: PageContext,
): Promise<void> {
  const module = await import('./page/index.ts')
  if (!page.scope.active || !page.root.isConnected)
    return

  page.run(() => module.mountSearchPage(app, page))
}
