import type { SearchPageState, SearchQuery, SearchResponse } from '../types.ts'

export interface SearchSnapshot {
  readonly key: string
  readonly query: SearchQuery
  readonly response: SearchResponse
}

export interface SearchSnapshotStore {
  commit: (snapshot: SearchSnapshot) => void
  match: (key: string) => SearchSnapshot | null
}

export interface SearchPaginationOptions {
  readonly currentPage: number
  readonly totalPages: number
  readonly getHref: (page: number) => string
}

export interface SearchView {
  render: (state: SearchPageState) => Promise<void>
}
