import { searchFocusIntentKey } from '../../search/lib/config.ts'
import { preloadSearch } from '../../search/lib/index.ts'
import { focusCurrentSearchInput } from '../utils.ts'
import { isSearchUrl, searchPath } from './search-transition.ts'

interface SearchNavigationOptions {
  isVisitInProgress: () => boolean
  navigate: (url: string) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false

  return target.isContentEditable
    || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
}

export function createSearchNavigation({ isVisitInProgress, navigate }: SearchNavigationOptions) {
  const isSearchPage = () => isSearchUrl(window.location.href)

  function preloadSearchOnIntent(force = false): void {
    if (!force && shouldAvoidSearchPreload())
      return

    void preloadSearch().catch(() => {})
  }

  function navigateToSearch({ focusIntent = 'pointer' }: { focusIntent?: string } = {}): void {
    preloadSearchOnIntent(true)
    if (isSearchPage()) {
      focusCurrentSearchInput()
      return
    }

    sessionStorage.setItem(searchFocusIntentKey, focusIntent)
    navigate(searchPath)
  }

  function leaveSearchPage(): void {
    if (!isSearchPage() || isVisitInProgress())
      return

    if (window.history.length > 1) {
      window.history.back()
      return
    }

    navigate('/')
  }

  function handleKeyboardNavigation(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.altKey)
      return

    if (event.key === 'Escape' && isSearchPage()) {
      event.preventDefault()
      leaveSearchPage()
      return
    }

    if (isEditableTarget(event.target))
      return

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      if (isSearchPage()) {
        leaveSearchPage()
        return
      }
      navigateToSearch({ focusIntent: 'keyboard' })
    }
  }

  function handleSearchPointerIntent(event: PointerEvent): void {
    if (isCompactSearchTarget(event.target))
      preloadSearchOnIntent()
  }

  function handleSearchFocusIntent(event: FocusEvent): void {
    if (isCompactSearchTarget(event.target))
      preloadSearchOnIntent()
  }

  document.addEventListener('keydown', handleKeyboardNavigation)
  document.addEventListener('pointerover', handleSearchPointerIntent, { passive: true })
  document.addEventListener('focusin', handleSearchFocusIntent)

  return { isSearchPage, leaveSearchPage, navigateToSearch }
}

function isCompactSearchTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.SearchShell--compact'))
}

function shouldAvoidSearchPreload(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string, saveData?: boolean }
  }).connection

  return Boolean(
    connection?.saveData
    || connection?.effectiveType === 'slow-2g'
    || connection?.effectiveType === '2g',
  )
}

export function removeTrailingSlash(replace?: (url: string) => void): void {
  const { pathname, search, hash } = window.location
  if (pathname.length <= 1 || !pathname.endsWith('/'))
    return

  const normalized = pathname.replace(/\/+$/, '') + search + hash
  if (replace) {
    replace(normalized)
    return
  }
  window.history.replaceState(window.history.state, '', normalized)
}
