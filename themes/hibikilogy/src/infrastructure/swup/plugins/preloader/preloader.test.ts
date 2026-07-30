import type Swup from 'swup'
import type { PageData } from 'swup'
import type { PagePreloaderOptions } from './types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SwupPagePreloadPlugin from './preloader.ts'

interface SwupMockOptions {
  cachedUrls?: string[]
  preloader?: PagePreloaderOptions
}

function createSwupMock(options: SwupMockOptions = {}) {
  const cached = new Set(options.cachedUrls ?? ['/'])
  const fetchResolvers = new Map<string, (page: PageData) => void>()
  const replaced = new Map<string, (visit: unknown, args: unknown, defaultHandler?: () => unknown) => unknown>()
  const handlers = new Map<string, ((visit: unknown) => void)[]>()
  const delegates: { type: string, handler: (event: unknown) => void }[] = []

  const swup = {
    cache: {
      has: vi.fn((url: string) => cached.has(url)),
      get: vi.fn((url: string) => ({ url, html: 'cached' })),
    },
    fetchPage: vi.fn((url: string) => new Promise<PageData>((resolve) => {
      fetchResolvers.set(url, resolve)
    })),
    shouldIgnoreVisit: vi.fn(() => false),
    resolveUrl: (url: string) => url,
    visit: { to: { url: '' }, done: true },
    hooks: {
      on: vi.fn((hook: string, handler: (visit: unknown) => void, hookOptions?: { replace?: boolean }) => {
        if (hookOptions?.replace)
          replaced.set(hook, handler as never)
        else
          handlers.set(hook, [...(handlers.get(hook) ?? []), handler])
        return () => {}
      }),
    },
    delegateEvent: vi.fn((_selector: string, type: string, handler: (event: unknown) => void) => {
      delegates.push({ type, handler })
      return { destroy: () => {} }
    }),
    options: { linkSelector: 'a[href]' },
  }

  function settleFetch(url: string): void {
    fetchResolvers.get(url)?.({ url, html: 'fetched' })
  }

  function fireHook(hook: string, visit: unknown): void {
    handlers.get(hook)?.forEach(handler => handler(visit))
  }

  return { swup: swup as unknown as Swup, replaced, settleFetch, fireHook, delegates }
}

function pageLoadHandler(mock: ReturnType<typeof createSwupMock>) {
  return mock.replaced.get('page:load')!
}

function install(options: SwupMockOptions = {}) {
  const mock = createSwupMock(options)
  const preloader = new SwupPagePreloadPlugin(options.preloader)
  preloader.swup = mock.swup
  preloader.mount()
  return { ...mock, preloader }
}

