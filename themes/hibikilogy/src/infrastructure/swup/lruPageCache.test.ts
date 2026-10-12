import type Swup from 'swup'
import { describe, expect, it, vi } from 'vitest'
import { LruPageCache } from './lruPageCache.ts'

function createSwupMock() {
  return {
    resolveUrl: (url: string) => url,
    hooks: { callSync: vi.fn() },
  } as unknown as Swup
}

function page(url: string) {
  return { url, html: `<html>${url}</html>` }
}

describe('lruPageCache', () => {
  it('evicts the least recently used page past the cap', () => {
    const cache = new LruPageCache(createSwupMock(), 2)
    cache.set('/a/', page('/a/'))
    cache.set('/b/', page('/b/'))
    cache.get('/a/')
    cache.set('/c/', page('/c/'))

    expect(cache.has('/a/')).toBe(true)
    expect(cache.has('/b/')).toBe(false)
    expect(cache.size).toBe(2)
  })

  it('resolves URLs before storing and fires cache:set with the stored page', () => {
    const swup = createSwupMock()
    const cache = new LruPageCache(swup)
    cache.set('https://example.com/a/?x=1', page('/a/'))

    expect(cache.has('/a/?x=1')).toBe(true)
    expect(swup.hooks.callSync).toHaveBeenCalledWith('cache:set', undefined, {
      page: { url: '/a/?x=1', html: '<html>/a/</html>' },
    })
  })

  it('returns shallow copies on read', () => {
    const cache = new LruPageCache(createSwupMock())
    cache.set('/a/', page('/a/'))

    const first = cache.get('/a/')
    const second = cache.get('/a/')
    expect(first).toEqual(page('/a/'))
    expect(first).not.toBe(second)
  })

  it('updates, deletes, prunes and clears like the swup cache', () => {
    const swup = createSwupMock()
    const cache = new LruPageCache(swup)
    cache.set('/a/', page('/a/'))
    cache.set('/b/', page('/b/'))

    cache.update('/a/', { custom: true })
    expect(cache.get('/a/')).toMatchObject({ url: '/a/', custom: true })

    cache.prune(url => url === '/a/')
    expect(cache.has('/a/')).toBe(false)

    cache.delete('/b/')
    expect(cache.has('/b/')).toBe(false)

    cache.set('/c/', page('/c/'))
    cache.clear()
    expect(cache.size).toBe(0)
    expect(swup.hooks.callSync).toHaveBeenCalledWith('cache:clear', undefined, undefined)
  })
})
