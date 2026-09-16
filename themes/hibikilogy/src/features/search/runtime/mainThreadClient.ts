import type { SearchEngineBootstrapData, SearchReportListener } from '../types.ts'
import type { SearchClient } from './types.ts'
import { createSingleFlight } from 'shared/singleFlight.ts'
import { searchRecordsInEngine } from '../core/engine.ts'
import { buildSearchEngine } from './engineBuilder.ts'

export function createMainThreadClient(
  bootstrap: SearchEngineBootstrapData,
  onReport?: SearchReportListener,
): SearchClient {
  const engine = createSingleFlight(() => buildSearchEngine(bootstrap, { onReport }))

  return {
    preload: async () => {
      await engine.run()
    },
    count: async () => (await engine.run()).records.length,
    search: async (term) => {
      const instance = await engine.run()
      return { records: searchRecordsInEngine(instance, term) }
    },
    dispose: () => {
      engine.reset()
    },
  }
}
