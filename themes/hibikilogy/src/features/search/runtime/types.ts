import type { SearchEngineBootstrapData, SearchReportListener, SearchResponse } from '../types.ts'

export interface SearchClient {
  preload: () => Promise<void>
  count: () => Promise<number>
  search: (term: string) => Promise<SearchResponse>
  dispose: () => void
}

export interface SearchServiceOptions {
  readonly workerUrl: string
  readonly getBootstrap: () => SearchEngineBootstrapData
  readonly onReport?: SearchReportListener
}
