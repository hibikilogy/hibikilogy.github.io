import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearTransitionState,
  markOverlaySettling,
  settleTransitionState,
  setTransitionState,
} from './transitionState.ts'

describe('transition state lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearTransitionState()
    // Keep the veil-retract delay realistic even if happy-dom cannot resolve
    // the CSS custom property.
    document.documentElement.style.setProperty('--duration-curtain', '560ms')
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.style.removeProperty('--duration-curtain')
    clearTransitionState()
  })

  it('defers clearing while the search veil retracts, then clears', () => {
    setTransitionState('/search', '/')
    expect(document.documentElement.dataset.searchOverlay).toBe('active')

    settleTransitionState()
    expect(document.documentElement.dataset.searchOverlay).toBe('active')

    vi.advanceTimersByTime(1_000)
    expect(document.documentElement.hasAttribute('data-search-overlay')).toBe(false)
  })

  it('keeps the covering veil when a new visit starts before the aborted one rendered', () => {
    // 搜索访问被中断：幕布还盖着、尚未渲染，排定的延迟清理挂在旧代次上。
    setTransitionState('/search', '/')
    settleTransitionState()
    // 新访问是普通页面：幕布必须保持盖住，直到新目标渲染时才回撤。
    setTransitionState('/', '/article')

    expect(document.documentElement.dataset.searchOverlay).toBe('active')

    // 旧代次的延迟清理因代次变化而失效。
    vi.advanceTimersByTime(1_000)
    expect(document.documentElement.dataset.searchOverlay).toBe('active')
  })

  it('clears leftover overlay state when the new visit is not a search transition and the veil is retracting', () => {
    // 搜索访问已渲染，幕布正在回撤。
    setTransitionState('/search', '/')
    markOverlaySettling()
    // 新访问是普通页面：立即清掉残留 overlay，避免白幕随新访问重新盖回。
    setTransitionState('/', '/article')

    expect(document.documentElement.hasAttribute('data-search-overlay')).toBe(false)
  })

  it('keeps overlay state when the new visit is still a search transition', () => {
    setTransitionState('/search', '/')
    markOverlaySettling()

    setTransitionState('/', '/search')

    expect(document.documentElement.dataset.searchOverlay).toBe('active')
    expect(document.documentElement.dataset.searchOverlayScope).toBe('enter-search')
  })

  it('clears immediately when no overlay is active', () => {
    setTransitionState('/', '/article')

    settleTransitionState()

    expect(document.documentElement.hasAttribute('data-search-overlay')).toBe(false)
  })
})
