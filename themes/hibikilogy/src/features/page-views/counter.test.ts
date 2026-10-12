import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageViewCounter } from './counter.ts'

const STORAGE_KEY = 'hibikilogy:page-views:v1'
const PATH = '/articles/foo'
const KEY = 'hibikilogy.github.io/articles/foo'

function response(viewCount: unknown): Response {
  return {
    ok: true,
    json: async () => ({ data: { reaction: { viewCount } } }),
  } as Response
}

function createCounter(options: Partial<{ endpoint: string, identityBase: string }> = {}) {
  return createPageViewCounter({
    endpoint: 'https://hub.example/api/reactions',
    identityBase: 'https://hibikilogy.github.io/',
    ...options,
  })
}

describe('createPageViewCounter', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('reads a fresh count and keeps it for the next mount', async () => {
    const fetchMock = vi.fn(async () => response(7))
    vi.stubGlobal('fetch', fetchMock)
    const counter = createCounter()

    expect(counter.peek(PATH)).toBeUndefined()
    await expect(counter.load(PATH)).resolves.toBe(7)
    expect(counter.peek(PATH)).toBe(7)
    expect(fetchMock).toHaveBeenCalledWith(
      `https://hub.example/api/reactions?url=${encodeURIComponent(KEY)}`,
    )
  })

  it('deduplicates concurrent loads for the same page', async () => {
    const fetchMock = vi.fn(async () => response(3))
    vi.stubGlobal('fetch', fetchMock)
    const counter = createCounter()

    const [first, second] = await Promise.all([counter.load(PATH), counter.load(PATH)])
    expect(first).toBe(3)
    expect(second).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes an already cached page on the next load', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(4))
    vi.stubGlobal('fetch', fetchMock)
    const counter = createCounter()

    await counter.load(PATH)
    await counter.load(PATH)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(counter.peek(PATH)).toBe(4)
  })

  it('keeps the cached count when the request or payload fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(9)))
    const counter = createCounter()
    await counter.load(PATH)

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))
    await expect(counter.load(PATH)).resolves.toBeNull()
    expect(counter.peek(PATH)).toBe(9)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response))
    await expect(counter.load(PATH)).resolves.toBeNull()
    expect(counter.peek(PATH)).toBe(9)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => {
      throw new Error('bad json')
    } }) as unknown as Response))
    await expect(counter.load(PATH)).resolves.toBeNull()
    expect(counter.peek(PATH)).toBe(9)

    vi.stubGlobal('fetch', vi.fn(async () => response('nope')))
    await expect(counter.load(PATH)).resolves.toBeNull()
    expect(counter.peek(PATH)).toBe(9)
  })

  it('retries after a failed request instead of caching the rejection', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(5))
    vi.stubGlobal('fetch', fetchMock)
    const counter = createCounter()

    await expect(counter.load(PATH)).resolves.toBeNull()
    await expect(counter.load(PATH)).resolves.toBe(5)
  })

  it('persists counts across instances and restores them for instant paint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(11)))
    await createCounter().load(PATH)

    expect(createCounter().peek(PATH)).toBe(11)
  })

  it('ignores a corrupted storage snapshot', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json')

    expect(createCounter().peek(PATH)).toBeUndefined()
  })

  it('skips the request when the endpoint or the identity base is unusable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createCounter({ endpoint: '' }).load(PATH)).resolves.toBeNull()
    await expect(createCounter({ identityBase: '' }).load(PATH)).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
