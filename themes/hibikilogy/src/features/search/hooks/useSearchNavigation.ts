import type { RouteModel } from 'app/hooks/index.ts'
import type { SearchService } from '../types.ts'
import { useEventListener } from 'shared/hooks/index.ts'
import { searchFocusIntentKey } from '../config.ts'
import { focusSearchInput, searchDom } from '../searchDom.ts'
import { preloadSearchPage } from '../searchPage.ts'

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
  )
}

export function scheduleIdleSearchPreload(service: SearchService): void {
  if (!('requestIdleCallback' in window))
    return

  requestIdleCallback(() => {
    void Promise.all([
      preloadSearchPage(),
      service.preload(),
    ]).catch(() => {})
  })
}

export function useSearchNavigation(route: RouteModel, service: SearchService): void {
  function preloadSearch(): void {
    route.preload('/search')
    void Promise.all([
      preloadSearchPage(),
      service.preload(),
    ]).catch(() => {})
  }

  function openSearch(focusIntent = 'pointer'): void {
    if (route.isSearchPage.value) {
      focusSearchInput()
      return
    }
    preloadSearch()
    sessionStorage.setItem(searchFocusIntentKey, focusIntent)
    route.navigate('/search')
  }

  useEventListener(document, 'pointerover', (event) => {
    if ((event.target as Element | null)?.closest(searchDom.openTrigger))
      preloadSearch()
  })

  useEventListener(document, 'focusin', (event) => {
    if ((event.target as Element | null)?.closest(searchDom.openTrigger))
      preloadSearch()
  })

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
