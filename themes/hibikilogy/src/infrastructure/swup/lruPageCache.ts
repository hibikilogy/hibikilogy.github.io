import type Swup from 'swup'
import type { CacheData } from 'swup'
import { Location } from 'swup'
import { LRUCache } from '../../shared/lruCache.ts'

export const PAGE_CACHE_MAX_ENTRIES = 50

// Drop-in replacement for swup's built-in page cache, which is unbounded:
// with aggressive preloading a long session would otherwise accumulate page
// HTML without limit. Mirrors the original Cache API and semantics (URL
// resolution, shallow-copy reads, `cache:set` / `cache:clear` hooks) but
// evicts the least-recently-used entry past the cap.
//
// swup's own Cache class is not exported and the `cache` field is typed
// readonly, so swupAdapter installs this through a cast.
export class LruPageCache {
  private readonly lru: LRUCache<string, CacheData>

  constructor(
    private readonly swup: Swup,
    max = PAGE_CACHE_MAX_ENTRIES,
  ) {
    this.lru = new LRUCache(max)
  }

  get size(): number {
    return this.lru.size
  }

  get all(): Map<string, CacheData> {
    const copy = new Map<string, CacheData>()
    for (const [url, page] of this.lru.entries())
      copy.set(url, { ...page })

    return copy
  }

  has(url: string): boolean {
    return this.lru.has(this.resolve(url))
  }

  get(url: string): CacheData | undefined {
    const result = this.lru.get(this.resolve(url))
    return result ? { ...result } : undefined
  }

  set(url: string, page: CacheData): void {
    const resolved = this.resolve(url)
    const stored = { ...page, url: resolved }
    this.lru.set(resolved, stored)
    this.swup.hooks.callSync('cache:set', undefined, { page: stored })
  }

  update(url: string, payload: object): void {
    const resolved = this.resolve(url)
    const page = { ...this.get(resolved), ...payload, url: resolved } as CacheData
    this.lru.set(resolved, page)
  }

  delete(url: string): void {
    this.lru.delete(this.resolve(url))
  }

  clear(): void {
    this.lru.clear()
    this.swup.hooks.callSync('cache:clear', undefined, undefined)
  }

  prune(predicate: (url: string, page: CacheData) => boolean): void {
    for (const [url, page] of this.lru.entries()) {
      if (predicate(url, page))
        this.lru.delete(url)
    }
  }

  private resolve(urlToResolve: string): string {
    const { url } = Location.fromUrl(urlToResolve)
    return this.swup.resolveUrl(url)
  }
}
