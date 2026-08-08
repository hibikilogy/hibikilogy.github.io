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

// 每次 visit 自增；延迟清理校验代次，被中断访问排定的清理不会误清新访问。
let transitionEpoch = 0

// 幕布是否已进入回撤阶段：区分「访问被中断（须保持盖住）」与「上一访问已渲染（可直接清理）」。
let overlaySettling = false

export function setTransitionState(fromUrl: string, toUrl: string): void {
  transitionEpoch += 1
  const root = document.documentElement
  const searchScope = getSearchTransitionScope(fromUrl, toUrl)
  const paginationDirection = getPaginationTransitionDirection(fromUrl, toUrl)

  if (!searchScope && overlaySettling) {
    // 幕布回撤中来了普通访问：立即清掉残留 overlay，避免白幕随新访问重新盖回。
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

/** 记录幕布已进入回撤阶段（content:replace 后）。 */
export function markOverlaySettling(): void {
  overlaySettling = document.documentElement.dataset.searchOverlay === 'active'
}

/** 访问结束时清理过渡状态；幕布回撤期间延迟到回撤完成。 */
export function settleTransitionState(): void {
  if (document.documentElement.dataset.searchOverlay === 'active') {
    // 保持幕布 fill 直到回撤动画结束；带代次守卫，新 visit 已开始则放弃清理。
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
