import type { SearchResponse } from '../types.ts'
import { describe, expect, it } from 'vitest'
import { createSearchSnapshotStore } from './snapshotStore.ts'

describe('search snapshot store', () => {
  it('matches only the complete location key and owns its record array', () => {
    const records: SearchResponse['records'] = []
    const store = createSearchSnapshotStore()

    store.commit({
      key: '/search?q=hello&p=2',
      query: { term: 'hello', page: 2, sort: 'relevance' },
      response: { records, engineDurationMs: 1 },
    })
    records.push({} as SearchResponse['records'][number])

    expect(store.match('/search?q=hello')).toBeNull()
    expect(store.match('/search?q=hello&p=2')?.response.records).toHaveLength(0)
  })
})
