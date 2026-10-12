import type { PageViewCounter, PageViewCounterOptions } from './types.ts'
import { LRUCache } from 'shared/lruCache.ts'
import { catchAsyncError, catchError } from 'shared/result.ts'
import { readViewCount, resolvePageViewKey } from './core.ts'

const CACHE_LIMIT = 120
const STORAGE_KEY = 'hibikilogy:page-views:v1'

export function createPageViewCounter({ endpoint, identityBase }: PageViewCounterOptions): PageViewCounter {
  const counts = new LRUCache<string, number>(CACHE_LIMIT)
  const inflight = new Map<string, Promise<number | null>>()
  restoreCounts(counts)

  async function fetchCount(key: string): Promise<number | null> {
    const [response, error] = await catchAsyncError(() => fetch(
      `${endpoint}?url=${encodeURIComponent(key)}`,
    ))
    if (error || !response?.ok)
      return null

    const [payload] = await catchAsyncError(() => response.json())
    const count = readViewCount(payload)
    if (count === null)
      return null

    counts.set(key, count)
    persistCounts(counts)
    return count
  }

  return {
    peek: (pathname) => {
      const key = resolvePageViewKey(pathname, identityBase)
      return key ? counts.get(key) : undefined
    },
    load: (pathname) => {
      const key = resolvePageViewKey(pathname, identityBase)
      if (!key || !endpoint)
        return Promise.resolve(null)

      const pending = inflight.get(key)
      if (pending)
        return pending

      const request = fetchCount(key).finally(() => inflight.delete(key))
      inflight.set(key, request)
      return request
    },
  }
}

// 跨会话的计数快照：整页加载时也能先上屏，再由请求校正。
function restoreCounts(counts: LRUCache<string, number>): void {
  const [stored] = catchError(() => globalThis.localStorage?.getItem(STORAGE_KEY) ?? null)
  if (!stored)
    return

  const [parsed] = catchError(() => JSON.parse(stored) as unknown)
  if (!parsed || typeof parsed !== 'object')
    return

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isFinite(value))
      counts.set(key, value)
  }
}

// 存储不可用（隐私模式、配额）时放弃写入：缓存只影响首屏。
function persistCounts(counts: LRUCache<string, number>): void {
  const snapshot = Object.fromEntries(counts.entries())
  catchError(() => globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot)))
}
