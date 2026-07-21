import type { SearchResultRecord, SearchIndexBuildStatus } from './types.ts'
import type { SearchSort } from './snapshot-store.ts'

export interface SearchState {
  records: SearchResultRecord[]
  currentTerm: string
  currentPage: number
  currentSort: SearchSort
  /** Monotonic counter to invalidate obsolete async work. */
  activeSearchId: number
  /** Latest index build status observed by the page controller. */
  currentIndexStatus: SearchIndexBuildStatus
}

export function createSearchState(): SearchState {
  return {
    records: [],
    currentTerm: '',
    currentPage: 1,
    currentSort: 'relevance',
    activeSearchId: 0,
    currentIndexStatus: 'cache-read',
  }
}

export function resetSearchState(state: SearchState): void {
  state.currentTerm = ''
  state.currentPage = 1
  state.records = []
}