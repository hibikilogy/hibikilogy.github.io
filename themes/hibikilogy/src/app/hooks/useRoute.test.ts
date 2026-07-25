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

  it('navigates to the fallback in a fresh session (external referrer)', () => {
    window.history.replaceState({ source: 'swup', index: 1 }, '', '/search')
    const swup = createSwupMock()
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const scope = effectScope()
    const route = scope.run(() => useRoute(swup))!
    route.back('/')

    expect(historyBack).not.toHaveBeenCalled()
    expect(swup.navigate).toHaveBeenCalledWith('/')
    scope.stop()
  })

  it('navigates to the fallback when history.state carries no swup record', () => {
    window.history.replaceState(null, '', '/search')
    const swup = createSwupMock()
    const historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    const scope = effectScope()
    const route = scope.run(() => useRoute(swup))!
    route.back('/')

    expect(historyBack).not.toHaveBeenCalled()
    expect(swup.navigate).toHaveBeenCalledWith('/')
    scope.stop()
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
