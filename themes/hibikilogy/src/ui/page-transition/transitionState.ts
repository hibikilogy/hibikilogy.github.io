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

let transitionEpoch = 0
let overlaySettling = false

export function setTransitionState(fromUrl: string, toUrl: string): void {
  transitionEpoch += 1
  const root = document.documentElement
  const searchScope = getSearchTransitionScope(fromUrl, toUrl)
  const paginationDirection = getPaginationTransitionDirection(fromUrl, toUrl)

  if (!searchScope && overlaySettling) {
    clearTransitionState()
  }

  if (searchScope) {
    overlaySettling = false
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
  overlaySettling = false
}

/** Records that the search overlay started retracting after content:replace. */
export function markOverlaySettling(): void {
  overlaySettling = document.documentElement.dataset.searchOverlay === 'active'
}

/** Clears the transition state at visit end; defers while the search veil is retracting. */
export function settleTransitionState(): void {
  if (document.documentElement.dataset.searchOverlay === 'active') {
    // Keep the veil's fill until its retract animation completes. The clear is
    const epoch = transitionEpoch
    deferClearSearchTransitionState(() => {
      if (transitionEpoch === epoch)
        clearTransitionState()
    })
  }
  else {
    clearTransitionState()
  }
}
