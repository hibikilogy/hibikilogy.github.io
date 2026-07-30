import type Swup from 'swup'
import type { PagePreloader } from '../../infrastructure/swup/index.ts'
import { effectScope } from '@vue/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFetchLatencyMonitor } from '../../infrastructure/network/index.ts'
import { useNavigationPriority } from './useNavigationPriority.ts'

interface FetchCall {
  url: string
  init: RequestInit
  resolve: (response: Response) => void
  reject: (error: unknown) => void
}

interface SwupMockOptions {
  cached?: boolean
}

function createSwupMock(options: SwupMockOptions = {}) {
  const handlers = new Map<string, ((visit: unknown) => void)[]>()
  const replaced = new Map<string, (visit: unknown, args: unknown) => Promise<Response>>()
  const swup = {
    hooks: {
      on: vi.fn((hook: string, handler: (visit: unknown) => void) => {
        handlers.set(hook, [...(handlers.get(hook) ?? []), handler])
        return () => {}
      }),
      replace: vi.fn((hook: string, handler: (visit: unknown, args: unknown) => Promise<Response>) => {
        replaced.set(hook, handler)
        return () => {}
      }),
      call: vi.fn(() => Promise.resolve(undefined)),
    },
    cache: { has: vi.fn(() => options.cached ?? false) },
  }
  return { swup: swup as unknown as Swup, handlers, replaced }
}

function visitTo(url: string) {
  return { to: { url }, animation: { wait: false } }
}

describe('useNavigationPriority', () => {
  let fetchCalls: FetchCall[]

  beforeEach(() => {
    fetchCalls = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        fetchCalls.push({ url, init, resolve, reject })
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })))
      })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function install(options: SwupMockOptions = {}) {
    const mock = createSwupMock(options)
    const monitor = createFetchLatencyMonitor()
    const preloader = {
      releaseForNavigation: vi.fn(),
      isPriorityPreload: vi.fn(() => false),
    } as unknown as PagePreloader
    const scope = effectScope()
    scope.run(() => useNavigationPriority(mock.swup, monitor, preloader))
    return { ...mock, monitor, preloader, scope }
  }

  function startFetch(replaced: ReturnType<typeof createSwupMock>['replaced'], url: string) {
    const promise = replaced.get('fetch:request')!({}, { url, options: {} })
    promise.catch(() => {})
    return promise
  }

  it('issues preload fetches with low priority and records their latency', async () => {
    const { replaced, monitor } = install()
    const record = vi.spyOn(monitor, 'record')

    const promise = replaced.get('fetch:request')!({}, { url: '/other/', options: {} })
    expect(fetchCalls[0].init.priority).toBe('low')

    fetchCalls[0].resolve(new Response('<html></html>'))
    await promise
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('promotes the navigation request to high priority', () => {
    const { handlers, replaced } = install({ cached: false })

    handlers.get('visit:start')![0](visitTo('/target/'))
    replaced.get('fetch:request')!({}, { url: '/target/', options: {} })

    expect(fetchCalls[0].init.priority).toBe('high')
  })

  it('aborts competing preloads but keeps the target\'s own for the visit to reuse', async () => {
    const installed = install({ cached: false })
    const competing = startFetch(installed.replaced, '/other/')
    const targetPreload = startFetch(installed.replaced, '/target/')

    const visit = visitTo('/target/')
    installed.handlers.get('visit:start')![0](visit)

    expect(visit.animation.wait).toBe(true)
    expect(installed.preloader.releaseForNavigation).toHaveBeenCalledWith('/target/')
    expect(fetchCalls[0].init.signal?.aborted).toBe(true)
    expect(fetchCalls[1].init.signal?.aborted).toBe(false)
    await expect(competing).rejects.toThrow(/aborted/)
    targetPreload.catch(() => {})
  })

  it('does not record latency for aborted preloads', async () => {
    const installed = install({ cached: false })
    const record = vi.spyOn(installed.monitor, 'record')

    const abandoned = startFetch(installed.replaced, '/other/')
    installed.handlers.get('visit:start')![0](visitTo('/target/'))
    await expect(abandoned).rejects.toThrow(/aborted/)

    expect(record).not.toHaveBeenCalled()
  })

  it('leaves preloads and the transition alone for cached visits', () => {
    const installed = install({ cached: true })
    startFetch(installed.replaced, '/other/')

    const visit = visitTo('/target/')
    installed.handlers.get('visit:start')![0](visit)

    expect(visit.animation.wait).toBe(false)
    expect(fetchCalls[0].init.signal?.aborted).toBe(false)
    expect(installed.preloader.releaseForNavigation).not.toHaveBeenCalled()
  })

  it('issues user-intent preloads with auto priority', () => {
    const installed = install()
    const isPriorityPreload = installed.preloader.isPriorityPreload as ReturnType<typeof vi.fn>
    isPriorityPreload.mockReturnValue(true)

    startFetch(installed.replaced, '/hovered/')
    expect(fetchCalls[0].init.priority).toBe('auto')
  })

  it('fails non-OK responses so swup falls back to a native load', async () => {
    const { swup, replaced } = install()
    const promise = replaced.get('fetch:request')!({}, { url: '/missing/', options: {} })
    fetchCalls[0].resolve(new Response('not found', { status: 404 }))

    await expect(promise).rejects.toThrow(/404/)
    expect(swup.hooks.call).toHaveBeenCalledWith(
      'fetch:error',
      expect.anything(),
      expect.objectContaining({ status: 404, url: '/missing/' }),
    )
  })

  it('chains the upstream timeout signal into the fetch', async () => {
    const { replaced } = install()
    const upstream = new AbortController()
    const promise = replaced.get('fetch:request')!({}, { url: '/other/', options: { signal: upstream.signal } })
    promise.catch(() => {})
    fetchCalls[0].reject(new Error('aborted'))

    upstream.abort('timeout')
    expect(fetchCalls[0].init.signal?.aborted).toBe(true)
    expect(fetchCalls[0].init.signal?.reason).toBe('timeout')
    await expect(promise).rejects.toThrow(/aborted/)
  })
})
