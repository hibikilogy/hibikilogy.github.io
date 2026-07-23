import type { SearchSnapshotStore } from './types.ts'

export function createSearchSnapshotStore(): SearchSnapshotStore {
  let snapshot: ReturnType<SearchSnapshotStore['match']> = null

  return {
    commit: (next) => {
      snapshot = {
        ...next,
        query: { ...next.query },
        response: {
          ...next.response,
          records: [...next.response.records],
        },
      }
    },
    match: key => snapshot?.key === key ? snapshot : null,
  }
}
