import type { SearchJournalMotion } from './motion.ts'
import type { SearchIndexBuildStatus, SearchResultRecord } from './types.ts'
import { normalizePageNumber } from '../../components/site-pagination/utils.ts'
import { focusCurrentSearchInput } from '../ui/utils.ts'
import {
  buildSearchArticle,
  getSearchTitle,
} from './article.ts'
import {
  searchFocusIntentKey,
  searchMessages,
  searchPageSize,
} from './config.ts'
import {
  getSearchRecordCount,
  preloadSearch,
  searchIndexStatusEventName,
  searchRecords,
} from './index.ts'
import { resolveSearchLoadingMessage } from './loading-message.ts'
import { transitionSearchJournalResults, updateSearchMessage } from './motion.ts'
import { renderSearchPagination } from './pagination.ts'
import { createResettablePreloadTask } from './preload.ts'
import {
  renderSearchRelatedTags,
  setSearchRelatedTags,
} from './related-tags.ts'

const searchState: {
  records: SearchResultRecord[]
  currentTerm: string
  currentPage: number
  currentSort: string
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

function triggerPreload(): void {
  const pendingPreload = indexPreload.current() || indexPreload.trigger()
  void pendingPreload.catch(() => {})
}

export function initSearchPage(): void {
  const pageRoot = document.querySelector<HTMLElement>('#search')
  if (!pageRoot) {
    disposeSearchPage()
    return
  }

  if (activeSearchPage === pageRoot)
    return

  disposeSearchPage()
  activeSearchPage = pageRoot

  const input = document.querySelector<HTMLInputElement>('#search-input')
  const form = document.querySelector<HTMLFormElement>('.SearchShell--page')
  const clearButton = document.querySelector<HTMLButtonElement>('#search-clear')
  const sorting = document.querySelector<HTMLSelectElement>('#search-sorting')

  const handleFormSubmit = (event: Event): void => {
    event.preventDefault()
    void runSearch(input?.value.trim() || '', 1)
  }

  const handleInput = (): void => {
    if (!input)
      return
    if (clearButton)
      clearButton.hidden = !input.value
    triggerPreload()
  }

  const handleClear = (): void => {
    if (!input || !clearButton)
      return
    input.value = ''
    clearButton.hidden = true
    void runSearch('', 1)
    input.focus()
  }

  const handleSortChange = (): void => {
    if (!sorting)
      return
    searchState.currentSort = sorting.value
    void renderSearchPage(1, searchState.activeSearchId, 'replace')
  }

  window.addEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
  form?.addEventListener('submit', handleFormSubmit)
  input?.addEventListener('input', handleInput)
  clearButton?.addEventListener('click', handleClear)
  sorting?.addEventListener('change', handleSortChange)

  cleanupSearchPage = () => {
    window.removeEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
    form?.removeEventListener('submit', handleFormSubmit)
    input?.removeEventListener('input', handleInput)
    clearButton?.removeEventListener('click', handleClear)
    sorting?.removeEventListener('change', handleSortChange)
    cleanupSearchPage = null
    activeSearchPage = null
  }

  searchState.currentTerm = ''
  searchState.currentPage = 1
  searchState.records = []
  searchState.currentSort = sorting?.value || 'relevance'

  const params = new URLSearchParams(window.location.search)
  const term = params.get('q')
  const pageNumber = normalizePageNumber(params.get('p'))
  const shouldFocusInput = consumeSearchFocusIntent() || !term

  if (term && input) {
    input.value = term
    if (clearButton)
      clearButton.hidden = false
    void runSearch(term, pageNumber)
  }
  else {
    if (input)
      input.value = ''
    if (clearButton)
      clearButton.hidden = true
    setSearchPaginationVisible(false)
    setSearchRelatedTags([])
  }

  if (shouldFocusInput) {
    focusCurrentSearchInput()
  }

  triggerPreload()
  if (!term) {
    void updateIdleSearchMessage()
  }
}

export function disposeSearchPage(): void {
  searchState.activeSearchId += 1
  cleanupSearchPage?.()
}

async function updateIdleSearchMessage(): Promise<void> {
  const message = document.querySelector<HTMLElement>('#search-message')
  if (!message || searchState.currentTerm)
    return

  try {
    const pendingPreload = indexPreload.current()
    if (pendingPreload) {
      await updateSearchMessage(message, getSearchIndexLoadingMessage(), { loading: true })
      await pendingPreload
      if (searchState.currentTerm)
        return
    }
    const count = await getSearchRecordCount()
    if (searchState.currentTerm)
      return
    await updateSearchMessage(message, getIdleSearchMessage(count))
  }
  catch {
    if (!searchState.currentTerm) {
      await updateSearchMessage(message, '')
    }
  }
}

async function runSearch(term: string, page: number): Promise<void> {
  const searchId = ++searchState.activeSearchId
  const message = document.querySelector<HTMLElement>('#search-message')

  searchState.currentTerm = term
  searchState.currentPage = page
  searchState.records = []

  setSearchPaginationVisible(false)
  setSearchRelatedTags([])
  await transitionSearchJournalResults(getSearchJournal(), 'replace', async () => {
    document.querySelector<HTMLElement>('#search-results')?.replaceChildren()
    await refreshSearchWaterfall()
  })
  updateSearchUrl(term, page)

  if (!term) {
    await updateIdleSearchMessage()
    return
  }

  if (message) {
    const pendingPreload = indexPreload.current()
    if (pendingPreload) {
      void updateSearchMessage(message, searchMessages.indexLoading, { loading: true })
      await pendingPreload
      if (searchId !== searchState.activeSearchId)
        return
    }
    void updateSearchMessage(message, searchMessages.loading(term), { loading: true })
  }

  try {
    searchState.records = await searchRecords(term)
    if (searchId !== searchState.activeSearchId)
      return

    if (message) {
      void updateSearchMessage(message, getResultMessage(term, searchState.records.length))
    }

    await renderSearchPage(page, searchId, 'replace')
  }
  catch (error) {
    if (searchId !== searchState.activeSearchId)
      return
    if (message) {
      void updateSearchMessage(message, getSearchFailureMessage(error))
    }
    console.error(error)
  }
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
): Promise<boolean | undefined> {
  const resultsContainer = document.querySelector<HTMLElement>('#search-results')
  const searchJournal = getSearchJournal()
  const totalPages = Math.max(1, Math.ceil(searchState.records.length / searchPageSize))
  const nextPage = Math.min(Math.max(page, 1), totalPages)
  const previousPage = searchState.currentPage
  const records = getSortedSearchRecords()
  const pageRecords = records.slice((nextPage - 1) * searchPageSize, nextPage * searchPageSize)
  const motion = resolveSearchJournalMotion(nextPage, previousPage, motionOverride)
  const viewSort = searchState.currentSort
  const isStaleView = () => isSearchViewStale(searchId, nextPage, viewSort)

  searchState.currentPage = nextPage
  const articles = await Promise.all(pageRecords.map(result => buildSearchArticle(result)))
  if (isStaleView())
    return undefined

  const didTransitionResults = await transitionSearchJournalResults(searchJournal, motion, async () => {
    resultsContainer?.replaceChildren(...articles)
    if (isStaleView())
      return

    setSearchPaginationVisible(searchState.records.length > searchPageSize)
    renderSearchPagination({
      currentPage: searchState.currentPage,
      totalPages,
      getHref: getSearchPageHref,
      onPageChange: (pageNumber) => {
        void renderSearchPage(pageNumber)
      },
    })
    updateSearchUrl(searchState.currentTerm, nextPage)
    await refreshSearchWaterfall()
    await renderSearchRelatedTags(pageRecords, isStaleView)
  })
  if (!didTransitionResults || isStaleView())
    return false

  return true
}

function isSearchViewStale(searchId: number, page: number, sort: string): boolean {
  return searchId !== searchState.activeSearchId
    || page !== searchState.currentPage
    || sort !== searchState.currentSort
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
  window.history.replaceState(window.history.state, '', url)
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
  }
  else {
    url.searchParams.delete('q')
    url.searchParams.delete('p')
  }
}

function setSearchPaginationVisible(isVisible: boolean): void {
  const pagination = document.querySelector<HTMLElement>('#search-pagination')
  if (pagination) {
    pagination.hidden = !isVisible
  }
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
