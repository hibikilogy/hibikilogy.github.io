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
  it('disables native transitions for search crossings on mobile viewports', () => {
    stubViewport(true)

    expect(shouldKeepNativeTransition('/search', '/', false)).toBe(false)
    expect(shouldKeepNativeTransition('/', '/search', false)).toBe(false)
  })

  it('keeps native transitions for search crossings on desktop viewports', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/search', '/', false)).toBe(true)
    expect(shouldKeepNativeTransition('/', '/search', false)).toBe(true)
  })

  it('swaps instantly for interrupted regular visits', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/', '/articles', true)).toBe(false)
  })

  it('swaps instantly while the page-enter cascade is still running', () => {
    stubViewport(false)
    stubRunningCascade()

    expect(shouldKeepNativeTransition('/', '/articles', false)).toBe(false)
  })

  it('keeps native transitions for uninterrupted regular visits', () => {
    stubViewport(false)

    expect(shouldKeepNativeTransition('/', '/articles', false)).toBe(true)
  })
})
