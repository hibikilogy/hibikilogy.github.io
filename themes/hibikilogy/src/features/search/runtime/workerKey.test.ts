// @vitest-environment node

import type {
  SearchEngine,
  SearchWorkerApi,
} from '../types.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('comlink', () => ({ expose: vi.fn() }))
vi.mock('./index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index.ts')>()
  return { ...actual, buildSearchEngine: vi.fn() }
})

beforeEach(() => {
  vi.resetModules()
})

describe('search worker initialize key', () => {
  it('reuses one engine build when only inline metadata presence differs', async () => {
    const { buildSearchEngine } = await import('./index.ts')
    const buildMock = vi.mocked(buildSearchEngine)
    buildMock.mockResolvedValue({ records: [] } as unknown as SearchEngine)

    const api = await importWorkerApi()
    const bootstrap = {
      indexUrl: '/search_index.zh.json',
      articlesDataUrl: '/search-articles/',
      tagsDataUrl: '/search-tags/',
    }

    await api.initialize({
      ...bootstrap,
      articleMetadataIndex: { '/articles/example/': { s: 'Subtitle' } },
      tagIndex: [{ name: 'tag', href: '/tags/tag/' }],
    })
    await api.initialize({ ...bootstrap })

    expect(buildMock).toHaveBeenCalledTimes(1)
  })
})

async function importWorkerApi(): Promise<SearchWorkerApi> {
  const { expose } = await import('comlink')
  const exposeMock = vi.mocked(expose)
  await import('../../../search/worker.ts')

  const api = exposeMock.mock.calls.at(-1)?.[0]
  if (!api)
    throw new Error('Search worker api was not exposed')
  return api as SearchWorkerApi
}
