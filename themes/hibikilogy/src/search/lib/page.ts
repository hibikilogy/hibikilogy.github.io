import type { SearchJournalMotion } from './motion.ts'
import type { SearchIndexBuildStatus, SearchResultRecord, SearchTimingPhase } from './types.ts'
import { normalizePageNumber } from '../../../components/site-pagination/utils.ts'
import { focusCurrentSearchInput } from '../../ui/utils.ts'
import {
  buildSearchArticle,
  getSearchHighlightTerms,
  getSearchTitle,
} from './article.ts'
import {
  searchFocusIntentKey,
  searchMessages,
  searchPageSize,
} from './config.ts'
import {
  getDurationMs,
  isSearchDebugEnabled,
  logSearchRuntimeReport,
  measureSearchPhase,
  nowMs,
} from './debug.ts'
import {
  getSearchRecordCount,
  preloadSearch,
  searchIndexStatusEventName,
  searchRecordsWithTiming,
} from './index.ts'
import { resolveSearchLoadingMessage } from './loading-message.ts'
import { transitionSearchJournalResults, updateSearchMessage } from './motion.ts'
import { renderSearchPagination } from './pagination.ts'
import { createResettablePreloadTask } from './preload.ts'
import { parseSearchQuery } from './query.ts'
import {
  renderSearchRelatedTags,
  setSearchRelatedTags,
} from './related-tags.ts'
import {
  createSearchSnapshotStore,
  type SearchResultSnapshot,
  type SearchSort,
} from './snapshot-store.ts'

interface SearchPageInitOptions {
  restoreFromHistory?: boolean
  replaceHistoryUrl?: (url: string) => void
}

const searchState: {
  records: SearchResultRecord[]
  currentTerm: string
  currentPage: number
  currentSort: SearchSort
  activeSearchId: number
} = {
  records: [],
  currentTerm: '',
  currentPage: 1,
  currentSort: 'relevance',
  activeSearchId: 0,
}

const indexPreload = createResettablePreloadTask(preloadSearch)
let currentIndexStatus: SearchIndexBuildStatus = 'cache-read'
let activeSearchPage: HTMLElement | null = null
let cleanupSearchPage: (() => void) | null = null
const snapshotStore = createSearchSnapshotStore()
let replaceSearchHistoryUrl: ((url: string) => void) | null = null

function triggerPreload(): void {
  const pendingPreload = indexPreload.current() || indexPreload.trigger()
  void pendingPreload.catch(() => {})
}

export async function initSearchPage(options: SearchPageInitOptions = {}): Promise<void> {
  const pageRoot = document.querySelector<HTMLElement>('#search')
  if (!pageRoot) {
    disposeSearchPage()
    return
  }

  if (activeSearchPage === pageRoot)
    return

  disposeSearchPage()
  activeSearchPage = pageRoot
  replaceSearchHistoryUrl = options.replaceHistoryUrl || null

  const input = document.querySelector<HTMLInputElement>('#search-input')
  const form = document.querySelector<HTMLFormElement>('.SearchShell--page')
  const sorting = document.querySelector<HTMLSelectElement>('#search-sorting')

  const handleFormSubmit = (event: Event): void => {
    event.preventDefault()
    void runSearch(input?.value.trim() || '', 1)
  }

  const handleInput = (): void => {
    if (!input)
      return
    triggerPreload()
  }

  const handleSortChange = (): void => {
    if (!sorting)
      return
    searchState.currentSort = normalizeSearchSort(sorting.value)
    void renderInteractiveSearchPage(1, 'replace')
  }

  window.addEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
  form?.addEventListener('submit', handleFormSubmit)
  input?.addEventListener('input', handleInput)
  sorting?.addEventListener('change', handleSortChange)

  cleanupSearchPage = () => {
    window.removeEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
    form?.removeEventListener('submit', handleFormSubmit)
    input?.removeEventListener('input', handleInput)
    sorting?.removeEventListener('change', handleSortChange)
    cleanupSearchPage = null
    activeSearchPage = null
  }

  const params = new URLSearchParams(window.location.search)
  const term = params.get('q')?.trim() || ''
  const pageNumber = normalizePageNumber(params.get('p'))
  const sort = normalizeSearchSort(params.get('sort'))
  const shouldFocusInput = consumeSearchFocusIntent() || !term
  const snapshot = options.restoreFromHistory
    ? snapshotStore.match(term, sort)
    : null

  searchState.currentSort = sort
  if (sorting)
    sorting.value = sort

  if (term && input) {
    input.value = term
    if (snapshot) {
      await restoreSearchSnapshot(snapshot, pageNumber)
    }
    else {
      resetSearchState()
      searchState.currentSort = sort
      void runSearch(term, pageNumber)
    }
  }
  else {
    resetSearchState()
    searchState.currentSort = sort
    if (input)
      input.value = ''
    setSearchControlsVisible(0)
    setSearchRelatedTags([])
  }

  if (shouldFocusInput) {
    focusCurrentSearchInput()
  }

  triggerPreload()
  if (!term) {
    void updateIdleSearchMessage(searchState.activeSearchId)
  }
}

