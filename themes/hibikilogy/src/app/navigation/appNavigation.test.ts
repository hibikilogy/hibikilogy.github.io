import type Swup from 'swup'
import type { AppContext } from '../types.ts'
import { effectScope } from '@vue/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupAppNavigation } from './appNavigation.ts'

const mocks = vi.hoisted(() => ({
  mountPageModules: vi.fn(),
  disposePageSpy: vi.fn(),
}))

// Observe page-scope lifecycle: the spy registers a scope-disposed callback
// inside each page, so it fires exactly when that page scope is stopped.
vi.mock('../page-modules/index.ts', async () => {
  const { onScopeDispose } = await import('@vue/reactivity')
  return {
    mountPageModules: mocks.mountPageModules.mockImplementation((_app, page) => {
      page.run(() => onScopeDispose(mocks.disposePageSpy))
    }),
  }
})

interface FakeSwup {
  hooks: {
    on: (name: string, handler: (visit: unknown) => unknown) => () => void
    before: (name: string, handler: (visit: unknown) => unknown) => () => void
  }
  trigger: (name: string, visit?: unknown) => Promise<void>
  onHandlers: (name: string) => number
}

function createFakeSwup(): FakeSwup {
  const registered = new Map<string, Array<(visit: unknown) => unknown>>()

  const register = (bucket: 'on' | 'before', name: string, handler: (visit: unknown) => unknown): (() => void) => {
    const key = `${bucket}:${name}`
    const handlers = registered.get(key) ?? []
    handlers.push(handler)
    registered.set(key, handlers)
    return () => {
      const list = registered.get(key)
      if (list)
        list.splice(list.indexOf(handler), 1)
    }
  }

  return {
    hooks: {
      on: (name, handler) => register('on', name, handler),
      before: (name, handler) => register('before', name, handler),
    },
    async trigger(name, visit = {}) {
      for (const bucket of ['before', 'on']) {
        for (const handler of [...(registered.get(`${bucket}:${name}`) ?? [])])
          await handler(visit)
      }
    },
    onHandlers: name => registered.get(`on:${name}`)?.length ?? 0,
  }
}

function createFakeApp(): { app: AppContext, scope: ReturnType<typeof effectScope> } {
  const scope = effectScope(true)
  const app = {
    scope,
    route: {
      isSearchPage: { value: false },
      replace: vi.fn(),
    },
    searchService: {},
    dispose: vi.fn(),
  } as unknown as AppContext
  return { app, scope }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  vi.clearAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('setupAppNavigation', () => {
  it('initializes the page on mount and disposes it with the app scope', () => {
    const swup = createFakeSwup()
    const { app, scope } = createFakeApp()

    scope.run(() => setupAppNavigation(swup as unknown as Swup, app))

    expect(mocks.mountPageModules).toHaveBeenCalledTimes(1)
    expect(mocks.disposePageSpy).not.toHaveBeenCalled()

    scope.stop()
    expect(mocks.disposePageSpy).toHaveBeenCalledTimes(1)
  })

  it('replaces the page scope on content:replace', async () => {
    const swup = createFakeSwup()
    const { app, scope } = createFakeApp()
    scope.run(() => setupAppNavigation(swup as unknown as Swup, app))

    await swup.trigger('content:replace', { id: 1 })

    expect(mocks.mountPageModules).toHaveBeenCalledTimes(2)
    expect(mocks.disposePageSpy).toHaveBeenCalledTimes(1)
  })

  it('nests every page scope under the app scope (P0-2 regression)', async () => {
    const swup = createFakeSwup()
    const { app, scope } = createFakeApp()
    scope.run(() => setupAppNavigation(swup as unknown as Swup, app))

    await swup.trigger('content:replace', { id: 1 })
    mocks.disposePageSpy.mockClear()

    scope.stop()
    expect(mocks.disposePageSpy).toHaveBeenCalledTimes(1)
  })

  it('unregisters swup hooks and stops page work after the app scope stops', async () => {
    const swup = createFakeSwup()
    const { app, scope } = createFakeApp()
    scope.run(() => setupAppNavigation(swup as unknown as Swup, app))
    expect(swup.onHandlers('content:replace')).toBe(1)

    scope.stop()
    expect(swup.onHandlers('content:replace')).toBe(0)

    await swup.trigger('content:replace', { id: 2 })
    expect(mocks.mountPageModules).toHaveBeenCalledTimes(1)
  })
})
