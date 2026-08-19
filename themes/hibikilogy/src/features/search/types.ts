import type { ComputedRef, ShallowRef } from '@vue/reactivity'
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
  subtitle: string
  coverSrc: string
  coverAlt: string
  coverWidth?: number
  coverHeight?: number
  coverThumbhash?: string
  publishDateValue: string
  body: string
  date: string
  slug: string
  authorName: string
  authorHref: string
  tags: SearchTagItem[]
  titleSearch: string
  descriptionSearch: string
  slugSearch: string
  authorSearch: string
  tagSearch: string
  bodyMatchExcerpt?: boolean
}

type SearchResultPresentationFields = Omit<
  SearchRecord,
  | 'titleSearch'
  | 'descriptionSearch'
  | 'slugSearch'
  | 'authorSearch'
  | 'tagSearch'
  | 'bodyMatchExcerpt'
>

export interface SearchResultRecord extends SearchResultPresentationFields {
  bodyMatchExcerpt?: boolean
  searchRank: number
  searchScore: number
}

export interface SearchResponse {
  records: SearchResultRecord[]
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
}

export type SearchField = 'author' | 'tag' | 'title' | 'body' | 'description' | 'slug'

export interface SearchFieldDefinition {
  field: SearchField
  aliases: string[]
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

export interface SearchEngineBootstrapData {
  indexUrl: string
  articlesDataUrl: string
  tagsDataUrl: string
  debug?: boolean
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
export type SearchSort = 'relevance' | 'title'

export interface SearchQuery {
  readonly term: string
  readonly page: number
  readonly sort: SearchSort
}

export interface SearchPagination {
  readonly currentPage: number
  readonly totalPages: number
  readonly totalRecords: number
}

export type SearchPageState
  = | { phase: 'idle', query: SearchQuery, count?: number }
    | { phase: 'loading', query: SearchQuery, requestId: number }
    | { phase: 'ready', query: SearchQuery, response: SearchResponse }
    | { phase: 'error', query: SearchQuery, error: Error }

export type SearchReportListener = (report: SearchBuildReport) => void

export interface SearchService {
  preload: () => Promise<void>
  count: () => Promise<number>
  search: (query: SearchQuery) => Promise<SearchResponse>
  dispose: () => void
}

export interface SearchWorkerApi {
  initialize: (
    bootstrap: SearchEngineBootstrapData,
    onReport?: SearchReportListener,
  ) => Promise<void>
  count: () => Promise<number>
  search: (term: string) => Promise<SearchResponse>
}
export interface SearchModel {
  readonly state: Readonly<ShallowRef<SearchPageState>>
  readonly results: Readonly<ComputedRef<SearchResultRecord[]>>
  readonly relatedTags: Readonly<ComputedRef<SearchTagItem[]>>
  readonly pagination: Readonly<ComputedRef<SearchPagination>>
  setTerm: (term: string) => void
  setSort: (sort: SearchSort) => void
  setPage: (page: number) => void
}