describe('swupPagePreloadPlugin', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('dedupes element-triggered preloads against navigation lookups by normalized URL', () => {
    const { swup, preloader } = install()
    const el = document.createElement('a')
    el.setAttribute('href', '/target/')
    document.body.append(el)

    const first = preloader.preload(el)
    const second = preloader.preload('/target/')

    expect(second).toBe(first)
    expect((swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('lets a navigation reuse an in-flight preload instead of fetching twice', () => {
    const mock = install()
    const preloaded = mock.preloader.preload('/target/')

    const defaultHandler = vi.fn(() => Promise.resolve({ url: '/target/', html: 'fresh' }))
    const result = pageLoadHandler(mock)({ to: { url: '/target/' } }, {}, defaultHandler)

    expect(result).toBe(preloaded)
    expect(defaultHandler).not.toHaveBeenCalled()
    expect((mock.swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('keeps only the fetching navigation target in releaseForNavigation', () => {
    const mock = install()
    const preloadedTarget = mock.preloader.preload('/target/')
    void mock.preloader.preload('/other/')

    mock.preloader.releaseForNavigation('/target/')

    const load = pageLoadHandler(mock)
    const targetDefault = vi.fn()
    expect(load({ to: { url: '/target/' } }, {}, targetDefault)).toBe(preloadedTarget)

    const otherDefault = vi.fn(() => Promise.resolve({ url: '/other/', html: 'fresh' }))
    void load({ to: { url: '/other/' } }, {}, otherDefault)
    expect(otherDefault).toHaveBeenCalled()
  })

  it('drops a queued navigation target so the visit fetches it directly', async () => {
    const mock = install({ preloader: { strategy: { concurrency: 1 } } })
    void mock.preloader.preload('/busy/')
    void mock.preloader.preload('/target/')

    mock.preloader.releaseForNavigation('/target/')

    const defaultHandler = vi.fn(() => Promise.resolve({ url: '/target/', html: 'fresh' }))
    void pageLoadHandler(mock)({ to: { url: '/target/' } }, {}, defaultHandler)
    expect(defaultHandler).toHaveBeenCalled()

    // The cancelled queue entry must never fire, even after a slot frees up.
    mock.settleFetch('/busy/')
    await Promise.resolve()
    const calls = (mock.swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0])
    expect(calls).toEqual(['/busy/'])
  })

  it('returns cached pages without fetching', async () => {
    const mock = install({ cachedUrls: ['/', '/cached/'] })
    const result = await mock.preloader.preload('/cached/')
    expect(result).toEqual({ url: '/cached/', html: 'cached' })
    expect(mock.swup.fetchPage).not.toHaveBeenCalled()
  })

  it('marks user-intent preloads and upgrades background ones on repeat calls', () => {
    const mock = install()
    void mock.preloader.preload('/a/')
    expect(mock.preloader.isPriorityPreload('/a/')).toBe(false)

    void mock.preloader.preload('/a/', { priority: true })
    expect(mock.preloader.isPriorityPreload('/a/')).toBe(true)

    void mock.preloader.preload('/b/', { priority: true })
    expect(mock.preloader.isPriorityPreload('/b/')).toBe(true)
  })

  it('preloads immediately on hover, even before window load finishes', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const el = document.createElement('a')
    el.setAttribute('href', '/target/')
    document.body.append(el)
    const mock = install()

    // Background preloading is deferred, but hover intent is not.
    const mouseenter = mock.delegates.find(delegate => delegate.type === 'mouseenter')!
    mouseenter.handler({ target: el, delegateTarget: el })

    expect(mock.swup.fetchPage).toHaveBeenCalledWith('/target/')
  })

  it('ignores touch preloads on hover-capable devices', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const el = document.createElement('a')
    el.setAttribute('href', '/target/')
    document.body.append(el)
    const mock = install()

    const touchstart = mock.delegates.find(delegate => delegate.type === 'touchstart')!
    touchstart.handler({ target: el, delegateTarget: el })

    expect(mock.swup.fetchPage).not.toHaveBeenCalled()
  })

  it('refuses links that swup would ignore anyway', () => {
    const mock = install()
    ;(mock.swup.shouldIgnoreVisit as ReturnType<typeof vi.fn>).mockReturnValue(true)
    void mock.preloader.preload('/ignored/')
    expect(mock.swup.fetchPage).not.toHaveBeenCalled()
  })

  it('suppresses preloads while a navigation is in flight', () => {
    const mock = install()
    const swup = mock.swup as unknown as { visit: { to: { url: string }, done: boolean } }
    swup.visit.to.url = '/target/'
    swup.visit.done = false

    void mock.preloader.preload('/target/')
    void mock.preloader.preload('/other/')
    expect(mock.swup.fetchPage).not.toHaveBeenCalled()
  })

  it('does not block preloads for the initial empty visit', () => {
    const mock = install()
    const swup = mock.swup as unknown as { visit: { to: { url: string }, done: boolean } }
    swup.visit.done = false

    void mock.preloader.preload('/page/')
    expect(mock.swup.fetchPage).toHaveBeenCalledWith('/page/')
  })

  it('limits concurrency and backfills when a slot frees up', async () => {
    const mock = install({ preloader: { strategy: { concurrency: 2 } } })
    void mock.preloader.preload('/a/')
    void mock.preloader.preload('/b/')
    void mock.preloader.preload('/c/')

    const fetchPage = mock.swup.fetchPage as ReturnType<typeof vi.fn>
    expect(fetchPage.mock.calls.map(call => call[0])).toEqual(['/a/', '/b/'])

    mock.settleFetch('/a/')
    await Promise.resolve()
    expect(fetchPage.mock.calls.map(call => call[0])).toEqual(['/a/', '/b/', '/c/'])
  })

  it('runs high-priority preloads ahead of queued normal ones', () => {
    const mock = install({ preloader: { strategy: { concurrency: 1 } } })
    void mock.preloader.preload('/busy/')
    void mock.preloader.preload('/normal/')
    void mock.preloader.preload('/urgent/', { priority: true })

    mock.settleFetch('/busy/')
    return Promise.resolve().then(() => {
      const calls = (mock.swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0])
      expect(calls).toEqual(['/busy/', '/urgent/'])
    })
  })

  it('uses the aggressive concurrency on fast networks', () => {
    const mock = install({
      preloader: {
        strategy: { concurrency: 1 },
        aggressiveStrategy: { concurrency: 3 },
        isFastNetwork: () => true,
      },
    })
    void mock.preloader.preload('/a/')
    void mock.preloader.preload('/b/')
    void mock.preloader.preload('/c/')

    const calls = (mock.swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0])
    expect(calls).toEqual(['/a/', '/b/', '/c/'])
  })

  it('sticks to the base concurrency when the network is not measured fast', () => {
    const mock = install({
      preloader: {
        strategy: { concurrency: 1 },
        aggressiveStrategy: { concurrency: 3 },
        isFastNetwork: () => false,
      },
    })
    void mock.preloader.preload('/a/')
    void mock.preloader.preload('/b/')

    const calls = (mock.swup.fetchPage as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0])
    expect(calls).toEqual(['/a/'])
  })

  it('defers background preloading until the page has finished loading', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0))
    vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')

    const mock = install({ cachedUrls: [] })
    await vi.advanceTimersByTimeAsync(10)
    expect(mock.swup.fetchPage).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(10)
    expect(mock.swup.fetchPage).toHaveBeenCalledWith('/')
  })

  it('starts background preloading on idle when the page is already loaded', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0))
    vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')

    const mock = install({ cachedUrls: [] })
    expect(mock.swup.fetchPage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)
    expect(mock.swup.fetchPage).toHaveBeenCalledWith('/')
  })

  describe('visible link observation', () => {
    interface ObserverStub {
      options?: IntersectionObserverInit
      observed: Element[]
      disconnectCalls: number
    }

    function stubIntersectionObserver(): ObserverStub[] {
      const instances: ObserverStub[] = []
      vi.stubGlobal('IntersectionObserver', class implements ObserverStub {
        options?: IntersectionObserverInit
        observed: Element[] = []
        disconnectCalls = 0

        constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          this.options = options
          instances.push(this)
        }

        observe(el: Element): void {
          this.observed.push(el)
        }

        unobserve(): void {}
        disconnect(): void {
          this.disconnectCalls++
          this.observed = []
        }
      })
      return instances
    }

    function installWithLink(preloaderOptions?: PagePreloaderOptions) {
      vi.useFakeTimers()
      vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0))
      vi.stubGlobal('cancelIdleCallback', (id: ReturnType<typeof setTimeout>) => clearTimeout(id))
      vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')

      const el = document.createElement('a')
      el.setAttribute('href', '/target/')
      document.body.append(el)
      return install({ preloader: preloaderOptions })
    }

    it('observes eligible links with the base strategy by default', async () => {
      const instances = stubIntersectionObserver()
      installWithLink()
      await vi.advanceTimersByTimeAsync(10)

      expect(instances[0].options).toMatchObject({ threshold: 0.2, rootMargin: '0px' })
      expect(instances[0].observed).toHaveLength(1)
    })

    it('observes with the aggressive strategy on fast networks', async () => {
      const instances = stubIntersectionObserver()
      installWithLink({ isFastNetwork: () => true })
      await vi.advanceTimersByTimeAsync(10)

      expect(instances[0].options).toMatchObject({ threshold: 0, rootMargin: '300px' })
    })

    it('recreates the observer when the strategy tier flips', async () => {
      const instances = stubIntersectionObserver()
      let fast = false
      const mock = installWithLink({ isFastNetwork: () => fast })
      await vi.advanceTimersByTimeAsync(10)
      expect(instances).toHaveLength(1)

      fast = true
      const el = document.createElement('a')
      el.setAttribute('href', '/other/')
      document.body.append(el)
      mock.fireHook('page:view', undefined)
      await vi.advanceTimersByTimeAsync(10)

      expect(instances).toHaveLength(2)
      expect(instances[1].options).toMatchObject({ threshold: 0, rootMargin: '300px' })
      expect(instances[1].observed).toHaveLength(2)
    })

    it('disconnects the observer on page:view so old-page elements are released', async () => {
      const instances = stubIntersectionObserver()
      const mock = installWithLink()
      await vi.advanceTimersByTimeAsync(10)
      expect(instances[0].observed).toHaveLength(1)

      const el = document.createElement('a')
      el.setAttribute('href', '/other/')
      document.body.append(el)
      mock.fireHook('page:view', undefined)
      await vi.advanceTimersByTimeAsync(10)

      // Same strategy tier: the observer is reused but re-observes only the
      // links of the current page.
      expect(instances).toHaveLength(1)
      expect(instances[0].disconnectCalls).toBe(1)
      expect(instances[0].observed).toHaveLength(2)
    })
  })
})
