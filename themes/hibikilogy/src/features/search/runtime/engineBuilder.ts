import type {
  RawSearchIndexEntry,
  SearchArticleMetadataIndex,
  SearchBuildReport,
  SearchEngine,
  SearchEngineBootstrapData,
  SearchEngineCacheEntry,
  SearchEngineCacheStorage,
  SearchTagIndexItem,
  SearchTimingPhase,
} from '../types.ts'
import { catchAsyncError } from 'shared/result.ts'
import { createSearchEngine, normalizeSearchRecords } from '../core/engine.ts'
import {
  getDurationMs,
  getSearchDebugFlag,
  logSearchBuildReport,
  nowMs,
} from '../debug.ts'
import {
  createSearchCacheKey,
  disableIndexedDbSearchCacheStorage,
  getIndexedDbSearchCacheStorage,
  getSearchIndexVersion,
} from './cache.ts'
import { fetchJsonIndex } from './load.ts'

interface SearchEngineBuildOptions {
  cacheStorage?: SearchEngineCacheStorage | null
  onStatus?: (status: import('../types.ts').SearchIndexBuildStatus) => void
  onReport?: (report: SearchBuildReport) => void
}
export async function buildSearchEngine(
  bootstrap: SearchEngineBootstrapData,
  options: SearchEngineBuildOptions = {},
): Promise<SearchEngine> {
  const indexUrl = bootstrap.indexUrl
  const debug = getSearchDebugFlag(bootstrap)
  const phases: SearchTimingPhase[] = []
  const onStatus = options.onStatus || (() => {})
  const onReport = options.onReport || (() => {})
  const cacheStorage = options.cacheStorage === undefined
    ? getIndexedDbSearchCacheStorage()
    : options.cacheStorage

  onStatus('fetch')
  const fetchStart = nowMs()
  const [rawIndex, articleMetadata, tagIndex] = await Promise.all([
    fetchJsonIndex<RawSearchIndexEntry[]>(indexUrl),
    resolveArticleMetadataIndex(bootstrap),
    resolveSearchTagIndex(bootstrap),
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

  // The key hashes the resolved metadata, so it must be computed after the
  // fetch: inline metadata and URL-loaded metadata share one cache entry.
  const cacheKey = createSearchCacheKey(indexUrl, {
    articleMetadataIndex: articleMetadata,
    tagIndex,
  })

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

async function resolveArticleMetadataIndex(
  bootstrap: SearchEngineBootstrapData,
): Promise<SearchArticleMetadataIndex> {
  if (bootstrap.articleMetadataIndex)
    return bootstrap.articleMetadataIndex

  const [metadata] = await catchAsyncError(
    () => fetchJsonIndex<SearchArticleMetadataIndex>(bootstrap.articlesDataUrl),
  )
  return metadata || {}
}

async function resolveSearchTagIndex(
  bootstrap: SearchEngineBootstrapData,
): Promise<SearchTagIndexItem[]> {
  if (bootstrap.tagIndex)
    return bootstrap.tagIndex

  const [tags] = await catchAsyncError(
    () => fetchJsonIndex<SearchTagIndexItem[]>(bootstrap.tagsDataUrl),
  )
  return tags || []
}

function reportSearchEngineBuild(
  debug: boolean,
  onReport: (report: SearchBuildReport) => void,
  report: SearchBuildReport,
): void {
  if (typeof window !== 'undefined')
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
  // eslint-disable-next-line no-console
  console.warn(`Search cache ${operation} failed; continuing without cache.`, error)
}
