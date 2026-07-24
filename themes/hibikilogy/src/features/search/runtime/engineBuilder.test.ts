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
import { createSearchCacheKey } from './cache.ts'
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
  it('uses inline metadata without fetching the metadata URLs', async () => {
    const urls = createUrls()
    const fetchMock = stubFetch({ [urls.indexUrl]: rawIndex })

    const { engine, report } = await buildAndReport(createBootstrap(urls, {
      articleMetadataIndex: articleMetadata,
      tagIndex,
    }))

    expect(engine.records).toHaveLength(1)
    expect(engine.records[0].subtitle).toBe('Subtitle')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(urls.indexUrl)
    expect(report.cacheKey).toBe(createSearchCacheKey(urls.indexUrl, {
      articleMetadataIndex: articleMetadata,
      tagIndex,
    }))
  })

  it('fetches missing metadata from the bootstrap URLs and shares the inline cache key', async () => {
    const urls = createUrls()
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: articleMetadata,
      [urls.tagsDataUrl]: tagIndex,
    })

    const inline = await buildAndReport(createBootstrap(urls, {
      articleMetadataIndex: articleMetadata,
      tagIndex,
    }))
    const fetched = await buildAndReport(createBootstrap(urls))

    expect(fetched.engine.records).toHaveLength(1)
    expect(fetched.engine.records[0].subtitle).toBe('Subtitle')
    expect(fetched.engine.records[0].tags.map(tag => tag.name)).toEqual(['tag'])
    expect(fetched.report.cacheKey).toBe(inline.report.cacheKey)
    expect(fetched.report.cacheKey).toBe(createSearchCacheKey(urls.indexUrl, {
      articleMetadataIndex: articleMetadata,
      tagIndex,
    }))
  })

  it('falls back to empty metadata when the metadata fetches fail', async () => {
    const urls = createUrls()
    stubFetch({
      [urls.indexUrl]: rawIndex,
      [urls.articlesDataUrl]: new Error('offline'),
      [urls.tagsDataUrl]: new Error('offline'),
    })

    const { engine, report } = await buildAndReport(createBootstrap(urls))

    expect(engine.records).toHaveLength(1)
    expect(report.cacheKey).toBe(createSearchCacheKey(urls.indexUrl, {}))
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
      text: async () => JSON.stringify(body),
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
