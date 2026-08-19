import type { RouteModel } from 'app/hooks/index.ts'
import type { SearchSnapshotStore } from '../page/types.ts'
import type {
  SearchModel,
  SearchPageState,
  SearchQuery,
  SearchResponse,
  SearchService,
  SearchSort,
} from '../types.ts'
import {
  computed,
  onScopeDispose,
  shallowRef,
  watch,
} from '@vue/reactivity'
import { catchAsyncError } from 'shared/result.ts'
import { SEARCH_PAGE_SIZE } from '../config.ts'
import { aggregateResultTags } from '../core/tags.ts'
import {
  buildSearchHref,
  getSearchLocationKey,
  parseSearchLocation,
} from '../page/searchLocation.ts'
import { getSearchTitle } from '../utils.ts'

export function useSearch(
  route: RouteModel,
  service: SearchService,
  snapshots: SearchSnapshotStore,
): SearchModel {
  const initialQuery = parseSearchLocation(route.current.value.href)
  const state = shallowRef<SearchPageState>({
    phase: 'idle',
    query: initialQuery,
  })
  let requestId = 0

  const results = computed(() => {
    if (state.value.phase !== 'ready')
      return []

    const records = [...state.value.response.records]
    if (state.value.query.sort === 'title') {
      records.sort((left, right) => (
        getSearchTitle(left).localeCompare(getSearchTitle(right), 'zh-Hans-CN')
      ))
    }
    else {
      records.sort((left, right) => (
        left.searchScore - right.searchScore || left.searchRank - right.searchRank
      ))
    }

    const offset = (state.value.query.page - 1) * SEARCH_PAGE_SIZE
    return records.slice(offset, offset + SEARCH_PAGE_SIZE)
  })

  const relatedTags = computed(() => aggregateResultTags(results.value))
  const pagination = computed(() => {
    const totalRecords = state.value.phase === 'ready'
      ? state.value.response.records.length
      : 0
    return {
      currentPage: state.value.query.page,
      totalPages: Math.max(1, Math.ceil(totalRecords / SEARCH_PAGE_SIZE)),
      totalRecords,
    }
  })

  const stopRouteWatch = watch(
    () => route.current.value.href,
    (href) => {
      void synchronize(parseSearchLocation(href), href)
    },
    { immediate: true },
  )
  onScopeDispose(stopRouteWatch)

  async function synchronize(query: SearchQuery, href: string): Promise<void> {
    const activeRequest = ++requestId
    const current = state.value

    if (!query.term) {
      state.value = { phase: 'idle', query }
      const [count] = await catchAsyncError(() => service.count())
      if (activeRequest === requestId) {
        state.value = count === undefined ? { phase: 'idle', query } : { phase: 'idle', query, count }
      }
      return
    }

    if (
      current.phase === 'ready'
      && current.query.term === query.term
    ) {
      commitReady(query, current.response, href)
      return
    }

    const snapshot = route.navigationKind.value === 'popstate'
      ? snapshots.match(getSearchLocationKey(href))
      : null
    if (snapshot) {
      commitReady(query, snapshot.response, href)
      return
    }

    state.value = { phase: 'loading', query, requestId: activeRequest }
    const [response, error] = await catchAsyncError(() => service.search(query))
    if (activeRequest !== requestId)
      return
    if (error) {
      state.value = {
        phase: 'error',
        query,
        error,
      }
      return
    }
    commitReady(query, response, href)
  }

  function commitReady(query: SearchQuery, response: SearchResponse, href: string): void {
    state.value = { phase: 'ready', query, response }
    snapshots.commit({
      key: getSearchLocationKey(href),
      query,
      response,
    })
  }

  function commitQuery(query: SearchQuery): void {
    route.replace(buildSearchHref(route.current.value.href, query))
  }

  function setTerm(term: string): void {
    commitQuery({ term: term.trim(), page: 1, sort: state.value.query.sort })
  }

  function setSort(sort: SearchSort): void {
    commitQuery({ ...state.value.query, sort, page: 1 })
  }

  function setPage(page: number): void {
    const totalPages = pagination.value.totalPages
    commitQuery({
      ...state.value.query,
      page: Math.min(Math.max(page, 1), totalPages),
    })
  }

  return {
    state,
    results,
    relatedTags,
    pagination,
    setTerm,
    setSort,
    setPage,
  }
}
