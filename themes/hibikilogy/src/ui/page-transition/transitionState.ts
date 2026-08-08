import { getPaginationTransitionDirection } from './paginationTransition.ts'
import { deferClearSearchTransitionState } from './searchBoxTransition.ts'
import {
  getSearchTransitionScope,
  isSearchResultArticleTransition,
} from './searchTransition.ts'

const transitionAttributes = [
  'data-search-transition',
  'data-search-transition-scope',
  'data-search-transition-mode',
  'data-search-overlay',
  'data-search-overlay-scope',
  'data-page-transition',
  'data-page-transition-direction',
]

// 每次 visit 自增；延迟清理校验代次，被中断访问排定的清理不会误清新访问。
let transitionEpoch = 0

// 幕布是否已进入回撤阶段：区分「访问被中断（须保持盖住）」与「上一访问已渲染（可直接清理）」。
let overlaySettling = false

export function setTransitionState(fromUrl: string, toUrl: string, trigger?: Element): void {
  transitionEpoch += 1
  const root = document.documentElement
  const searchScope = getSearchTransitionScope(fromUrl, toUrl)
  const paginationDirection = getPaginationTransitionDirection(fromUrl, toUrl)

  // An interrupted visit may leave the previous mode in place until the next
  // snapshot. Always derive this visit's specialized mode from its own trigger.
  root.removeAttribute('data-search-transition-mode')

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
    if (isSearchResultArticleTransition(fromUrl, toUrl, trigger))
      root.dataset.searchTransitionMode = 'article-result'
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

/** 记录搜索过渡已完成内容替换，旧页面或幕布正在退场。 */
export function markOverlaySettling(): void {
  overlaySettling = document.documentElement.dataset.searchOverlay === 'active'
}

/** 访问结束时清理过渡状态；只有进入搜索页的幕布仍需延迟收尾。 */
export function settleTransitionState(): void {
  const root = document.documentElement
  if (root.dataset.searchOverlay === 'active' && root.dataset.searchOverlayScope === 'enter-search') {
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
