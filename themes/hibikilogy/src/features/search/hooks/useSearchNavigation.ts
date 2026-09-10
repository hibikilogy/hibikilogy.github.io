import type { SearchNavigation, SearchService } from '../types.ts'
import { isEditableTarget, shouldIgnoreKeyEvent } from 'shared/keyboard.ts'
import { SEARCH_PATH } from 'shared/url.ts'
import { useEventListener } from 'shared/useEventListener.ts'
import { SEARCH_FOCUS_INTENT_KEY } from '../config.ts'
import { preloadSearchAssets } from '../navigation.ts'
import { focusSearchInput, searchDom } from '../searchDom.ts'

export function useSearchNavigation(
  route: SearchNavigation,
  service: SearchService,
  prepareSourceCapture?: () => void,
): void {
  function preloadSearch(): void {
    route.preload(SEARCH_PATH)
    preloadSearchAssets(service)
  }

  function openSearch(focusIntent = 'pointer'): void {
    if (route.isSearchPage.value) {
      focusSearchInput()
      return
    }
    preloadSearch()
    sessionStorage.setItem(SEARCH_FOCUS_INTENT_KEY, focusIntent)
    prepareSourceCapture?.()
    route.navigate(SEARCH_PATH)
  }

  useEventListener(document, 'pointerover', (event) => {
    if ((event.target as Element | null)?.closest(searchDom.openTrigger))
      preloadSearch()
  })

  // pointerover misses taps and stationary-cursor clicks; pointerdown covers
  // both and gives the fetch a head start before `click`.
  useEventListener(document, 'pointerdown', (event) => {
    if ((event.target as Element | null)?.closest(searchDom.openTrigger))
      preloadSearch()
  })

  useEventListener(document, 'focusin', (event) => {
    const target = event.target as Element | null
    if (target?.closest(searchDom.openTrigger))
      preloadSearch()
    else if (route.isSearchPage.value && target?.closest(searchDom.form))
      void service.preload().catch(() => {})
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
}
