import type {
  SearchBuildReport,
  SearchEngine,
  SearchEngineBootstrapData,
  SearchExecutionResult,
  SearchIndexBuildStatus,
  SearchWorkerApi,
} from '../types.ts'
import { expose } from 'comlink'
import { createSingleFlight } from 'shared/singleFlight.ts'
import { searchRecordsInEngine } from '../core/engine.ts'
import { getDurationMs, nowMs } from '../debug.ts'
import { buildSearchEngine } from './index.ts'

let currentBootstrap: SearchEngineBootstrapData | null = null
let currentKey = ''
let statusListener: ((status: SearchIndexBuildStatus) => void) | undefined
let reportListener: ((report: SearchBuildReport) => void) | undefined
const engine = createSingleFlight<SearchEngine>(() => {
  if (!currentBootstrap)
    throw new Error('Search worker is not initialized')
  return buildSearchEngine(
    currentBootstrap,
    {
      onStatus: status => statusListener?.(status),
      onReport: report => reportListener?.(report),
    },
  )
})

const api: SearchWorkerApi = {
  async initialize(bootstrap, onStatus, onReport) {
    const nextKey = JSON.stringify({
      indexUrl: bootstrap.indexUrl,
      articlesDataUrl: bootstrap.articlesDataUrl,
      tagsDataUrl: bootstrap.tagsDataUrl,
    })

    statusListener = onStatus
    reportListener = onReport
    if (currentKey !== nextKey) {
      currentKey = nextKey
      currentBootstrap = bootstrap
      engine.reset()
    }

    await getEngine()
  },
  async count() {
    return (await requireEngine()).records.length
  },
  async search(term: string): Promise<SearchExecutionResult> {
    const instance = await requireEngine()
    const start = nowMs()
    return {
      records: searchRecordsInEngine(instance, term),
      engineDurationMs: getDurationMs(start),
    }
  },
}

function getEngine(): Promise<SearchEngine> {
  return engine.run()
}

function requireEngine(): Promise<SearchEngine> {
  const pending = engine.peek()
  if (!pending)
    return Promise.reject(new Error('Search worker is not initialized'))
  return pending
}

expose(api)