export function disposeSearchPage(): void {
  searchState.activeSearchId += 1
  snapshotStore.clear()
  cleanupSearchPage?.()
}

async function updateIdleSearchMessage(searchId: number): Promise<void> {
  const message = document.querySelector<HTMLElement>('#search-message')
  if (!message || isSearchRequestStale(searchId) || searchState.currentTerm)
    return

  try {
    const pendingPreload = indexPreload.current()
    if (pendingPreload) {
      await updateSearchMessage(message, getSearchIndexLoadingMessage(), { loading: true })
      await pendingPreload
      if (isSearchRequestStale(searchId) || searchState.currentTerm)
        return
    }
    const count = await getSearchRecordCount()
    if (isSearchRequestStale(searchId) || searchState.currentTerm)
      return
    await updateSearchMessage(message, getIdleSearchMessage(count))
  }
  catch {
    if (!isSearchRequestStale(searchId) && !searchState.currentTerm) {
      await updateSearchMessage(message, '')
    }
  }
}

async function runSearch(term: string, page: number): Promise<void> {
  const searchId = ++searchState.activeSearchId
  const message = document.querySelector<HTMLElement>('#search-message')
  const phases: SearchTimingPhase[] = []
  const runtimeStart = nowMs()
  const parsedQuery = parseSearchQuery(term)

  searchState.currentTerm = term
  searchState.currentPage = page
  searchState.records = []
  setSearchResultsBusy(true)

  let runtimeStatus: 'success' | 'failed' = 'success'

  try {
    setSearchControlsVisible(0)
    setSearchRelatedTags([])
    await measureSearchPhase(
      phases,
      'clear previous results',
      () => clearSearchResults(Boolean(term)),
      { immediate: Boolean(term) },
    )
    if (isSearchRequestStale(searchId))
      return
    updateSearchUrl(term, page)

    if (!term) {
      await updateIdleSearchMessage(searchId)
      return
    }

    if (message) {
      const pendingPreload = indexPreload.current()
      if (pendingPreload) {
        void updateSearchMessage(message, searchMessages.indexLoading, { loading: true })
        await measureSearchPhase(phases, 'wait for index readiness', () => pendingPreload)
        if (isSearchRequestStale(searchId))
          return
      }
      void updateSearchMessage(message, searchMessages.loading(term), { loading: true })
    }

    const searchExecution = await measureSearchPhase(
      phases,
      'search client round trip',
      () => searchRecordsWithTiming(term),
    )
    if (isSearchRequestStale(searchId))
      return
    const roundTripPhase = phases.at(-1)
    if (roundTripPhase) {
      roundTripPhase.metadata = {
        transportOverheadMs: Math.max(
          0,
          Math.round((roundTripPhase.durationMs - searchExecution.engineDurationMs) * 10) / 10,
        ),
      }
    }
    phases.push({ label: 'search engine execution', durationMs: searchExecution.engineDurationMs })
    searchState.records = searchExecution.records

    if (message) {
      void updateSearchMessage(message, getResultMessage(term, searchState.records.length))
    }

    await renderSearchPage(page, searchId, 'replace', phases)
  }
  catch (error) {
    runtimeStatus = 'failed'
    if (isSearchRequestStale(searchId))
      return
    if (message) {
      void updateSearchMessage(message, getSearchFailureMessage(error))
    }
    console.error(error)
  }
  finally {
    if (!isSearchRequestStale(searchId)) {
      setSearchResultsBusy(false)
      if (term) {
        logSearchRuntimeReport(isSearchDebugEnabled(), {
          status: runtimeStatus,
          totalDurationMs: getDurationMs(runtimeStart),
          termLength: term.length,
          queryMode: parsedQuery.mode,
          clauseCount: parsedQuery.clauses.length,
          fieldClauseCount: parsedQuery.clauses.filter(clause => (
            clause.type === 'field' || (clause.type === 'not' && clause.clause.type === 'field')
          )).length,
          negativeClauseCount: parsedQuery.clauses.filter(clause => clause.type === 'not').length,
          resultCount: searchState.records.length,
          page: searchState.currentPage,
          phases,
        })
      }
    }
  }
}

