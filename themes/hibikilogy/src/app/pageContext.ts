import type { LayoutModel, PageData } from './hooks/index.ts'
import type { AppContext, PageContext } from './types.ts'
import { effectScope } from '@vue/reactivity'
import { resolvePageData, useLayout } from './hooks/index.ts'

export function createPageContext(app: AppContext, root: HTMLElement): PageContext {
  const scope = effectScope()
  const value = scope.run(() => ({
    data: resolvePageData(root),
    layout: useLayout(root, app.route),
  })) as { data: PageData, layout: LayoutModel }

  return {
    scope,
    root,
    ...value,
    run: <T>(callback: () => T): T => {
      if (!scope.active)
        throw new Error('Page scope is inactive')
      return scope.run(callback) as T
    },
    dispose: () => scope.stop(),
  }
}
