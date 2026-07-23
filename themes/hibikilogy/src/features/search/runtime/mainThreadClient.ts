import type {
  SearchEngine,
  SearchEngineBootstrapData,
  SearchReportListener,
  SearchStatusListener,
} from '../types.ts'
import type { SearchClient } from './types.ts'
import { searchRecordsInEngine } from '../core/engine.ts'
import { getDurationMs, nowMs } from '../debug.ts'
import { buildSearchEngine } from './engineBuilder.ts'

export function createMainThreadClient(
  bootstrap: SearchEngineBootstrapData,
  onStatus?: SearchStatusListener,
  onReport?: SearchReportListener,
): SearchClient {
  let enginePromise: Promise<SearchEngine> | null = null

  function getEngine(): Promise<SearchEngine> {
    if (!enginePromise) {
      const pending = buildSearchEngine(bootstrap, { onStatus, onReport })
      enginePromise = pending
      void pending.catch(() => {
        if (enginePromise === pending)
          enginePromise = null
      })
    }
    return enginePromise
  }

  return {
    preload: async () => {
      await getEngine()
    },
    count: async () => (await getEngine()).records.length,
    search: async (term) => {
      const engine = await getEngine()
      const start = nowMs()
      return {
        records: searchRecordsInEngine(engine, term),
        engineDurationMs: getDurationMs(start),
      }
    },
    dispose: () => {
      enginePromise = null
    },
  }
}
