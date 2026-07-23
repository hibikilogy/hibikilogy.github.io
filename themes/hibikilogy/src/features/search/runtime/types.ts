import type {
  SearchEngineBootstrapData,
  SearchExecutionResult,
  SearchReportListener,
  SearchStatusListener,
} from '../types.ts'

export interface SearchClient {
  preload: () => Promise<void>
  count: () => Promise<number>
  search: (term: string) => Promise<SearchExecutionResult>
  dispose: () => void
}

export interface SearchServiceOptions {
  readonly workerUrl: string
  readonly getBootstrap: () => SearchEngineBootstrapData
  readonly onReport?: SearchReportListener
  readonly onStatus?: SearchStatusListener
}
