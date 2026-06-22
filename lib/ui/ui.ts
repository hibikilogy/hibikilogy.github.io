import { createApp, reactive } from 'petite-vue'
import { searchFocusIntentKey } from '../search/config.ts'
import { disposeSearchPage, initSearchPage } from '../search/page.ts'
import { initializeAccordions } from './accordion.ts'
import { disposeArticlePage, initArticlePage } from './article-page.ts'
import { initOutline } from './outline.ts'
import { getPaginationTransitionDirection } from './pagination-transition.ts'
import { getSearchTransitionScope, isSearchUrl, searchPath } from './search-transition.ts'
import { createSwup } from './swup.ts'
import { focusCurrentSearchInput } from './utils.ts'
import { bootWaterFalls } from './water-fall.ts'

const swup = createSwup()
let uiApp: ReturnType<typeof createApp> | null = null

interface UiStore {
  navScreenIsOpen: boolean
  sortType: string
  scrollY: number
  toggleNavScreen: () => void
}

const store = reactive<UiStore>({
  navScreenIsOpen: false,
  sortType: 'date',
  scrollY: 0,
  toggleNavScreen() {
    this.navScreenIsOpen = !this.navScreenIsOpen
  },
})

window.addEventListener('scroll', () => {
  store.scrollY = window.scrollY || document.documentElement.scrollTop
})

function navScreenHandleClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element) || target.tagName.toLowerCase() !== 'a') {
    store.toggleNavScreen()
  }
}

function sortingHandleSelect(): void {
  swup.navigate(`/${store.sortType}`)
}

function isSearchPage(): boolean {
  return isSearchUrl(window.location.href)
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.isContentEditable)
    return true

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function setSearchTransitionScope(scope: string): void {
  document.documentElement.dataset.searchTransition = 'active'
  document.documentElement.dataset.searchTransitionScope = scope
  document.documentElement.dataset.searchOverlay = 'active'
  document.documentElement.dataset.searchOverlayScope = scope
}

function clearSearchTransitionScope(): void {
  document.documentElement.removeAttribute('data-search-transition')
  document.documentElement.removeAttribute('data-search-transition-scope')
  document.documentElement.removeAttribute('data-search-overlay')
  document.documentElement.removeAttribute('data-search-overlay-scope')
}

function setPaginationTransitionDirection(direction: string): void {
  document.documentElement.dataset.pageTransition = 'active'
  document.documentElement.dataset.pageTransitionDirection = direction
}

function clearPaginationTransitionDirection(): void {
  document.documentElement.removeAttribute('data-page-transition')
  document.documentElement.removeAttribute('data-page-transition-direction')
}

function navigateToSearch({ focusIntent = 'pointer' }: { focusIntent?: string } = {}): void {
  if (isSearchPage()) {
    focusCurrentSearchInput()
    return
  }

  sessionStorage.setItem(searchFocusIntentKey, focusIntent)
  swup.navigate(searchPath)
}

function leaveSearchPage(): boolean {
  if (!isSearchPage())
    return false

  if (window.history.length > 1) {
    window.history.back()
    return true
  }

  swup.navigate('/')
  return true
}

function mountUI(): void {
  uiApp?.unmount()
  uiApp = createApp({
    store,
    handleHamburgerClick,
    navScreenHandleClick,
    sortingHandleSelect,
    get NavBarClasses() {
      return {
        open: store.navScreenIsOpen,
        top: store.scrollY === 0,
      }
    },
    get NavHamburgerClasses() {
      return {
        open: store.navScreenIsOpen || isSearchPage(),
        top: store.scrollY === 0,
      }
    },
    get NavScreenStateClasses() {
      return {
        open: store.navScreenIsOpen,
        top: store.scrollY === 0,
      }
    },
  })
  uiApp.mount()
}

function handleHamburgerClick(): void {
  if (isSearchPage()) {
    leaveSearchPage()
    return
  }

  store.toggleNavScreen()
}

function initializePageModules(): void {
  initializeAccordions()
  bindPaginationNavigation()
  initOutline()
  bootWaterFalls()
  initSearchPage()
  void initArticlePage()
}

function disposePageModules(): void {
  disposeSearchPage()
  disposeArticlePage()
}

function syncSearchTransitionScope(fromUrl: string, toUrl: string): void {
  const scope = getSearchTransitionScope(fromUrl, toUrl)
  if (!scope)
    return

  setSearchTransitionScope(scope)
}

function syncPaginationTransitionScope(fromUrl: string, toUrl: string): void {
  const direction = getPaginationTransitionDirection(fromUrl, toUrl)
  if (!direction)
    return

  setPaginationTransitionDirection(direction)
}

function bindPaginationNavigation(): void {
  document
    .querySelectorAll<HTMLElement>('site-pagination:not(#search-page-control)')
    .forEach((pagination) => {
      pagination.setAttribute('mode', 'event')
    })
}

document.addEventListener('page-change', (event) => {
  const customEvent = event as CustomEvent<{ page?: number, href?: string }>
  const pagination = customEvent.target

  if (!(pagination instanceof HTMLElement))
    return
  if (pagination.id === 'search-page-control')
    return

  const href = customEvent.detail?.href
  if (!href)
    return

  swup.navigate(href)
})

// --- Swup lifecycle hooks ---

swup.hooks.on('visit:start', (visit) => {
  store.navScreenIsOpen = false
  syncSearchTransitionScope(visit.from.url, visit.to.url)
  syncPaginationTransitionScope(visit.from.url, visit.to.url)
  disposePageModules()
})

swup.hooks.on('content:replace', () => {
  mountUI()
  initializePageModules()
})

swup.hooks.on('visit:end', () => {
  clearSearchTransitionScope()
  clearPaginationTransitionDirection()
})

swup.hooks.on('visit:abort', () => {
  clearSearchTransitionScope()
  clearPaginationTransitionDirection()
})

window.navigateToSearch = navigateToSearch

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing || event.altKey)
    return

  if (event.key === 'Escape' && isSearchPage()) {
    event.preventDefault()
    leaveSearchPage()
    return
  }

  if (isEditableTarget(event.target))
    return

  const isCtrlOrCmdPressed = event.ctrlKey || event.metaKey
  const isKPressed = event.key.toLowerCase() === 'k'

  if (isCtrlOrCmdPressed && isKPressed) {
    event.preventDefault()

    if (isSearchPage()) {
      focusCurrentSearchInput()
      return
    }

    navigateToSearch({ focusIntent: 'keyboard' })
  }
})

mountUI()
initializePageModules()
