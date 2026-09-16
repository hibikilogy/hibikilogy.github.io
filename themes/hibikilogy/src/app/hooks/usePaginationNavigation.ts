import type { RouteModel } from './types.ts'
import { useEventListener } from 'shared/useEventListener.ts'

export function usePaginationNavigation(route: RouteModel): void {
  useEventListener(document, 'page-change', (event) => {
    const customEvent = event as CustomEvent<{ href?: string }>
    const href = customEvent.detail?.href

    if (!href) {
      return
    }

    route.navigate(href)
  })
}
