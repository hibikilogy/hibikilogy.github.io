import type { RouteModel } from 'app/hooks/index.ts'
import type { SearchService } from '../types.ts'
import { useEventListener } from 'app/hooks/index.ts'
import { searchFocusIntentKey } from '../config.ts'
import { focusSearchInput, searchDom } from '../page/dom.ts'

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
  )
}

export function useSearchNavigation(route: RouteModel, service: SearchService): void {
  function openSearch(focusIntent = 'pointer'): void {
    if (route.isSearchPage.value) {
      focusSearchInput()
      return
    }
    sessionStorage.setItem(searchFocusIntentKey, focusIntent)
    route.navigate('/search')
  }

  useEventListener(document, 'click', (event) => {
    const trigger = (event.target as Element | null)?.closest(searchDom.openTrigger)
    if (!trigger)
      return
    event.preventDefault()
    openSearch()
  })

  useEventListener(document, 'submit', (event) => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.matches(searchDom.openTrigger))
      return
    event.preventDefault()
    openSearch()
  })

  useEventListener(document, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey)
      return

    if (event.key === 'Escape' && route.isSearchPage.value) {
      event.preventDefault()
      route.back('/')
      return
    }

    if (isEditableTarget(event.target))
      return

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (route.isSearchPage.value)
        route.back('/')
      else
        openSearch('keyboard')
    }
  })

  useEventListener(document, 'focusin', (event) => {
    if (route.isSearchPage.value && (event.target as Element | null)?.closest(searchDom.form))
      void service.preload().catch(() => {})
  })
}
