import type Fuse from 'fuse.js'
import type { FuseIndex } from 'fuse.js'

export interface RawSearchIndexEntry {
  path?: string
  url?: string
  title?: string
  description?: string
  body?: string
  date?: string
}

export interface SearchArticleMetadata {
  s?: string
  cs?: string
  ca?: string
  cw?: number
  ch?: number
  ct?: string
  dv?: string
  an?: string
  ah?: string
}

export type SearchArticleMetadataIndex = Record<string, SearchArticleMetadata>

export interface SearchTagIndexItem {
  name?: string
  href?: string
  pages?: string[]
}

export interface SearchTagItem {
  name: string
  href: string
}

export interface SearchRecord {
  url: string
  path: string
  title: string
  description: string
  body: string
  date: string
  slug: string
  authorName: string
  authorHref: string
  tags: SearchTagItem[]
  titleSearch: string
  descriptionSearch: string
  slugSearch: string
  bodySearch: string
  authorSearch: string
  tagSearch: string
  metadataSearch: string
  bodyMatchExcerpt?: boolean
}

export interface SearchResultRecord extends SearchRecord {
  bodyMatchExcerpt?: boolean
  searchRank: number
  searchScore: number
}

export interface SearchEngine {
  records: SearchRecord[]
  defaultFuse: SearchFuse
  extendedFuse: SearchFuse
}

export interface SearchTimingPhase {
  label: string
  durationMs: number
  metadata?: Record<string, unknown>
}

export interface SearchBuildReport {
  cacheHit: boolean
  cacheKey: string
  indexUrl: string
  indexVersion: string
  recordCount: number
  rawEntryCount?: number
  defaultFuseIndexRecordCount?: number
  extendedFuseIndexRecordCount?: number
  cacheStatus?: string
  phases: SearchTimingPhase[]
}

export interface SearchFuse {
  search: Fuse<SearchRecord>['search']
  getIndex: Fuse<SearchRecord>['getIndex']
}

export interface FuseSearchResult {
  item: SearchRecord
  score?: number
  matches?: ReadonlyArray<{
    key?: string
    value?: string
    indices?: ReadonlyArray<[number, number]>
  }>
}

export type SearchField = 'author' | 'tag' | 'title' | 'body' | 'description' | 'slug'

export interface SearchFieldDefinition {
  field: SearchField
  aliases: string[]
  label: string
  searchKey: keyof SearchRecord
}

export type SearchClause
  = | { type: 'term', value: string, phrase: boolean }
    | { type: 'field', field: SearchField, value: string }
    | { type: 'not', clause: Exclude<SearchClause, { type: 'not' }> }

export interface ParsedSearchQuery {
  mode: 'and' | 'or'
  clauses: SearchClause[]
}

export type FuseLogicalQuery
  = | Record<string, string>
    | { $and: FuseLogicalQuery[] }
    | { $or: FuseLogicalQuery[] }

export interface SearchWorkerRequest {
  id: number
  type: 'preload' | 'count' | 'search'
  term?: string
  bootstrap?: SearchEngineBootstrapData
}

export type SearchIndexBuildStatus
  = | 'cache-read'
    | 'cache-hit'
    | 'fetch'
    | 'normalize'
    | 'index-build'
    | 'cache-write'
    | 'ready'

export type SearchWorkerResponse
  = | { id: number, status: SearchIndexBuildStatus }
    | { id: number, buildReport: SearchBuildReport }
    | { id: number, ok: true, result: unknown }
    | { id: number, ok: false, error: string }

export interface SearchEngineBootstrapData {
  indexUrl?: string
  debug?: boolean
  articleMetadataIndex?: SearchArticleMetadataIndex
  tagIndex?: SearchTagIndexItem[]
}

export type SearchFuseIndexJson = ReturnType<FuseIndex<SearchRecord>['toJSON']>

export interface SearchEngineCacheEntry {
  key: string
  records: SearchRecord[]
  defaultFuseIndexJson: SearchFuseIndexJson
  extendedFuseIndexJson: SearchFuseIndexJson
  createdAt: number
}

export interface SearchEngineCacheStorage {
  read: (key: string) => Promise<SearchEngineCacheEntry | null>
  write: (entry: SearchEngineCacheEntry) => Promise<void>
}
