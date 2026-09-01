import type { SearchNavigation, SearchService } from '../types.ts'

import { computed, effectScope, ref, shallowRef } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { preloadSearchPage } from '../searchPage.ts'
import { useSearchNavigation } from './useSearchNavigation.ts'

vi.mock('../searchPage.ts', () => ({
  preloadSearchPage: vi.fn(() => Promise.resolve()),
}))

describe('useSearchNavigation', () => {
  afterEach(() => {
    document.body.replaceChildren()
    sessionStorage.clear()
  })

  it('preloads the page module, route and search service on pointer intent', async () => {
    const trigger = document.createElement('form')
    trigger.dataset.action = 'open-search'
    document.body.append(trigger)

    const route = createRoute()
    const service = createService()
    const scope = effectScope()
    scope.run(() => useSearchNavigation(route, service))

    trigger.dispatchEvent(new Event('pointerover', { bubbles: true }))
    await Promise.resolve()

    expect(route.preload).toHaveBeenCalledWith('/search')
    expect(preloadSearchPage).toHaveBeenCalledOnce()
    expect(service.preload).toHaveBeenCalledOnce()

    scope.stop()
  })

  it('prepares the transition before starting search navigation', () => {
    const trigger = document.createElement('form')
    trigger.dataset.action = 'open-search'
    document.body.append(trigger)

    const route = createRoute()
    const service = createService()
    const prepareSourceCapture = vi.fn(() => {
      expect(route.navigate).not.toHaveBeenCalled()
    })
    const scope = effectScope()
    scope.run(() => useSearchNavigation(route, service, prepareSourceCapture))

    trigger.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))

    expect(prepareSourceCapture).toHaveBeenCalledOnce()
    expect(route.navigate).toHaveBeenCalledWith('/search')

    scope.stop()
  })
})

function createRoute(): SearchNavigation {
  const current = shallowRef({
    href: 'https://example.test/',
    pathname: '/',
    search: '',
    hash: '',
  })

  return {
    current,
    isSearchPage: computed(() => false),
    navigationKind: ref('initial'),
    preload: vi.fn(),
    navigate: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }
}

function createService(): SearchService {
  return {
    preload: vi.fn(() => Promise.resolve()),
    count: vi.fn(() => Promise.resolve(0)),
    search: vi.fn(() => Promise.resolve({ records: [] })),
    dispose: vi.fn(),
  }
}
