import type { SearchFieldDefinition, SearchRecord } from './types.ts'
import { HIBIKILOGY_CONFIG, HIBIKILOGY_TRANSLATIONS } from '../config-env.generated.ts'
import { getRuntimeConfig } from './runtime-config.ts'
import { fmt } from './utils.ts'

const runtime = typeof window !== 'undefined' ? getRuntimeConfig() : undefined

export const searchIndexUrl = runtime?.searchIndexUrl || 'search_index.zh.json'
export const searchWorkerUrl = runtime?.searchWorkerUrl || '/js/search/worker.js'

// Build-time constants from config.toml are generated into config-env.generated.ts.
export const searchPageSize = HIBIKILOGY_CONFIG.searchPageSize

export const searchArticleIndexInlineId = 'hibikilogy-search-articles-data'
export const searchTagIndexInlineId = 'hibikilogy-search-tags-data'
export const searchFocusIntentKey = 'search-focus-intent'
export const secondarySearchScoreThreshold = 0.06

export const searchMessages = {
  indexLoading: HIBIKILOGY_TRANSLATIONS.searchIndexLoading,
  cacheReading: HIBIKILOGY_TRANSLATIONS.searchCacheReading,
  indexBuilding: HIBIKILOGY_TRANSLATIONS.searchIndexBuilding,
  loading: (term: string) => fmt(HIBIKILOGY_TRANSLATIONS.searchLoading, term),
  failed: HIBIKILOGY_TRANSLATIONS.searchFailed,
  failedWithError: (message: string) => fmt(HIBIKILOGY_TRANSLATIONS.searchFailedWithError, message),
  empty: (term: string) => fmt(HIBIKILOGY_TRANSLATIONS.searchEmpty, term),
  found: (term: string, count: number) => fmt(HIBIKILOGY_TRANSLATIONS.searchFound, count, term),
  idle: (count: number) => fmt(HIBIKILOGY_TRANSLATIONS.searchIdle, count),
}

export const fuseSearchOptions = {
  includeScore: true,
  includeMatches: true,
  findAllMatches: true,
  ignoreLocation: true,
  fieldNormWeight: 0.3,
  minMatchCharLength: 1,
  threshold: 0.42,
  useExtendedSearch: true,
  useTokenSearch: true,
  tokenMatch: 'all' as const,
}

export const defaultFuseSearchKeys = [
  { name: 'titleSearch', weight: 4 },
  { name: 'descriptionSearch', weight: 2.5 },
  { name: 'slugSearch', weight: 2 },
  { name: 'bodySearch', weight: 0.9 },
] satisfies Array<{ name: keyof SearchRecord, weight: number }>

export const extendedFuseSearchKeys = [
  { name: 'titleSearch', weight: 4 },
  { name: 'tagSearch', weight: 3 },
  { name: 'authorSearch', weight: 2.8 },
  { name: 'descriptionSearch', weight: 2.5 },
  { name: 'slugSearch', weight: 2 },
  { name: 'metadataSearch', weight: 1.5 },
  { name: 'bodySearch', weight: 0.9 },
] satisfies Array<{ name: keyof SearchRecord, weight: number }>

export const defaultPrimarySearchKeys = new Set<keyof SearchRecord>([
  'titleSearch',
  'descriptionSearch',
  'slugSearch',
])

export const extendedPrimarySearchKeys = new Set<keyof SearchRecord>([
  ...defaultPrimarySearchKeys,
  'authorSearch',
  'tagSearch',
])

export const searchFieldDefinitions = [
  {
    field: 'author',
    aliases: ['author', '作者'],
    label: '作者',
    searchKey: 'authorSearch',
  },
  {
    field: 'tag',
    aliases: ['tag', 'tags', '标签'],
    label: '标签',
    searchKey: 'tagSearch',
  },
  {
    field: 'title',
    aliases: ['title', '标题'],
    label: '标题',
    searchKey: 'titleSearch',
  },
  {
    field: 'body',
    aliases: ['body', '正文'],
    label: '正文',
    searchKey: 'bodySearch',
  },
  {
    field: 'description',
    aliases: ['description', 'desc', '摘要'],
    label: '摘要',
    searchKey: 'descriptionSearch',
  },
  {
    field: 'slug',
    aliases: ['slug'],
    label: 'Slug',
    searchKey: 'slugSearch',
  },
] satisfies SearchFieldDefinition[]
