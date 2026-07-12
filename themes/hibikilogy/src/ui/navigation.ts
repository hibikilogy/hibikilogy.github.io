import { searchFocusIntentKey } from '../search/config.ts'
import { isSearchUrl, searchPath } from './search-transition.ts'
import { focusCurrentSearchInput } from './utils.ts'

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

  function navigateToSearch({ focusIntent = 'pointer' }: { focusIntent?: string } = {}): void {
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
      navigateToSearch({ focusIntent: 'keyboard' })
    }
  }

  document.addEventListener('keydown', handleKeyboardNavigation)

  return { isSearchPage, leaveSearchPage, navigateToSearch }
}

export function removeTrailingSlash(): void {
  const { pathname, search, hash } = window.location
  if (pathname.length <= 1 || !pathname.endsWith('/'))
    return

  window.history.replaceState(
    window.history.state,
    '',
    pathname.replace(/\/+$/, '') + search + hash,
  )
}
