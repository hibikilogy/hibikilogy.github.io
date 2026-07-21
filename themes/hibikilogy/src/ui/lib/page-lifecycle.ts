import { initializeAccordions } from '../accordion.ts'
import { disposeOutline, initOutline } from '../outline.ts'
import { bootWaterFalls, disposeWaterFalls } from '../water-fall.ts'
import { disposeArticlePage, initArticlePage } from './article-page.ts'
import type { HistoryAdapter, PageContext } from './page-context.ts'
import type { SearchPageHandle } from '../../search/lib/page.ts'

type SearchPageModule = typeof import('../../search/lib/page.ts')

let searchPageLoading: Promise<SearchPageModule> | null = null
let activeSearchPage: SearchPageHandle | null = null

/**
 * Dispose callbacks registered via the active {@link PageContext}.
 * Held on the lifecycle module so feature modules can opt-in to cleanup
 * without lifecycle needing hard-coded knowledge of each one.
 */
const pendingDisposeCallbacks = new Set<() => void>()

function loadSearchPageModule(): Promise<SearchPageModule> | null {
  if (!document.querySelector('#search'))
    return null

  if (!searchPageLoading)
    searchPageLoading = import('../../search/lib/page.ts')

  return searchPageLoading
}

/**
 * Build a {@link PageContext} for the current visit. `history` is supplied by
 * the caller (e.g. a swup-aware adapter); the returned context also exposes
 * an `onDispose` registration backed by this module's pending set.
 */
export function createPageContext(history: HistoryAdapter): PageContext {
  return {
    history,
    onDispose: callback => pendingDisposeCallbacks.add(callback),
  }
}

export async function initializePageModules(ctx: PageContext): Promise<void> {
  initializeAccordions()
  bindPaginationNavigation()
  initOutline()
  bootWaterFalls()
  void initArticlePage()

  const searchModule = await loadSearchPageModule()
  if (!searchModule || !document.querySelector('#search'))
    return

  activeSearchPage?.dispose()
  activeSearchPage = searchModule.createSearchPage(ctx)
  await activeSearchPage.init()
}

export function disposePageModules(): void {
  activeSearchPage?.dispose()
  activeSearchPage = null
  disposeArticlePage()
  disposeOutline()
  disposeWaterFalls()

  const callbacks = [...pendingDisposeCallbacks]
  pendingDisposeCallbacks.clear()
  for (const callback of callbacks) {
    try {
      callback()
    }
    catch (error) {
      console.error(error)
    }
  }
}

function bindPaginationNavigation(): void {
  document
    .querySelectorAll<HTMLElement>('site-pagination:not(#search-page-control)')
    .forEach(pagination => pagination.setAttribute('mode', 'event'))
}

export function listenForPaginationNavigation(navigate: (url: string) => void): void {
  document.addEventListener('page-change', (event) => {
    const customEvent = event as CustomEvent<{ href?: string }>
    const pagination = customEvent.target
    const href = customEvent.detail?.href

    if (!(pagination instanceof HTMLElement) || pagination.id === 'search-page-control' || !href)
      return

    navigate(href)
  })
}
