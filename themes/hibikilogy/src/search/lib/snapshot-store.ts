import type { SearchResultRecord } from './types.ts'

export type SearchSort = 'relevance' | 'title'

export interface SearchResultSnapshot {
  term: string
  sort: SearchSort
  records: SearchResultRecord[]
}

export interface SearchSnapshotStore {
  /** Persist the latest committed search result so popstate can restore it. */
  commit: (snapshot: SearchResultSnapshot) => void
  /** Return a matching snapshot for the given query/sort, or `null`. */
  match: (term: string, sort: SearchSort) => SearchResultSnapshot | null
  /** Drop any committed snapshot. */
  clear: () => void
  /** Read the current snapshot without matching (debug/inspection only). */
  current: () => SearchResultSnapshot | null
}

/**
 * Small store for the last successfully rendered search result. Lives in its
 * own module so the page controller and renderer don't need to share mutable
 * module-level state for the popstate restore path.
 */
export function createSearchSnapshotStore(): SearchSnapshotStore {
  let snapshot: SearchResultSnapshot | null = null
  return {
    commit: (next) => {
      snapshot = next
    },
    match: (term, sort) => {
      if (!snapshot || snapshot.term !== term || snapshot.sort !== sort)
        return null
      return snapshot
    },
    clear: () => {
      snapshot = null
    },
    current: () => snapshot,
  }
}