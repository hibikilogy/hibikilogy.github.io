import type {
  SearchIndexBuildStatus,
  SearchService,
  SearchStatusListener,
  SearchWorkerApi,
} from '../types.ts'
import type { SearchClient, SearchServiceOptions } from './types.ts'
import { catchError } from 'shared/result.ts'
import { logSearchBuildReport } from '../debug.ts'

export function createSearchService(options: SearchServiceOptions): SearchService {
  const listeners = new Set<SearchStatusListener>()
  let status: SearchIndexBuildStatus = 'cache-read'
  let clientPromise: Promise<SearchClient> | null = null
  let disposed = false

  function emit(next: SearchIndexBuildStatus): void {
    status = next
    options.onStatus?.(next)
    listeners.forEach(listener => listener(next))
  }

  function getClient(): Promise<SearchClient> {
    if (!clientPromise) {
      const pending = createClient()
      clientPromise = pending
      void pending.catch(() => {
        if (clientPromise === pending)
          clientPromise = null
      })
    }
    return clientPromise
  }

  async function createClient(): Promise<SearchClient> {
    const bootstrap = options.getBootstrap()
    const workerClient = await createWorkerClient(options.workerUrl, bootstrap, emit, (report) => {
      options.onReport?.(report)
      logSearchBuildReport(Boolean(bootstrap.debug), report)
    })

    if (workerClient)
      return createResilientClient(workerClient, () => createFallbackClient(bootstrap, emit, options.onReport))

    return createFallbackClient(bootstrap, emit, options.onReport)
  }

  return {
    preload: async () => {
      await (await getClient()).preload()
    },
    count: async () => (await getClient()).count(),
    search: async query => (await getClient()).search(query.term),
    getStatus: () => status,
    subscribeStatus: (listener) => {
      listeners.add(listener)
      listener(status)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      listeners.clear()
      void clientPromise?.then(client => client.dispose())
      clientPromise = null
    },
  }

  async function createWorkerClient(
    workerUrl: string,
    bootstrap: ReturnType<SearchServiceOptions['getBootstrap']>,
    onStatus: SearchStatusListener,
    onReport: NonNullable<SearchServiceOptions['onReport']>,
  ): Promise<SearchClient | null> {
    if (disposed || typeof Worker === 'undefined')
      return null

    const [worker] = catchError(() => new Worker(new URL(workerUrl, window.location.origin), { type: 'module' }))
    if (!worker)
      return null

    try {
      const { proxy, wrap } = await import('comlink')
      const remote = wrap<SearchWorkerApi>(worker)
      await remote.initialize(bootstrap, proxy(onStatus), proxy(onReport))

      return {
        preload: async () => {},
        count: () => remote.count(),
        search: term => remote.search(term),
        dispose: () => worker.terminate(),
      }
    }
    catch (error) {
      worker.terminate()
      // eslint-disable-next-line no-console
      console.warn('Search worker failed to initialize; falling back to main thread search.', error)
      return null
    }
  }
}

function createResilientClient(
  primary: SearchClient,
  createFallback: () => Promise<SearchClient>,
): SearchClient {
  let active = primary
  let fallbackPromise: Promise<SearchClient> | null = null
  let primaryDisposed = false

  async function getFallback(error: unknown): Promise<SearchClient> {
    if (!fallbackPromise) {
      if (!primaryDisposed) {
        primary.dispose()
        primaryDisposed = true
      }
      // eslint-disable-next-line no-console
      console.warn('Search worker failed during a request; falling back to main thread search.', error)
      fallbackPromise = createFallback()
    }

    active = await fallbackPromise
    return active
  }

  async function run<T>(operation: (client: SearchClient) => Promise<T>): Promise<T> {
    const client = active
    try {
      return await operation(client)
    }
    catch (error) {
      if (client !== primary)
        throw error
      return operation(await getFallback(error))
    }
  }

  return {
    preload: () => run(client => client.preload()),
    count: () => run(client => client.count()),
    search: term => run(client => client.search(term)),
    dispose: () => active.dispose(),
  }
}

async function createFallbackClient(
  bootstrap: Parameters<typeof import('./mainThreadClient.ts')['createMainThreadClient']>[0],
  onStatus?: Parameters<typeof import('./mainThreadClient.ts')['createMainThreadClient']>[1],
  onReport?: Parameters<typeof import('./mainThreadClient.ts')['createMainThreadClient']>[2],
): Promise<SearchClient> {
  const { createMainThreadClient } = await import('./mainThreadClient.ts')
  return createMainThreadClient(bootstrap, onStatus, onReport)
}
