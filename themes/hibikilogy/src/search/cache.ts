import type {
  SearchArticleMetadataIndex,
  SearchEngineBootstrapData,
  SearchEngineCacheEntry,
  SearchEngineCacheStorage,
  SearchTagIndexItem,
} from './types.ts'
import Fuse from 'fuse.js'
import {
  defaultFuseSearchKeys,
  extendedFuseSearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
  secondarySearchScoreThreshold,
} from './config.ts'

export const searchCacheSchemaVersion = 1
export const searchCacheFuseVersion = Fuse.version || 'unknown'
export const searchCacheConfigVersion = createStableHash({
  defaultFuseSearchKeys,
  extendedFuseSearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
  secondarySearchScoreThreshold,
})

const searchCacheDbName = 'hibikilogy-search'
const searchCacheDbVersion = 1
const searchCacheStoreName = 'search-engine-cache'

let indexedDbStorage: SearchEngineCacheStorage | null | undefined
let isIndexedDbSearchCacheDisabled = false

export function getSearchIndexVersion(indexUrl: string): string {
  const value = String(indexUrl || '')

  try {
    const url = new URL(value, getSearchCacheBaseUrl())
    return url.searchParams.get('h') || value
  }
  catch {
    return value
  }
}

export function createSearchCacheKey(
  indexUrl: string,
  metadata: Pick<SearchEngineBootstrapData, 'articleMetadataIndex' | 'tagIndex'> = {},
): string {
  return [
    'hibikilogy-search',
    `schema-${searchCacheSchemaVersion}`,
    `fuse-${searchCacheFuseVersion}`,
    `config-${searchCacheConfigVersion}`,
    `metadata-${createSearchMetadataVersion(metadata.articleMetadataIndex, metadata.tagIndex)}`,
    `index-${getSearchIndexVersion(indexUrl)}`,
  ].join(':')
}

export function createSearchMetadataVersion(
  articleMetadataIndex: SearchArticleMetadataIndex = {},
  tagIndex: SearchTagIndexItem[] = [],
): string {
  return createStableHash({
    articleMetadataIndex,
    tagIndex,
  })
}

export function getIndexedDbSearchCacheStorage(): SearchEngineCacheStorage | null {
  if (isIndexedDbSearchCacheDisabled)
    return null
  if (indexedDbStorage !== undefined)
    return indexedDbStorage
  indexedDbStorage = createIndexedDbSearchCacheStorage()
  return indexedDbStorage
}

export function disableIndexedDbSearchCacheStorage(): void {
  isIndexedDbSearchCacheDisabled = true
  indexedDbStorage = null
}

export function createIndexedDbSearchCacheStorage(): SearchEngineCacheStorage | null {
  if (typeof indexedDB === 'undefined')
    return null

  return {
    read: async (key) => {
      const db = await openSearchCacheDb()
      return requestSearchCacheValue<SearchEngineCacheEntry | undefined>(
        db.transaction(searchCacheStoreName, 'readonly').objectStore(searchCacheStoreName).get(key),
      ).then(entry => entry || null)
    },
    write: async (entry) => {
      const db = await openSearchCacheDb()
      await requestSearchCacheValue(
        db.transaction(searchCacheStoreName, 'readwrite').objectStore(searchCacheStoreName).put(entry),
      )
    },
  }
}

function openSearchCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(searchCacheDbName, searchCacheDbVersion)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(searchCacheStoreName)) {
        db.createObjectStore(searchCacheStoreName, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open search cache database'))
  })
}

function requestSearchCacheValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Search cache request failed'))
  })
}

function getSearchCacheBaseUrl(): string {
  return globalThis.location?.origin || 'http://localhost/'
}

function createStableHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 5381

  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}
