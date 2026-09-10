import type { SearchReportListener, SearchService, SearchWorkerApi } from '../types.ts'
import type { SearchClient, SearchServiceOptions } from './types.ts'
import { catchError } from 'shared/result.ts'
import { createSingleFlight } from 'shared/singleFlight.ts'
import { logSearchBuildReport } from '../debug.ts'

export function createSearchService(options: SearchServiceOptions): SearchService {
  let disposed = false
  const client = createSingleFlight(() => createClient())

  function getClient(): Promise<SearchClient> {
    return client.run()
  }

  async function createClient(): Promise<SearchClient> {
    const bootstrap = options.getBootstrap()
    const onReport: SearchReportListener = (report) => {
      options.onReport?.(report)
      logSearchBuildReport(Boolean(bootstrap.debug), report)
    }
    const workerClient = await createWorkerClient(options.workerUrl, bootstrap, onReport)

    if (workerClient)
      return createResilientClient(workerClient, () => createFallbackClient(bootstrap, onReport))

    return createFallbackClient(bootstrap, onReport)
  }

  return {
    preload: async () => {
      await (await getClient()).preload()
    },
    count: async () => (await getClient()).count(),
    search: async query => (await getClient()).search(query.term),
    dispose: () => {
      disposed = true
      void client.peek()?.then(instance => instance.dispose())
      client.reset()
    },
  }

  async function createWorkerClient(
    workerUrl: string,
    bootstrap: ReturnType<SearchServiceOptions['getBootstrap']>,
    onReport: SearchReportListener,
  ): Promise<SearchClient | null> {
    if (disposed || typeof Worker === 'undefined')
      return null

    const [worker] = catchError(() => new Worker(new URL(workerUrl, window.location.origin), { type: 'module' }))
    if (!worker)
      return null

    try {
      const { proxy, wrap } = await import('comlink')
      const remote = wrap<SearchWorkerApi>(worker)
      await remote.initialize(bootstrap, proxy(onReport))

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
  let primaryDisposed = false
  const fallback = createSingleFlight(createFallback)

  async function getFallback(error: unknown): Promise<SearchClient> {
    if (!primaryDisposed) {
      primary.dispose()
      primaryDisposed = true
    }
    // eslint-disable-next-line no-console
    console.warn('Search worker failed during a request; falling back to main thread search.', error)
    active = await fallback.run()
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
  onReport?: Parameters<typeof import('./mainThreadClient.ts')['createMainThreadClient']>[1],
): Promise<SearchClient> {
  const { createMainThreadClient } = await import('./mainThreadClient.ts')
  return createMainThreadClient(bootstrap, onReport)
}
