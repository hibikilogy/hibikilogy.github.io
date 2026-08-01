import type {
  SearchArticleMetadataIndex,
  SearchEngineCacheEntry,
  SearchEngineCacheStorage,
  SearchTagIndexItem,
} from '../types.ts'
import Fuse from 'fuse.js'
import { parseUrl } from 'shared/url.ts'
import {
  defaultFuseSearchKeys,
  extendedFuseSearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
} from '../config.ts'

export const SEARCH_CACHE_SCHEMA_VERSION = 1
export const SEARCH_CACHE_FUSE_VERSION = Fuse.version || 'unknown'
export const SEARCH_CACHE_CONFIG_VERSION = createStableHash({
  defaultFuseSearchKeys,
  extendedFuseSearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
})

const SEARCH_CACHE_DB_NAME = 'hibikilogy-search'
const SEARCH_CACHE_DB_VERSION = 1
const SEARCH_CACHE_STORE_NAME = 'search-engine-cache'

let indexedDbStorage: SearchEngineCacheStorage | null | undefined
let isIndexedDbSearchCacheDisabled = false

export function getSearchIndexVersion(indexUrl: string): string {
  const value = String(indexUrl || '')

  const url = parseUrl(value, getSearchCacheBaseUrl())
  return url?.searchParams.get('h') || value
}

export function createSearchCacheKey(
  indexUrl: string,
  metadata: {
    articleMetadataIndex?: SearchArticleMetadataIndex
    tagIndex?: SearchTagIndexItem[]
  } = {},
): string {
  return [
    'hibikilogy-search',
    `schema-${SEARCH_CACHE_SCHEMA_VERSION}`,
    `fuse-${SEARCH_CACHE_FUSE_VERSION}`,
    `config-${SEARCH_CACHE_CONFIG_VERSION}`,
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
        db.transaction(SEARCH_CACHE_STORE_NAME, 'readonly').objectStore(SEARCH_CACHE_STORE_NAME).get(key),
      ).then(entry => entry || null)
    },
    write: async (entry) => {
      const db = await openSearchCacheDb()
      const transaction = db.transaction(SEARCH_CACHE_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(SEARCH_CACHE_STORE_NAME)

      // Content-addressed keys never satisfy reads across deployments; keep
      // one committed snapshot instead of a copy per deployment.
      store.clear()
      store.put(entry)
      await waitForSearchCacheTransaction(transaction)
    },
  }
}

function openSearchCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SEARCH_CACHE_DB_NAME, SEARCH_CACHE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SEARCH_CACHE_STORE_NAME)) {
        db.createObjectStore(SEARCH_CACHE_STORE_NAME, { keyPath: 'key' })
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

function waitForSearchCacheTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(
      transaction.error || new Error('Search cache transaction failed'),
    )
    transaction.onabort = () => reject(
      transaction.error || new Error('Search cache transaction aborted'),
    )
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
