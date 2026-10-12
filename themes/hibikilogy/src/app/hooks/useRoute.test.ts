import type Swup from 'swup'
import { effectScope } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRoute } from './useRoute.ts'

function createSwupMock(): Swup {
  return {
    hooks: { on: vi.fn(() => () => {}) },
    navigate: vi.fn(),
    preload: vi.fn(),
  } as unknown as Swup
}

describe('useRoute.back', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/search')
  })

  it('navigates to the fallback when the session has no prior same-site page', () => {
    // 外部来源进入（history.state 无 swup 记录）与全新会话走同一条回退路径。
    for (const state of [{ source: 'swup', index: 1 }, null]) {
      window.history.replaceState(state, '', '/search')
      const swup = createSwupMock()
      const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})

      const scope = effectScope()
      const route = scope.run(() => useRoute(swup))!
      route.back('/')

      expect(historyBack).not.toHaveBeenCalled()
      expect(swup.navigate).toHaveBeenCalledWith('/')
      scope.stop()
      historyBack.mockRestore()
    }
  })

  it('goes back in history when a prior same-site page exists this session', () => {
    window.history.replaceState({ source: 'swup', index: 2 }, '', '/search')
    const swup = createSwupMock()
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const scope = effectScope()
    const route = scope.run(() => useRoute(swup))!
    route.back('/')

    expect(historyBack).toHaveBeenCalledTimes(1)
    expect(swup.navigate).not.toHaveBeenCalled()
    scope.stop()
  })
})
