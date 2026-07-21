import type { SearchTimingPhase } from './types.ts'
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
  searchRecordsWithTiming,
} from './index.ts'
import { resolveSearchLoadingMessage } from './loading-message.ts'
import { updateSearchMessage } from './motion.ts'
import { parseSearchQuery } from './query.ts'
import type { SearchState } from './search-state.ts'
import { createResettablePreloadTask } from './preload.ts'
import { searchMessages } from './config.ts'
import type { SearchHistory } from './history.ts'
import type { SearchRenderer } from './renderer.ts'
import type { SearchResultSnapshot } from './snapshot-store.ts'
import { setSearchRelatedTags } from './related-tags.ts'

export interface SearchRunner {
  /** Execute a fresh search for `term`, writing records into state and rendering. */
  run: (term: string, page: number) => Promise<void>
  /** Restore a previously committed snapshot synchronously, skipping the search call. */
  restore: (snapshot: SearchResultSnapshot, page: number) => Promise<void>
  /** Invalidate the in-flight search (id++), causing stale work to self-cancel. */
  cancel: () => void
  /** Refresh idle-message UI when the index becomes ready and no term is active. */
  updateIdleMessage: () => Promise<void>
  /** Re-render using the current records (e.g. after sort change). */
  renderInteractivePage: (page: number, motionOverride?: 'forward' | 'backward' | 'replace' | null) => Promise<void>
}

export function createSearchRunner(opts: {
  state: SearchState
  renderer: SearchRenderer
  history: SearchHistory
}): SearchRunner {
  const { state, renderer, history } = opts
  const indexPreload = createResettablePreloadTask(preloadSearch)

  const isStaleRequest = (searchId: number): boolean => searchId !== state.activeSearchId

  const getResultMessage = (term: string, count: number): string =>
    count === 0 ? searchMessages.empty(term) : searchMessages.found(term, count)

  const getIdleSearchMessage = (count: number): string => searchMessages.idle(count)

  const getSearchIndexLoadingMessage = () =>
    resolveSearchLoadingMessage({
      status: state.currentIndexStatus,
      hasSearchTerm: Boolean(state.currentTerm),
      messages: searchMessages,
    })

  const getSearchFailureMessage = (error: unknown): string => {
    if (!isSearchDebugEnabled())
      return searchMessages.failed
    const message = error instanceof Error ? error.message : String(error || '')
    return message ? searchMessages.failedWithError(message) : searchMessages.failed
  }

  const updateIdleMessage = async (): Promise<void> => {
    const searchId = state.activeSearchId
    const message = document.querySelector<HTMLElement>('#search-message')
    if (!message || isStaleRequest(searchId) || state.currentTerm)
      return

    try {
      const pendingPreload = indexPreload.current()
      if (pendingPreload) {
        await updateSearchMessage(message, getSearchIndexLoadingMessage(), { loading: true })
        await pendingPreload
        if (isStaleRequest(searchId) || state.currentTerm)
          return
      }
      const count = await getSearchRecordCount()
      if (isStaleRequest(searchId) || state.currentTerm)
        return
      await updateSearchMessage(message, getIdleSearchMessage(count))
    }
    catch {
      if (!isStaleRequest(searchId) && !state.currentTerm) {
        await updateSearchMessage(message, '')
      }
    }
  }

  const run = async (term: string, page: number): Promise<void> => {
    const searchId = ++state.activeSearchId
    const message = document.querySelector<HTMLElement>('#search-message')
    const phases: SearchTimingPhase[] = []
    const runtimeStart = nowMs()
    const parsedQuery = parseSearchQuery(term)

    state.currentTerm = term
    state.currentPage = page
    state.records = []
    renderer.setBusy(true)

    let runtimeStatus: 'success' | 'failed' = 'success'

    try {
      renderer.setControlsVisible(0)
      setSearchRelatedTags([])
      await measureSearchPhase(
        phases,
        'clear previous results',
        () => renderer.clear(Boolean(term)),
        { immediate: Boolean(term) },
      )
      if (isStaleRequest(searchId))
        return
      history.replace(term, page)

      if (!term) {
        await updateIdleMessage()
        return
      }

      if (message) {
        const pendingPreload = indexPreload.current()
        if (pendingPreload) {
          void updateSearchMessage(message, searchMessages.indexLoading, { loading: true })
          await measureSearchPhase(phases, 'wait for index readiness', () => pendingPreload)
          if (isStaleRequest(searchId))
            return
        }
        void updateSearchMessage(message, searchMessages.loading(term), { loading: true })
      }

      const searchExecution = await measureSearchPhase(
        phases,
        'search client round trip',
        () => searchRecordsWithTiming(term),
      )
      if (isStaleRequest(searchId))
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
      state.records = searchExecution.records

      if (message) {
        void updateSearchMessage(message, getResultMessage(term, state.records.length))
      }

      await renderer.renderPage(page, searchId, 'replace', phases)
    }
    catch (error) {
      runtimeStatus = 'failed'
      if (isStaleRequest(searchId))
        return
      if (message) {
        void updateSearchMessage(message, getSearchFailureMessage(error))
      }
      console.error(error)
    }
    finally {
      if (!isStaleRequest(searchId)) {
        renderer.setBusy(false)
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
            resultCount: state.records.length,
            page: state.currentPage,
            phases,
          })
        }
      }
    }
  }

  const restore = async (snapshot: SearchResultSnapshot, page: number): Promise<void> => {
    const searchId = ++state.activeSearchId
    const message = document.querySelector<HTMLElement>('#search-message')

    state.currentTerm = snapshot.term
    state.currentPage = page
    state.currentSort = snapshot.sort
    state.records = [...snapshot.records]
    renderer.setBusy(true)

    if (message) {
      message.classList.remove('loading-dots')
      message.textContent = getResultMessage(snapshot.term, snapshot.records.length)
    }

    try {
      await renderer.renderPage(page, searchId, 'replace', null)
    }
    finally {
      if (!isStaleRequest(searchId))
        renderer.setBusy(false)
    }
  }

  const cancel = (): void => {
    state.activeSearchId += 1
  }

  const renderInteractivePage: SearchRunner['renderInteractivePage'] = (page, motionOverride = null) =>
    renderer.renderInteractive(page, motionOverride)

  return {
    run,
    restore,
    cancel,
    updateIdleMessage,
    renderInteractivePage,
  }
}