import type { RouteModel } from 'app/hooks/index.ts'
import type {
  SearchResponse,
  SearchResultRecord,
  SearchService,
} from '../types.ts'
import { computed, effectScope, ref, shallowRef } from '@vue/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { createSearchSnapshotStore } from '../page/snapshotStore.ts'
import { useSearch } from './useSearch.ts'

describe('useSearch', () => {
  it('rejects stale responses and derives tags from the visible page', async () => {
    const first = deferred<SearchResponse>()
    const second = deferred<SearchResponse>()
    const route = createRoute()
    const service: SearchService = {
      preload: vi.fn(async () => {}),
      count: vi.fn(async () => 0),
      search: vi.fn(query => query.term === 'first' ? first.promise : second.promise),
      dispose: vi.fn(),
    }

    const scope = effectScope()
    const model = scope.run(() => useSearch(
      route,
      service,
      createSearchSnapshotStore(),
    ))
    if (!model)
      throw new Error('Search scope failed to initialize')

    model.setTerm('first')
    model.setTerm('second')

    second.resolve({
      records: Array.from({ length: 13 }, (_, index) => (
        makeRecord(index, index === 12 ? 'page-two' : 'page-one')
      )),
    })
    await flushPromises()

    first.resolve({
      records: [makeRecord(99, 'stale')],
    })
    await flushPromises()

    expect(model.state.value).toMatchObject({
      phase: 'ready',
      query: { term: 'second', page: 1 },
    })
    expect(model.relatedTags.value.map(tag => tag.name)).toEqual(['page-one'])

    model.setPage(2)
    expect(model.results.value).toHaveLength(1)
    expect(model.relatedTags.value.map(tag => tag.name)).toEqual(['page-two'])

    scope.stop()
  })
})

function createRoute(): RouteModel {
  const current = shallowRef(toLocation('https://example.test/search'))
  const navigationKind = ref<RouteModel['navigationKind']['value']>('initial')

  return {
    current,
    navigationKind,
    isNavigating: ref(false),
    isSearchPage: computed(() => true),
    preload: vi.fn(),
    navigate: vi.fn(),
    replace: (href) => {
      navigationKind.value = 'replace'
      current.value = toLocation(new URL(href, current.value.href).href)
    },
    back: vi.fn(),
  }
}

function toLocation(href: string) {
  const url = new URL(href)
  return {
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  }
}

function makeRecord(index: number, tag: string): SearchResultRecord {
  return {
    url: `/article-${index}`,
    path: `/article-${index}`,
    title: `Article ${index}`,
    description: '',
    subtitle: '',
    coverSrc: '',
    coverAlt: '',
    publishDateValue: '',
    body: '',
    date: '',
    slug: `article-${index}`,
    authorName: '',
    authorHref: '',
    tags: [{ name: tag, href: `/tags/${tag}` }],
    searchRank: index,
    searchScore: index,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