async function restoreSearchSnapshot(
  snapshot: SearchResultSnapshot,
  page: number,
): Promise<void> {
  const searchId = ++searchState.activeSearchId
  const message = document.querySelector<HTMLElement>('#search-message')

  searchState.currentTerm = snapshot.term
  searchState.currentPage = page
  searchState.currentSort = snapshot.sort
  searchState.records = [...snapshot.records]
  setSearchResultsBusy(true)

  if (message) {
    message.classList.remove('loading-dots')
    message.textContent = getResultMessage(snapshot.term, snapshot.records.length)
  }

  try {
    await renderSearchPage(page, searchId, 'replace', null, true)
  }
  finally {
    if (!isSearchRequestStale(searchId))
      setSearchResultsBusy(false)
  }
}

async function clearSearchResults(immediate: boolean): Promise<void> {
  const clear = async (): Promise<void> => {
    document.querySelector<HTMLElement>('#search-results')?.replaceChildren()
    if (!immediate)
      await refreshSearchWaterfall()
  }

  if (immediate) {
    await clear()
    return
  }

  await transitionSearchJournalResults(getSearchJournal(), 'replace', clear)
}

function handleSearchIndexStatus(event: Event): void {
  const status = (event as CustomEvent<SearchIndexBuildStatus>).detail
  if (!status)
    return

  currentIndexStatus = status
  if (status === 'ready')
    return
  if (!searchState.currentTerm)
    return

  const message = document.querySelector<HTMLElement>('#search-message')
  if (!message || !indexPreload.current())
    return

  void updateSearchMessage(message, getSearchIndexLoadingMessage(status), { loading: true })
}

async function renderSearchPage(
  page: number,
  searchId = searchState.activeSearchId,
  motionOverride: SearchJournalMotion | null = null,
  phases: SearchTimingPhase[] | null = null,
  restoreImmediately = false,
): Promise<boolean | undefined> {
  const resultsContainer = document.querySelector<HTMLElement>('#search-results')
  const searchJournal = getSearchJournal()
  const totalPages = Math.max(1, Math.ceil(searchState.records.length / searchPageSize))
  const nextPage = Math.min(Math.max(page, 1), totalPages)
  const previousPage = searchState.currentPage
  const sortStart = nowMs()
  const records = getSortedSearchRecords()
  const pageRecords = records.slice((nextPage - 1) * searchPageSize, nextPage * searchPageSize)
  const highlightTerms = getSearchHighlightTerms(searchState.currentTerm)
  phases?.push({
    label: 'sort and paginate results',
    durationMs: getDurationMs(sortStart),
    metadata: { pageRecords: pageRecords.length, totalRecords: records.length },
  })
  const motion = resolveSearchJournalMotion(nextPage, previousPage, motionOverride)
  const viewSort = searchState.currentSort
  const isStaleView = () => isSearchViewStale(searchId, nextPage, viewSort)

  searchState.currentPage = nextPage
  const articles = await measureOptionalSearchPhase(
    phases,
    'build result DOM',
    () => Promise.all(pageRecords.map(result => buildSearchArticle(result, highlightTerms))),
    { articles: pageRecords.length, highlightTerms: highlightTerms.length },
  )
  if (isStaleView())
    return undefined

  const transitionStart = nowMs()
  const updateResults = async (): Promise<void> => {
    const replaceStart = nowMs()
    resultsContainer?.replaceChildren(...articles)
    phases?.push({ label: 'replace result DOM', durationMs: getDurationMs(replaceStart) })
    if (isStaleView())
      return

    setSearchControlsVisible(searchState.records.length)
    renderSearchPagination({
      currentPage: searchState.currentPage,
      totalPages,
      getHref: getSearchPageHref,
      onPageChange: (pageNumber) => {
        void renderInteractiveSearchPage(pageNumber)
      },
    })
    updateSearchUrl(searchState.currentTerm, nextPage)
    await measureOptionalSearchPhase(phases, 'waterfall layout', refreshSearchWaterfall)
    await measureOptionalSearchPhase(
      phases,
      'render related tags',
      () => renderSearchRelatedTags(pageRecords, isStaleView),
      { pageRecords: pageRecords.length },
    )
  }
  const didTransitionResults = restoreImmediately
    ? await updateResults().then(() => true)
    : await transitionSearchJournalResults(searchJournal, motion, updateResults)
  phases?.push({
    label: 'result transition total',
    durationMs: getDurationMs(transitionStart),
    metadata: { motion },
  })
  if (!didTransitionResults || isStaleView())
    return false

  snapshotStore.commit({
    term: searchState.currentTerm,
    sort: searchState.currentSort,
    records: [...searchState.records],
  })
  return true
}

async function renderInteractiveSearchPage(
  page: number,
  motionOverride: SearchJournalMotion | null = null,
): Promise<void> {
  const viewId = ++searchState.activeSearchId
  setSearchResultsBusy(true)

  try {
    await renderSearchPage(page, viewId, motionOverride)
  }
  finally {
    if (!isSearchRequestStale(viewId))
      setSearchResultsBusy(false)
  }
}

