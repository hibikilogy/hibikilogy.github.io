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

  it('refreshes recency on get and on set', () => {
    const read = new LRUCache<string, number>(2)
    read.set('a', 1)
    read.set('b', 2)
    read.get('a')
    read.set('c', 3)
    expect(read.get('a')).toBe(1)
    expect(read.has('b')).toBe(false)

    const written = new LRUCache<string, number>(2)
    written.set('a', 1)
    written.set('b', 2)
    written.set('a', 10)
    written.set('c', 3)
    expect(written.get('a')).toBe(10)
    expect(written.has('b')).toBe(false)
  })

  it('exposes the oldest key and supports delete/clear', () => {
    const cache = new LRUCache<string, number>(3)
    expect(cache.first()).toBeUndefined()

    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.first()).toBe('a')

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
