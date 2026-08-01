import type {
  SearchEngineBootstrapData,
  SearchReportListener,
  SearchStatusListener,
} from '../types.ts'
import type { SearchClient } from './types.ts'
import { createSingleFlight } from 'shared/singleFlight.ts'
import { searchRecordsInEngine } from '../core/engine.ts'
import { getDurationMs, nowMs } from '../debug.ts'
import { buildSearchEngine } from './engineBuilder.ts'

export function createMainThreadClient(
  bootstrap: SearchEngineBootstrapData,
  onStatus?: SearchStatusListener,
  onReport?: SearchReportListener,
): SearchClient {
  const engine = createSingleFlight(() => buildSearchEngine(bootstrap, { onStatus, onReport }))

  return {
    preload: async () => {
      await engine.run()
    },
    count: async () => (await engine.run()).records.length,
    search: async (term) => {
      const instance = await engine.run()
      const start = nowMs()
      return {
        records: searchRecordsInEngine(instance, term),
        engineDurationMs: getDurationMs(start),
      }
    },
    dispose: () => {
      engine.reset()
    },
  }
}
