import { afterEach, describe, expect, it } from 'vitest'
import {
  shouldDisableNativeTransition,
  waitForSearchTransition,
} from './searchBoxTransition.ts'

const originalMatchMedia = globalThis.matchMedia

function stubMaxTabletViewport(matches: boolean): void {
  globalThis.matchMedia = ((query: string) => ({
    matches: query.includes('max-width') ? matches : false,
  })) as unknown as typeof matchMedia
}

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia
  document.documentElement.style.removeProperty('--duration-search-morph')
  document.body.innerHTML = ''
})

describe('shouldDisableNativeTransition', () => {
  it('hands the enter-search veil to CSS only on mobile viewports', () => {
    stubMaxTabletViewport(true)

    expect(shouldDisableNativeTransition('/', '/search')).toBe(true)
    expect(shouldDisableNativeTransition('/search', '/')).toBe(false)
    expect(shouldDisableNativeTransition('/', '/tags')).toBe(false)
    expect(shouldDisableNativeTransition('/search', '/search')).toBe(false)
  })

  it('keeps native transitions for every search crossing on desktop viewports', () => {
    stubMaxTabletViewport(false)

    expect(shouldDisableNativeTransition('/', '/search')).toBe(false)
    expect(shouldDisableNativeTransition('/search', '/')).toBe(false)
  })
})

describe('waitForSearchTransition', () => {
  it('lets the native snapshot own the mobile leave animation without a hidden DOM wait', () => {
    stubMaxTabletViewport(true)

    expect(waitForSearchTransition('/search', '/', true, true)).toBeUndefined()
    expect(waitForSearchTransition('/search', '/', true, false)).toBeInstanceOf(Promise)
  })

  it('waits for the full morph instead of the shorter companion animation', async () => {
    stubMaxTabletViewport(true)
    document.documentElement.style.setProperty('--duration-search-morph', '200ms')
    document.body.innerHTML = '<div id="search"><div class="SearchShell--page"></div></div>'
    const box = document.querySelector<HTMLElement>('.SearchShell--page')!
    let settled = false
    const waiting = waitForSearchTransition('/search', '/', false, false)!.then(() => {
      settled = true
    })

    const popEnd = new Event('animationend')
    Object.defineProperty(popEnd, 'animationName', { value: 'search-box-pop-out' })
    box.dispatchEvent(popEnd)
    await Promise.resolve()
    expect(settled).toBe(false)

    const morphEnd = new Event('animationend')
    Object.defineProperty(morphEnd, 'animationName', { value: 'search-box-morph-out' })
    box.dispatchEvent(morphEnd)
    await waiting
    expect(settled).toBe(true)
  })
})
