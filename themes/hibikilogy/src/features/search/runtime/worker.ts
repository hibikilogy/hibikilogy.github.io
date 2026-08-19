import type {
  SearchBuildReport,
  SearchEngine,
  SearchEngineBootstrapData,
  SearchResponse,
  SearchWorkerApi,
} from '../types.ts'
import { expose } from 'comlink'
import { createSingleFlight } from 'shared/singleFlight.ts'
import { searchRecordsInEngine } from '../core/engine.ts'
import { buildSearchEngine } from './engineBuilder.ts'

let currentBootstrap: SearchEngineBootstrapData | null = null
let currentKey = ''
let reportListener: ((report: SearchBuildReport) => void) | undefined
const engine = createSingleFlight<SearchEngine>(() => {
  if (!currentBootstrap)
    throw new Error('Search worker is not initialized')
  return buildSearchEngine(
    currentBootstrap,
    {
      onReport: report => reportListener?.(report),
    },
  )
})

const api: SearchWorkerApi = {
  async initialize(bootstrap, onReport) {
    const nextKey = JSON.stringify({
      indexUrl: bootstrap.indexUrl,
      articlesDataUrl: bootstrap.articlesDataUrl,
      tagsDataUrl: bootstrap.tagsDataUrl,
    })

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
  async search(term: string): Promise<SearchResponse> {
    const instance = await requireEngine()
    return { records: searchRecordsInEngine(instance, term) }
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
