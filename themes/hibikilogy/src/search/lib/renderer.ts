import type { SearchJournalMotion } from './motion.ts'
import type { SearchTimingPhase } from './types.ts'
import { buildSearchArticle, getSearchHighlightTerms, getSearchTitle } from './article.ts'
import { searchPageSize } from './config.ts'
import { getDurationMs, measureSearchPhase, nowMs } from './debug.ts'
import type { SearchHistory } from './history.ts'
import { transitionSearchJournalResults } from './motion.ts'
import { renderSearchPagination } from './pagination.ts'
import { renderSearchRelatedTags } from './related-tags.ts'
import type { SearchState } from './search-state.ts'
import type { SearchSnapshotStore, SearchResultSnapshot } from './snapshot-store.ts'

export interface SearchRenderer {
  /** Render the current `state.records` for the supplied page. */
  renderPage: (page: number, searchId: number, motionOverride?: SearchJournalMotion | null, phases?: SearchTimingPhase[] | null) => Promise<boolean | undefined>
  /** Render results for an interactive (user-initiated) page change. */
  renderInteractive: (page: number, motionOverride?: SearchJournalMotion | null) => Promise<void>
  /** Clear results DOM, optionally through the journal motion. */
  clear: (immediate: boolean) => Promise<void>
  /** Restore a previously committed snapshot without going through search. */
  renderSnapshot: (snapshot: SearchResultSnapshot, page: number, searchId: number) => Promise<boolean | undefined>
  /** Toggle the `aria-busy` flag on the result container. */
  setBusy: (busy: boolean) => void
  /** Hide/show pagination controls based on result count. */
  setControlsVisible: (resultCount: number) => void
}

export function createSearchRenderer(opts: {
  state: SearchState
  snapshot: SearchSnapshotStore
  history: SearchHistory
}): SearchRenderer {
  const { state, snapshot, history } = opts

  const getSortedRecords = () => {
    const records = [...state.records]
    if (state.currentSort === 'title') {
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

  const resolveSearchJournalMotion = (
    nextPage: number,
    previousPage: number,
    motionOverride: SearchJournalMotion | null,
  ): SearchJournalMotion => {
    if (motionOverride)
      return motionOverride
    if (nextPage > previousPage)
      return 'forward'
    if (nextPage < previousPage)
      return 'backward'
    return 'replace'
  }

  const isStaleRequest = (searchId: number): boolean => searchId !== state.activeSearchId

  const measureOptionalPhase = <T>(
    phases: SearchTimingPhase[] | null,
    label: string,
    operation: () => Promise<T> | T,
    metadata?: Record<string, unknown>,
  ): Promise<T> => {
    if (!phases)
      return Promise.resolve(operation())
    return measureSearchPhase(phases, label, operation, metadata)
  }

  const refreshSearchWaterfall = async (): Promise<void> => {
    const refreshResult = window.refreshWaterFalls?.()
    if (refreshResult?.then)
      await refreshResult
  }

  const getSearchJournal = (): HTMLElement | null =>
    document.querySelector<HTMLElement>('.SearchJournal')

  const setBusy = (busy: boolean): void => {
    document.querySelector<HTMLElement>('#search-results')
      ?.setAttribute('aria-busy', String(busy))
  }

  const setControlsVisible = (resultCount: number): void => {
    const controls = document.querySelector<HTMLElement>('#search-pagination')
    const pagination = document.querySelector<HTMLElement>('site-pagination#search-page-control')
    const hasMultiplePages = resultCount > searchPageSize

    if (controls)
      controls.hidden = !hasMultiplePages
    if (pagination)
      pagination.hidden = !hasMultiplePages
  }

  const clear = async (immediate: boolean): Promise<void> => {
    const clearDom = async (): Promise<void> => {
      document.querySelector<HTMLElement>('#search-results')?.replaceChildren()
      if (!immediate)
        await refreshSearchWaterfall()
    }

    if (immediate) {
      await clearDom()
      return
    }
    await transitionSearchJournalResults(getSearchJournal(), 'replace', clearDom)
  }

  const renderPage = async (
    page: number,
    searchId = state.activeSearchId,
    motionOverride: SearchJournalMotion | null = null,
    phases: SearchTimingPhase[] | null = null,
  ): Promise<boolean | undefined> => {
    const resultsContainer = document.querySelector<HTMLElement>('#search-results')
    const searchJournal = getSearchJournal()
    const totalPages = Math.max(1, Math.ceil(state.records.length / searchPageSize))
    const nextPage = Math.min(Math.max(page, 1), totalPages)
    const previousPage = state.currentPage
    const sortStart = nowMs()
    const records = getSortedRecords()
    const pageRecords = records.slice((nextPage - 1) * searchPageSize, nextPage * searchPageSize)
    const highlightTerms = getSearchHighlightTerms(state.currentTerm)
    phases?.push({
      label: 'sort and paginate results',
      durationMs: getDurationMs(sortStart),
      metadata: { pageRecords: pageRecords.length, totalRecords: records.length },
    })
    const motion = resolveSearchJournalMotion(nextPage, previousPage, motionOverride)
    const viewSort = state.currentSort
    const isStaleView = () =>
      isStaleRequest(searchId) || nextPage !== state.currentPage || viewSort !== state.currentSort

    state.currentPage = nextPage
    const articles = await measureOptionalPhase(
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

      setControlsVisible(state.records.length)
      renderSearchPagination({
        currentPage: state.currentPage,
        totalPages,
        getHref: history.buildHref,
        onPageChange: (pageNumber) => {
          void renderInteractive(pageNumber)
        },
      })
      history.replace(state.currentTerm, nextPage)
      await measureOptionalPhase(phases, 'waterfall layout', refreshSearchWaterfall)
      await measureOptionalPhase(
        phases,
        'render related tags',
        () => renderSearchRelatedTags(pageRecords, isStaleView),
        { pageRecords: pageRecords.length },
      )
    }
    const didTransitionResults = await transitionSearchJournalResults(searchJournal, motion, updateResults)
    phases?.push({
      label: 'result transition total',
      durationMs: getDurationMs(transitionStart),
      metadata: { motion },
    })
    if (!didTransitionResults || isStaleView())
      return false

    snapshot.commit({
      term: state.currentTerm,
      sort: state.currentSort,
      records: [...state.records],
    })
    return true
  }

  const renderInteractive = async (
    page: number,
    motionOverride: SearchJournalMotion | null = null,
  ): Promise<void> => {
    const viewId = ++state.activeSearchId
    setBusy(true)
    try {
      await renderPage(page, viewId, motionOverride)
    }
    finally {
      if (!isStaleRequest(viewId))
        setBusy(false)
    }
  }

  const renderSnapshot = async (
    snapshotToRestore: SearchResultSnapshot,
    page: number,
    searchId: number,
  ): Promise<boolean | undefined> => {
    state.currentTerm = snapshotToRestore.term
    state.currentPage = page
    state.currentSort = snapshotToRestore.sort
    state.records = [...snapshotToRestore.records]
    setBusy(true)
    try {
      return await renderPage(page, searchId, 'replace', null)
    }
    finally {
      if (!isStaleRequest(searchId))
        setBusy(false)
    }
  }

  return {
    renderPage,
    renderInteractive,
    clear,
    renderSnapshot,
    setBusy,
    setControlsVisible,
  }
}