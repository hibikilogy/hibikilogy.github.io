import { getPaginationTransitionDirection } from './paginationTransition.ts'
import { deferClearSearchTransitionState } from './searchBoxTransition.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

const transitionAttributes = [
  'data-search-transition',
  'data-search-transition-scope',
  'data-search-overlay',
  'data-search-overlay-scope',
  'data-page-transition',
  'data-page-transition-direction',
]

export function setTransitionState(fromUrl: string, toUrl: string): void {
  const root = document.documentElement
  const searchScope = getSearchTransitionScope(fromUrl, toUrl)
  const paginationDirection = getPaginationTransitionDirection(fromUrl, toUrl)

  if (searchScope) {
    root.dataset.searchTransition = 'active'
    root.dataset.searchTransitionScope = searchScope
    root.dataset.searchOverlay = 'active'
    root.dataset.searchOverlayScope = searchScope
  }

  if (paginationDirection) {
    root.dataset.pageTransition = 'active'
    root.dataset.pageTransitionDirection = paginationDirection
  }
}

export function clearTransitionState(): void {
  for (const attribute of transitionAttributes)
    document.documentElement.removeAttribute(attribute)
}

/** Clears the transition state at visit end; defers while the search veil is retracting. */
export function settleTransitionState(): void {
  if (document.documentElement.dataset.searchOverlay === 'active') {
    // Keep the veil's fill until its retract animation completes.
    deferClearSearchTransitionState(clearTransitionState)
  }
  else {
    clearTransitionState()
  }
}
