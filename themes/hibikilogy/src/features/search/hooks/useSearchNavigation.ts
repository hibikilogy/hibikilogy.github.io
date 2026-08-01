import type { RouteModel } from 'app/hooks/index.ts'
import type { SearchService } from '../types.ts'
import { supportsIdleCallback } from 'shared/capabilities.ts'
import { isEditableTarget, shouldIgnoreKeyEvent } from 'shared/keyboard.ts'
import { SEARCH_PATH } from 'shared/url.ts'
import { useEventListener } from 'shared/useEventListener.ts'
import { SEARCH_FOCUS_INTENT_KEY } from '../config.ts'
import { focusSearchInput, searchDom } from '../searchDom.ts'
import { preloadSearchPage } from '../searchPage.ts'

export function scheduleIdleSearchPreload(service: SearchService): void {
  if (!supportsIdleCallback())
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
    route.preload(SEARCH_PATH)
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
    sessionStorage.setItem(SEARCH_FOCUS_INTENT_KEY, focusIntent)
    route.navigate(SEARCH_PATH)
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
    if (shouldIgnoreKeyEvent(event))
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
