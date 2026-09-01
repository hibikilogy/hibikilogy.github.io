// @vitest-environment node

import type {
  SearchArticleMetadataIndex,
  SearchBuildReport,
  SearchEngineBootstrapData,
  SearchEngineCacheEntry,
  SearchEngineCacheStorage,
  SearchTagIndexItem,
} from '../types.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSearchEngine } from './engineBuilder.ts'

const rawIndex = [
  {
    path: '/articles/example/',
    title: 'Example',
    description: 'Description',
    body: 'Body',
    date: '2024-01-01',
  },
]

const articleMetadata: SearchArticleMetadataIndex = {
  '/articles/example/': { s: 'Subtitle', an: 'Author' },
}

const tagIndex: SearchTagIndexItem[] = [
  { name: 'tag', href: '/tags/tag/', pages: ['/articles/example/'] },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildSearchEngine metadata resolution', () => {
  it('fetches article metadata and tag index from the bootstrap URLs', async () => {
    const urls = createUrls()
    const fetchMock = stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: articleMetadata,
      [urls.tagsDataUrl]: tagIndex,
    })

    const { engine } = await buildAndReport(createBootstrap(urls))

    expect(engine.records).toHaveLength(1)
    expect(engine.records[0].subtitle).toBe('Subtitle')
    expect(engine.records[0].tags.map(tag => tag.name)).toEqual(['tag'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shares the same cache key between two builds with identical metadata', async () => {
    const urls = createUrls()
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: articleMetadata,
      [urls.tagsDataUrl]: tagIndex,
    })

    const first = await buildAndReport(createBootstrap(urls))
    const second = await buildAndReport(createBootstrap(urls))

    expect(second.engine.records).toHaveLength(1)
    expect(second.report.cacheKey).toBe(first.report.cacheKey)
  })

  it('derives a different cache key when the metadata changes', async () => {
    const urls = createUrls()
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: articleMetadata,
      [urls.tagsDataUrl]: tagIndex,
    })
    const initial = await buildAndReport(createBootstrap(urls))

    // FetchJsonIndex memoizes by URL, so the edited metadata must come from
    // a fresh URL; the index URL stays identical to isolate the metadata part.
    const editedUrls = { ...urls, articlesDataUrl: '/search-articles-edited/' }
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [editedUrls.articlesDataUrl]: { '/articles/example/': { s: 'Edited', an: 'Author' } },
      [urls.tagsDataUrl]: tagIndex,
    })
    const edited = await buildAndReport(createBootstrap(editedUrls))

    // The cache key must invalidate when the metadata feeding the engine
    // changes; otherwise a stale cached engine would be restored.
    expect(edited.report.cacheKey).not.toBe(initial.report.cacheKey)
  })

  it('falls back to empty metadata when the metadata fetches fail', async () => {
    const urls = createUrls()
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: new Error('offline'),
      [urls.tagsDataUrl]: new Error('offline'),
    })

    const { engine } = await buildAndReport(createBootstrap(urls))

    expect(engine.records).toHaveLength(1)
  })

  it('restores the cached engine without fetching the raw index', async () => {
    const firstUrls = createUrls('shared')
    const secondUrls = createUrls('shared')
    const fetchMock = stubFetch({
      [firstUrls.indexUrl]: rawIndex,
      [firstUrls.articlesDataUrl]: articleMetadata,
      [firstUrls.tagsDataUrl]: tagIndex,
      [secondUrls.articlesDataUrl]: articleMetadata,
      [secondUrls.tagsDataUrl]: tagIndex,
    })
    const cacheStorage = createMemoryCacheStorage()

    const initial = await buildAndReport(createBootstrap(firstUrls), cacheStorage)
    expect(initial.report.cacheStatus).toBe('miss')

    const restored = await buildAndReport(createBootstrap(secondUrls), cacheStorage)

    expect(restored.report.cacheHit).toBe(true)
    expect(restored.report.cacheStatus).toBe('hit')
    expect(restored.report.cacheKey).toBe(initial.report.cacheKey)
    expect(restored.engine.records).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalledWith(secondUrls.indexUrl)
  })
})

let urlSerial = 0

function createUrls(indexVersion?: string) {
  urlSerial += 1
  const version = indexVersion || `v${urlSerial}`
  return {
    indexUrl: `/search_index.zh.json?h=${version}&test=${urlSerial}`,
    articlesDataUrl: `/search-articles/?test=${urlSerial}`,
    tagsDataUrl: `/search-tags/?test=${urlSerial}`,
  }
}

function createBootstrap(
  urls: ReturnType<typeof createUrls>,
  overrides: Partial<SearchEngineBootstrapData> = {},
): SearchEngineBootstrapData {
  return { ...urls, ...overrides }
}

async function buildAndReport(
  bootstrap: SearchEngineBootstrapData,
  cacheStorage: SearchEngineCacheStorage | null = null,
) {
  const reports: SearchBuildReport[] = []
  const engine = await buildSearchEngine(bootstrap, {
    cacheStorage,
    onReport: report => reports.push(report),
  })
  return { engine, report: reports[reports.length - 1] }
}

function createMemoryCacheStorage(): SearchEngineCacheStorage {
  let entry: SearchEngineCacheEntry | null = null
  return {
    read: async () => entry,
    write: async (next) => {
      entry = next
    },
  }
}

function stubFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = responses[url]
    if (body === undefined || body instanceof Error)
      throw body || new Error(`Unexpected fetch: ${url}`)
    return {
      ok: true,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
