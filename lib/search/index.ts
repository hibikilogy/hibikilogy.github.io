import type {
  RawSearchIndexEntry,
  SearchArticleMetadataIndex,
  SearchBuildReport,
  SearchEngine,
  SearchEngineBootstrapData,
  SearchEngineCacheEntry,
  SearchEngineCacheStorage,
  SearchIndexBuildStatus,
  SearchResultRecord,
  SearchTagIndexItem,
  SearchTimingPhase,
  SearchWorkerRequest,
  SearchWorkerResponse,
} from './types.ts'
import {
  createSearchCacheKey,
  disableIndexedDbSearchCacheStorage,
  getIndexedDbSearchCacheStorage,
  getSearchIndexVersion,
} from './cache.ts'
import {
  searchArticleIndexInlineId,
  searchIndexUrl,
  searchTagIndexInlineId,
  searchWorkerUrl,
} from './config.ts'
import { fetchJsonIndex, readInlineJsonIndex } from './data.ts'
import {
  getDurationMs,
  getSearchDebugFlag,
  isSearchDebugEnabled,
  logSearchBuildReport,
  logSearchTiming,
  nowMs,
} from './debug.ts'
import {
  createSearchEngine,
  normalizeSearchRecords,
  searchRecordsInEngine,
} from './engine.ts'

export { searchIndexUrl } from './config.ts'
let searchClientPromise: Promise<SearchClient> | null = null

interface SearchEngineBuildOptions {
  cacheStorage?: SearchEngineCacheStorage | null
  onStatus?: (status: SearchIndexBuildStatus) => void
  onReport?: (report: SearchBuildReport) => void
}

interface SearchClient {
  preload: () => Promise<void>
  count: () => Promise<number>
  search: (term: string) => Promise<SearchResultRecord[]>
}

export const searchIndexStatusEventName = 'hibikilogy:search-index-status'

export async function preloadSearch(): Promise<void> {
  await (await getSearchClient()).preload()
}

export async function getSearchRecordCount(): Promise<number> {
  return (await getSearchClient()).count()
}

export async function searchRecords(term: string): Promise<SearchResultRecord[]> {
  const debug = isSearchDebugEnabled()
  const start = nowMs()
  const results = await (await getSearchClient()).search(term)
  logSearchTiming(debug, 'search request', start)
  return results
}

function getSearchClient(): Promise<SearchClient> {
  if (!searchClientPromise) {
    searchClientPromise = createSearchClient()
  }

  return searchClientPromise
}

async function createSearchClient(): Promise<SearchClient> {
  const workerClient = createWorkerSearchClient()
  if (!workerClient)
    return createMainThreadSearchClient()

  try {
    await workerClient.preload()
    return createResilientSearchClient(workerClient)
  }
  catch (error) {
    workerClient.dispose()
    console.warn('Search worker failed to initialize; falling back to main thread search.', error)
    return createMainThreadSearchClient()
  }
}

function createResilientSearchClient(workerClient: SearchClient & { dispose: () => void }): SearchClient {
  let activeClient: SearchClient = workerClient

  async function runWithFallback<T>(operation: (client: SearchClient) => Promise<T>): Promise<T> {
    try {
      return await operation(activeClient)
    }
    catch (error) {
      if (activeClient !== workerClient)
        throw error

      workerClient.dispose()
      activeClient = createMainThreadSearchClient()
      console.warn('Search worker failed during a request; falling back to main thread search.', error)
      return operation(activeClient)
    }
  }

  return {
    preload: () => runWithFallback(client => client.preload()),
    count: () => runWithFallback(client => client.count()),
    search: term => runWithFallback(client => client.search(term)),
  }
}

function createWorkerSearchClient(): (SearchClient & { dispose: () => void }) | null {
  if (typeof Worker === 'undefined')
    return null

  let worker: Worker
  try {
    worker = new Worker(new URL(searchWorkerUrl, window.location.origin), { type: 'module' })
  }
  catch {
    return null
  }

  let nextRequestId = 0
  const bootstrap = getSearchEngineBootstrapData()
  const pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()

  worker.addEventListener('message', (event) => {
    const message = event.data as SearchWorkerResponse
    if ('status' in message) {
      emitSearchIndexStatus(message.status)
      return
    }
    if ('buildReport' in message) {
      logSearchBuildReport(false, message.buildReport)
      return
    }

    const pending = pendingRequests.get(message.id)
    if (!pending)
      return

    pendingRequests.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
    }
    else {
      pending.reject(new Error(message.error || 'Search worker failed'))
    }
  })

  worker.addEventListener('error', (event) => {
    const error = new Error(event.message || 'Search worker failed')
    for (const pending of pendingRequests.values()) {
      pending.reject(error)
    }
    pendingRequests.clear()
  })

  function request<T>(type: SearchWorkerRequest['type'], term = ''): Promise<T> {
    const id = ++nextRequestId
    worker.postMessage({
      id,
      type,
      term,
      bootstrap: type === 'preload' ? bootstrap : undefined,
    })

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
    })
  }

  return {
    preload: () => request<void>('preload'),
    count: () => request<number>('count'),
    search: term => request<SearchResultRecord[]>('search', term),
    dispose: () => {
      worker.terminate()
      pendingRequests.clear()
    },
  }
}

