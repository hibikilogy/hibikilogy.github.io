import type {
  SearchBuildReport,
  SearchEngine,
  SearchEngineBootstrapData,
  SearchExecutionResult,
  SearchIndexBuildStatus,
  SearchWorkerApi,
} from '../features/search/types.ts'
import { expose } from 'comlink'
import { searchRecordsInEngine } from '../features/search/core/engine.ts'
import { getDurationMs, nowMs } from '../features/search/debug.ts'
import { buildSearchEngine } from '../features/search/runtime/index.ts'

let enginePromise: Promise<SearchEngine> | null = null
let currentKey = ''
let statusListener: ((status: SearchIndexBuildStatus) => void) | undefined
let reportListener: ((report: SearchBuildReport) => void) | undefined

const api: SearchWorkerApi = {
  async initialize(bootstrap, onStatus, onReport) {
    const nextKey = JSON.stringify({
      indexUrl: bootstrap.indexUrl,
      articleMetadata: bootstrap.articleMetadataIndex,
      tags: bootstrap.tagIndex,
    })

    statusListener = onStatus
    reportListener = onReport
    if (currentKey !== nextKey) {
      currentKey = nextKey
      enginePromise = null
    }

    await getEngine(bootstrap)
  },
  async count() {
    return (await requireEngine()).records.length
  },
  async search(term: string): Promise<SearchExecutionResult> {
    const engine = await requireEngine()
    const start = nowMs()
    return {
      records: searchRecordsInEngine(engine, term),
      engineDurationMs: getDurationMs(start),
    }
  },
}

function getEngine(bootstrap: SearchEngineBootstrapData): Promise<SearchEngine> {
  if (!enginePromise) {
    const pending = buildSearchEngine(bootstrap, {
      onStatus: status => statusListener?.(status),
      onReport: report => reportListener?.(report),
    })
    enginePromise = pending
    void pending.catch(() => {
      if (enginePromise === pending)
        enginePromise = null
    })
  }
  return enginePromise
}

function requireEngine(): Promise<SearchEngine> {
  if (!enginePromise)
    return Promise.reject(new Error('Search worker is not initialized'))
  return enginePromise
}

expose(api)
