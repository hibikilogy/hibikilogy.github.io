import { describe, expect, it } from 'vitest'
import { LRUCache } from './lruCache.ts'

describe('lruCache', () => {
  it('evicts the oldest entry past the cap', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    expect(cache.has('a')).toBe(false)
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.size).toBe(2)
  })

  it('refreshes recency on get', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')
    cache.set('c', 3)

    expect(cache.get('a')).toBe(1)
    expect(cache.has('b')).toBe(false)
  })

  it('refreshes recency on set of an existing key', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('a', 10)
    cache.set('c', 3)

    expect(cache.get('a')).toBe(10)
    expect(cache.has('b')).toBe(false)
  })

  it('exposes the oldest key via first()', () => {
    const cache = new LRUCache<string, number>(3)
    expect(cache.first()).toBeUndefined()
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.first()).toBe('a')
  })

  it('deletes and clears', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.delete('a')
    expect(cache.has('a')).toBe(false)
    expect(cache.size).toBe(1)

    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('iterates entries in recency order', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a')

    expect([...cache.entries()].map(([key]) => key)).toEqual(['b', 'a'])
  })
})
