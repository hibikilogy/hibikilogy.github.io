import { afterEach, describe, expect, it } from 'vitest'
import { shouldKeepNativeTransition } from './nativeTransition.ts'

const originalMatchMedia = globalThis.matchMedia

function stubViewport(matches: boolean): void {
  globalThis.matchMedia = (() => ({ matches })) as unknown as typeof matchMedia
}

function stubRunningCascade(): void {
  Object.defineProperty(document, 'getAnimations', {
    configurable: true,
    value: () => [
      { animationName: 'page-enter', playState: 'running' },
    ] as unknown as Animation[],
  })
}

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia
  Reflect.deleteProperty(document, 'getAnimations')
})

describe('shouldKeepNativeTransition', () => {
  it('keeps the old-page snapshot when leaving search on mobile viewports', () => {
    stubViewport(true)

    expect(shouldKeepNativeTransition('/search', '/', false)).toBe(true)
    expect(shouldKeepNativeTransition('/', '/search', false)).toBe(false)
  })

  it('keeps native transitions for search crossings on desktop viewports', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/search', '/', false)).toBe(true)
    expect(shouldKeepNativeTransition('/', '/search', false)).toBe(true)
  })

  it('swaps instantly for interrupted visits and for a still-running page-enter cascade', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/', '/articles', true)).toBe(false)

    stubRunningCascade()
    expect(shouldKeepNativeTransition('/', '/articles', false)).toBe(false)
  })

  it('exempts search crossings from the cascade interrupt', () => {
    stubViewport(false)
    stubRunningCascade()

    // 搜索过渡有自己的幕布/morph 编排，不应被强制成瞬间交换。
    expect(shouldKeepNativeTransition('/search', '/article', false)).toBe(true)
    expect(shouldKeepNativeTransition('/', '/articles', false)).toBe(false)
  })

  it('keeps native transitions for uninterrupted regular visits', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/', '/articles', false)).toBe(true)
  })
})