function measureOptionalSearchPhase<T>(
  phases: SearchTimingPhase[] | null,
  label: string,
  operation: () => Promise<T> | T,
  metadata?: Record<string, unknown>,
): Promise<T> {
  if (!phases)
    return Promise.resolve(operation())
  return measureSearchPhase(phases, label, operation, metadata)
}

function isSearchViewStale(searchId: number, page: number, sort: SearchSort): boolean {
  return isSearchRequestStale(searchId)
    || page !== searchState.currentPage
    || sort !== searchState.currentSort
}

function isSearchRequestStale(searchId: number): boolean {
  return searchId !== searchState.activeSearchId
}

function resolveSearchJournalMotion(
  nextPage: number,
  previousPage: number,
  motionOverride: SearchJournalMotion | null,
): SearchJournalMotion {
  if (motionOverride)
    return motionOverride
  if (nextPage > previousPage)
    return 'forward'
  if (nextPage < previousPage)
    return 'backward'
  return 'replace'
}

function getSortedSearchRecords(): SearchResultRecord[] {
  const records = [...searchState.records]

  if (searchState.currentSort === 'title') {
    records.sort((a, b) => getSearchTitle(a).localeCompare(getSearchTitle(b), 'zh-Hans-CN'))
    return records
  }

  records.sort((a, b) => {
    if (a.searchScore !== b.searchScore)
      return a.searchScore - b.searchScore
    return a.searchRank - b.searchRank
  })
  return records
}

function getResultMessage(term: string, count: number): string {
  if (count === 0)
    return searchMessages.empty(term)
  return searchMessages.found(term, count)
}

function getIdleSearchMessage(count: number): string {
  return searchMessages.idle(count)
}

function getSearchIndexLoadingMessage(status = currentIndexStatus): string {
  return resolveSearchLoadingMessage({
    status,
    hasSearchTerm: Boolean(searchState.currentTerm),
    messages: searchMessages,
  })
}

function getSearchFailureMessage(error: unknown): string {
  if (!isSearchDebugEnabled())
    return searchMessages.failed

  const message = error instanceof Error ? error.message : String(error || '')
  return message ? searchMessages.failedWithError(message) : searchMessages.failed
}

function getSearchPageHref(page: number): string {
  const url = new URL(window.location.href)
  setSearchParams(url, searchState.currentTerm, page)
  return `${url.pathname}${url.search}${url.hash}`
}

function updateSearchUrl(term: string, page: number): void {
  const url = new URL(window.location.href)
  setSearchParams(url, term, page)
  const href = `${url.pathname}${url.search}${url.hash}`

  if (replaceSearchHistoryUrl) {
    replaceSearchHistoryUrl(href)
    return
  }

  const state = window.history.state && typeof window.history.state === 'object'
    ? { ...window.history.state, url: href }
    : window.history.state
  window.history.replaceState(state, '', href)
}

function setSearchParams(url: URL, term: string, page: number): void {
  if (term) {
    url.searchParams.set('q', term)
    if (page > 1) {
      url.searchParams.set('p', String(page))
    }
    else {
      url.searchParams.delete('p')
    }
    if (searchState.currentSort === 'title')
      url.searchParams.set('sort', 'title')
    else
      url.searchParams.delete('sort')
  }
  else {
    url.searchParams.delete('q')
    url.searchParams.delete('p')
    url.searchParams.delete('sort')
  }
}

function setSearchControlsVisible(resultCount: number): void {
  const controls = document.querySelector<HTMLElement>('#search-pagination')
  const pagination = document.querySelector<HTMLElement>('site-pagination#search-page-control')
  const hasMultiplePages = resultCount > searchPageSize

  if (controls)
    controls.hidden = !hasMultiplePages
  if (pagination)
    pagination.hidden = !hasMultiplePages
}

function setSearchResultsBusy(isBusy: boolean): void {
  document.querySelector<HTMLElement>('#search-results')
    ?.setAttribute('aria-busy', String(isBusy))
}

function normalizeSearchSort(value: string | null | undefined): SearchSort {
  return value === 'title' ? 'title' : 'relevance'
}

function resetSearchState(): void {
  searchState.currentTerm = ''
  searchState.currentPage = 1
  searchState.records = []
}

function getSearchJournal(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.SearchJournal')
}

function consumeSearchFocusIntent(): boolean {
  const intent = sessionStorage.getItem(searchFocusIntentKey)
  if (!intent)
    return false

  sessionStorage.removeItem(searchFocusIntentKey)
  return true
}

async function refreshSearchWaterfall(): Promise<void> {
  const refreshResult = window.refreshWaterFalls?.()

  if (refreshResult?.then) {
    await refreshResult
  }
}
