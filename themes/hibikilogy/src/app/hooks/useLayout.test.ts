import type { RouteModel } from './types.ts'
import { computed, effectScope, ref, shallowRef } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLayout } from './useLayout.ts'

describe('useLayout', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('synchronizes the navbar when the page scope mounts', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <header class="NavBar">
        <button class="NavBarHamburger" aria-expanded="false"></button>
        <div class="NavScreen"></div>
      </header>
    `
    document.body.append(root)

    const current = shallowRef({
      href: 'https://example.test/search',
      pathname: '/search',
      search: '',
      hash: '',
    })
    const route: RouteModel = {
      current,
      isNavigating: ref(false),
      isSearchPage: computed(() => current.value.pathname === '/search'),
      navigationKind: ref('initial'),
      preload: vi.fn(),
      navigate: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }
    const scope = effectScope()
    scope.run(() => useLayout(root, route))

    expect(root.querySelector('.NavBar')?.classList.contains('top')).toBe(true)
    expect(root.querySelector('.NavBarHamburger')?.classList.contains('open')).toBe(true)
    expect(root.querySelector('.NavBarHamburger')?.classList.contains('top')).toBe(true)
    expect(root.querySelector('.NavBarHamburger')?.getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('.NavScreen')?.classList.contains('top')).toBe(true)

    scope.stop()
  })
})