function createMainThreadSearchClient(): SearchClient {
  let enginePromise: Promise<SearchEngine> | null = null

  async function getEngine(): Promise<SearchEngine> {
    if (!enginePromise) {
      enginePromise = buildSearchEngine(getSearchEngineBootstrapData(), { onStatus: emitSearchIndexStatus })
    }

    return enginePromise
  }

  return {
    preload: async () => {
      await getEngine()
    },
    count: async () => {
      const engine = await getEngine()
      return engine.records.length
    },
    search: async (term) => {
      const engine = await getEngine()
      return searchRecordsInEngine(engine, term)
    },
  }
}

export async function buildSearchEngine(
  bootstrap: SearchEngineBootstrapData = getSearchEngineBootstrapData(),
  options: SearchEngineBuildOptions = {},
): Promise<SearchEngine> {
  const indexUrl = bootstrap.indexUrl || searchIndexUrl
  const debug = getSearchDebugFlag(bootstrap)
  const cacheKey = createSearchCacheKey(indexUrl, {
    articleMetadataIndex: bootstrap.articleMetadataIndex,
    tagIndex: bootstrap.tagIndex,
  })
  const phases: SearchTimingPhase[] = []
  const onStatus = options.onStatus || (() => {})
  const onReport = options.onReport || (() => {})
  const cacheStorage = options.cacheStorage === undefined
    ? getIndexedDbSearchCacheStorage()
    : options.cacheStorage

  onStatus('cache-read')
  const cachedEntry = await readSearchEngineCache(cacheStorage, cacheKey, phases)
  if (cachedEntry) {
    const start = nowMs()
    try {
      const engine = createSearchEngine(cachedEntry.records, {
        defaultFuseIndexJson: cachedEntry.defaultFuseIndexJson,
        extendedFuseIndexJson: cachedEntry.extendedFuseIndexJson,
      })
      phases.push({
        label: 'restore cached Fuse indexes',
        durationMs: getDurationMs(start),
        metadata: {
          records: cachedEntry.records.length,
          defaultIndexRecords: cachedEntry.defaultFuseIndexJson.records.length,
          extendedIndexRecords: cachedEntry.extendedFuseIndexJson.records.length,
        },
      })
      reportSearchEngineBuild(debug, onReport, {
        cacheHit: true,
        cacheStatus: 'hit',
        cacheKey,
        indexUrl,
        indexVersion: getSearchIndexVersion(indexUrl),
        recordCount: engine.records.length,
        defaultFuseIndexRecordCount: cachedEntry.defaultFuseIndexJson.records.length,
        extendedFuseIndexRecordCount: cachedEntry.extendedFuseIndexJson.records.length,
        phases,
      })
      onStatus('cache-hit')
      onStatus('ready')
      return engine
    }
    catch (error) {
      logSearchCacheFailure(debug, 'restore', error)
      phases.push({
        label: 'restore cached Fuse indexes failed',
        durationMs: getDurationMs(start),
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  onStatus('fetch')
  const fetchStart = nowMs()
  const [rawIndex, articleMetadata, tagIndex] = await Promise.all([
    fetchJsonIndex<RawSearchIndexEntry[]>(indexUrl),
    Promise.resolve(bootstrap.articleMetadataIndex || {}),
    Promise.resolve(bootstrap.tagIndex || []),
  ])
  phases.push({
    label: 'fetch and parse raw index',
    durationMs: getDurationMs(fetchStart),
    metadata: {
      rawEntries: rawIndex.length,
      articleMetadataEntries: Object.keys(articleMetadata).length,
      tagEntries: tagIndex.length,
    },
  })

  onStatus('normalize')
  const normalizeStart = nowMs()
  const records = normalizeSearchRecords(rawIndex, articleMetadata, tagIndex)
  phases.push({
    label: 'normalize search records',
    durationMs: getDurationMs(normalizeStart),
    metadata: {
      records: records.length,
    },
  })

  onStatus('index-build')
  const fuseStart = nowMs()
  const engine = createSearchEngine(records)
  const cacheEntry = cacheStorage ? createSearchEngineCacheEntry(cacheKey, engine) : null
  const defaultIndexRecords = cacheEntry?.defaultFuseIndexJson.records.length || records.length
  const extendedIndexRecords = cacheEntry?.extendedFuseIndexJson.records.length || records.length
  phases.push({
    label: 'build Fuse indexes',
    durationMs: getDurationMs(fuseStart),
    metadata: {
      defaultIndexRecords,
      extendedIndexRecords,
    },
  })

  if (cacheStorage && cacheEntry) {
    onStatus('cache-write')
    await writeSearchEngineCache(cacheStorage, () => cacheEntry, debug, phases)
  }
  reportSearchEngineBuild(debug, onReport, {
    cacheHit: false,
    cacheStatus: cacheStorage ? 'miss' : 'disabled',
    cacheKey,
    indexUrl,
    indexVersion: getSearchIndexVersion(indexUrl),
    recordCount: engine.records.length,
    rawEntryCount: rawIndex.length,
    defaultFuseIndexRecordCount: defaultIndexRecords,
    extendedFuseIndexRecordCount: extendedIndexRecords,
    phases,
  })
  onStatus('ready')
  return engine
}

function reportSearchEngineBuild(
  debug: boolean,
  onReport: (report: SearchBuildReport) => void,
  report: SearchBuildReport,
): void {
  logSearchBuildReport(debug, report)
  onReport(report)
}

async function readSearchEngineCache(
  cacheStorage: SearchEngineCacheStorage | null,
  cacheKey: string,
  phases: SearchTimingPhase[],
): Promise<SearchEngineCacheEntry | null> {
  if (!cacheStorage) {
    phases.push({
      label: 'read cached search engine skipped',
      durationMs: 0,
      metadata: { status: 'disabled' },
    })
    return null
  }

  const start = nowMs()
  try {
    const entry = await cacheStorage.read(cacheKey)
    const isValid = isSearchEngineCacheEntry(entry, cacheKey)
    phases.push({
      label: isValid
        ? 'read cached search engine hit'
        : entry
          ? 'read cached search engine invalid'
          : 'read cached search engine miss',
      durationMs: getDurationMs(start),
      metadata: { status: isValid ? 'hit' : entry ? 'invalid' : 'miss' },
    })
    return isValid ? entry : null
  }
  catch (error) {
    phases.push({
      label: 'read cached search engine failed',
      durationMs: getDurationMs(start),
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })
    return null
  }
}

async function writeSearchEngineCache(
  cacheStorage: SearchEngineCacheStorage,
  createEntry: () => SearchEngineCacheEntry,
  debug: boolean,
  phases: SearchTimingPhase[],
): Promise<void> {
  const start = nowMs()
  try {
    await cacheStorage.write(createEntry())
    phases.push({
      label: 'write cached search engine',
      durationMs: getDurationMs(start),
      metadata: { status: 'success' },
    })
  }
  catch (error) {
    phases.push({
      label: 'write cached search engine failed',
      durationMs: getDurationMs(start),
      metadata: { error: error instanceof Error ? error.message : String(error) },
    })
    disableIndexedDbSearchCacheStorage()
    logSearchCacheFailure(debug, 'write', error)
  }
}

function createSearchEngineCacheEntry(key: string, engine: SearchEngine): SearchEngineCacheEntry {
  return {
    key,
    records: engine.records,
    defaultFuseIndexJson: engine.defaultFuse.getIndex().toJSON(),
    extendedFuseIndexJson: engine.extendedFuse.getIndex().toJSON(),
    createdAt: Date.now(),
  }
}

function isSearchEngineCacheEntry(
  entry: SearchEngineCacheEntry | null,
  cacheKey: string,
): entry is SearchEngineCacheEntry {
  return Boolean(
    entry
    && entry.key === cacheKey
    && Array.isArray(entry.records)
    && isSearchFuseIndexJson(entry.defaultFuseIndexJson)
    && isSearchFuseIndexJson(entry.extendedFuseIndexJson)
    && typeof entry.createdAt === 'number',
  )
}

function isSearchFuseIndexJson(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && Array.isArray((value as { keys?: unknown }).keys)
    && Array.isArray((value as { records?: unknown }).records),
  )
}

function logSearchCacheFailure(debug: boolean, operation: string, error: unknown): void {
  if (!debug)
    return
  console.warn(`Search cache ${operation} failed; continuing without cache.`, error)
}

function emitSearchIndexStatus(status: SearchIndexBuildStatus): void {
  if (typeof window === 'undefined')
    return
  window.dispatchEvent(new CustomEvent<SearchIndexBuildStatus>(searchIndexStatusEventName, {
    detail: status,
  }))
}

function getSearchEngineBootstrapData(): SearchEngineBootstrapData {
  return {
    indexUrl: searchIndexUrl,
    debug: isSearchDebugEnabled(),
    articleMetadataIndex: readInlineJsonIndex<SearchArticleMetadataIndex>(searchArticleIndexInlineId) || undefined,
    tagIndex: readInlineJsonIndex<SearchTagIndexItem[]>(searchTagIndexInlineId) || undefined,
  }
}
