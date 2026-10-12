import { resolveDurationMs } from 'shared/animation.ts'
import { getPaginationTransitionDirection } from './paginationTransition.ts'
import {
  getSearchTransitionScope,
  isSearchResultArticleTransition,
} from './searchTransition.ts'

const transitionAttributes = [
  'data-search-transition-source',
  'data-search-transition',
  'data-search-transition-scope',
  'data-search-transition-mode',
  'data-search-overlay',
  'data-page-transition',
  'data-page-transition-direction',
]

// Allow the final painted frame to land before removing the veil's fill state.
const SEARCH_VEIL_CLEAR_GRACE_MS = 20

// 每次 visit 自增；延迟清理校验代次，被中断访问排定的清理不会误清新访问。
let searchTransitionEpoch = 0

// 幕布是否已进入回撤阶段：区分「访问被中断（须保持盖住）」与「上一访问已渲染（可直接清理）」。
let searchOverlaySettling = false

export function prepareSearchTransitionSource(fromUrl: string, toUrl: string): void {
  if (getSearchTransitionScope(fromUrl, toUrl) !== 'enter-search')
    return

  const root = document.documentElement
  root.dataset.searchTransitionSource = 'enter-search'
  queueMicrotask(() => {
    if (root.dataset.searchTransition !== 'active')
      root.removeAttribute('data-search-transition-source')
  })
}

export function setTransitionState(fromUrl: string, toUrl: string, trigger?: Element): void {
  searchTransitionEpoch += 1
  const root = document.documentElement
  const searchScope = getSearchTransitionScope(fromUrl, toUrl)
  const paginationDirection = getPaginationTransitionDirection(fromUrl, toUrl)

  // An interrupted visit may leave the previous mode in place until the next
  // snapshot. Always derive this visit's specialized mode from its own trigger.
  root.removeAttribute('data-search-transition-mode')

  if (!searchScope && searchOverlaySettling) {
    // 幕布回撤中来了普通访问：立即清掉残留 overlay，避免白幕随新访问重新盖回。
    clearTransitionState()
  }

  if (searchScope) {
    searchOverlaySettling = false
    root.dataset.searchTransition = 'active'
    root.dataset.searchTransitionScope = searchScope
    root.dataset.searchOverlay = 'active'
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
  searchOverlaySettling = false
}

/** 记录搜索过渡已完成内容替换，旧页面或幕布正在退场。 */
export function markOverlaySettling(): void {
  searchOverlaySettling = document.documentElement.dataset.searchOverlay === 'active'
}

/** 访问结束时清理过渡状态；只有进入搜索页的幕布仍需延迟收尾。 */
export function settleTransitionState(): void {
  const root = document.documentElement
  if (root.dataset.searchOverlay === 'active' && root.dataset.searchTransitionScope === 'enter-search') {
    // 保持幕布 fill 直到回撤动画结束；带代次守卫，新 visit 已开始则放弃清理。
    const epoch = searchTransitionEpoch
    window.setTimeout(() => {
      if (searchTransitionEpoch === epoch)
        clearTransitionState()
    }, resolveDurationMs('searchVeil') + SEARCH_VEIL_CLEAR_GRACE_MS)
  }
  else {
    clearTransitionState()
  }
}
