import type { AppContext, PageContext } from './types.ts'
import { effectScope } from '@vue/reactivity'
import { resolvePageData, useLayout } from './hooks/index.ts'

export function createPageContext(app: AppContext, root: HTMLElement): PageContext {
  const scope = effectScope()
  const value = scope.run(() => ({
    data: resolvePageData(root),
    layout: useLayout(root, app.route),
  }))
  if (!value)
    throw new Error('Unable to create page scope')

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
