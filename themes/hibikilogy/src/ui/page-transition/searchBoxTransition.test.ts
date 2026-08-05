import { afterEach, describe, expect, it } from 'vitest'
import { shouldDisableNativeTransition } from './searchBoxTransition.ts'

const originalMatchMedia = globalThis.matchMedia

function stubMaxTabletViewport(matches: boolean): void {
  globalThis.matchMedia = (() => ({ matches })) as unknown as typeof matchMedia
}

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia
})

describe('shouldDisableNativeTransition', () => {
  it('disables native transitions for search crossings on mobile viewports', () => {
    stubMaxTabletViewport(true)

    expect(shouldDisableNativeTransition('/', '/search')).toBe(true)
    expect(shouldDisableNativeTransition('/search', '/')).toBe(true)
  })

  it('keeps native transitions for non-search visits on mobile viewports', () => {
    stubMaxTabletViewport(true)

    expect(shouldDisableNativeTransition('/', '/tags')).toBe(false)
    expect(shouldDisableNativeTransition('/search', '/search')).toBe(false)
  })

  it('keeps native transitions for search crossings on desktop viewports', () => {
    stubMaxTabletViewport(false)

    expect(shouldDisableNativeTransition('/', '/search')).toBe(false)
    expect(shouldDisableNativeTransition('/search', '/')).toBe(false)
  })
})
