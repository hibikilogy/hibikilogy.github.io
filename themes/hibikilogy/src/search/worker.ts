import type {
  SearchBuildReport,
  SearchEngine,
  SearchIndexBuildStatus,
  SearchWorkerRequest,
  SearchWorkerResponse,
} from './types.ts'
import { getDurationMs, nowMs } from './debug.ts'
import { searchRecordsInEngine } from './engine.ts'
import {
  buildSearchEngine,
} from './index.ts'

let enginePromise: Promise<SearchEngine> | null = null
const workerGlobal = globalThis as unknown as DedicatedWorkerGlobalScope

workerGlobal.addEventListener('message', (event: { data: SearchWorkerRequest }) => {
  const message = event.data as SearchWorkerRequest
  void handleSearchWorkerRequest(message)
})

async function handleSearchWorkerRequest(message: SearchWorkerRequest): Promise<void> {
  try {
    const result = await runSearchWorkerRequest(message)
    postSearchWorkerResponse({ id: message.id, ok: true, result })
  }
  catch (error) {
    postSearchWorkerResponse({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runSearchWorkerRequest(message: SearchWorkerRequest): Promise<unknown> {
  const engine = await getWorkerSearchEngine(message.bootstrap)

  if (message.type === 'preload')
    return undefined
  if (message.type === 'count')
    return engine.records.length
  if (message.type === 'search')
    return runTimedWorkerSearch(engine, message.term || '')

  throw new Error(`Unknown search worker request: ${message.type}`)
}

function runTimedWorkerSearch(engine: SearchEngine, term: string) {
  const start = nowMs()
  const records = searchRecordsInEngine(engine, term)
  return { records, engineDurationMs: getDurationMs(start) }
}

function getWorkerSearchEngine(bootstrap?: SearchWorkerRequest['bootstrap']): Promise<SearchEngine> {
  if (!enginePromise) {
    enginePromise = buildSearchEngine(bootstrap, {
      onStatus: postSearchWorkerStatus,
      onReport: postSearchWorkerBuildReport,
    })
  }

  return enginePromise
}

function postSearchWorkerStatus(status: SearchIndexBuildStatus): void {
  workerGlobal.postMessage({ id: 0, status })
}

function postSearchWorkerBuildReport(buildReport: SearchBuildReport): void {
  workerGlobal.postMessage({ id: 0, buildReport })
}

function postSearchWorkerResponse(response: SearchWorkerResponse): void {
  workerGlobal.postMessage(response)
}
