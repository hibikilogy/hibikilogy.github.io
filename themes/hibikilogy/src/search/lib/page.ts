import { normalizePageNumber } from '../../../components/site-pagination/utils.ts'
import { focusCurrentSearchInput } from '../../ui/utils.ts'
import type { PageContext } from '../../ui/lib/page-context.ts'
import { searchFocusIntentKey } from './config.ts'
import { preloadSearch, searchIndexStatusEventName } from './index.ts'
import { createSearchHistory } from './history.ts'
import { createSearchRenderer } from './renderer.ts'
import { createSearchRunner } from './runner.ts'
import { createSearchState, resetSearchState } from './search-state.ts'
import {
  createSearchSnapshotStore,
  type SearchSort,
} from './snapshot-store.ts'
import { setSearchRelatedTags } from './related-tags.ts'
import type { SearchIndexBuildStatus } from './types.ts'

export interface SearchPageHandle {
  init: () => Promise<void>
  dispose: () => void
}

function normalizeSearchSort(value: string | null | undefined): SearchSort {
  return value === 'title' ? 'title' : 'relevance'
}

function consumeSearchFocusIntent(): boolean {
  const intent = sessionStorage.getItem(searchFocusIntentKey)
  if (!intent)
    return false

  sessionStorage.removeItem(searchFocusIntentKey)
  return true
}

/**
 * Build a self-contained search page controller. All mutable state lives in
 * the closure; `dispose()` idempotently tears down DOM listeners and
 * invalidates the in-flight search so any pending rendering self-cancels.
 */
export function createSearchPage(ctx: PageContext): SearchPageHandle {
  const state = createSearchState()
  const snapshot = createSearchSnapshotStore()
  const history = createSearchHistory(ctx.history, () => state.currentTerm, () => state.currentSort)
  const renderer = createSearchRenderer({ state, snapshot, history })
  const runner = createSearchRunner({ state, renderer, history })

  let activePage: HTMLElement | null = null
  let cleanup: (() => void) | null = null

  const handleSearchIndexStatus = (event: Event): void => {
    const status = (event as CustomEvent<SearchIndexBuildStatus>).detail
    if (!status)
      return
    state.currentIndexStatus = status
    if (status === 'ready' || state.currentTerm)
      return

    const message = document.querySelector<HTMLElement>('#search-message')
    if (!message)
      return
    void runner.updateIdleMessage()
  }

  const init = async (): Promise<void> => {
    const pageRoot = document.querySelector<HTMLElement>('#search')
    if (!pageRoot) {
      dispose()
      return
    }

    if (activePage === pageRoot)
      return

    dispose()
    activePage = pageRoot

    const input = document.querySelector<HTMLInputElement>('#search-input')
    const form = document.querySelector<HTMLFormElement>('.SearchShell--page')
    const sorting = document.querySelector<HTMLSelectElement>('#search-sorting')

    const handleFormSubmit = (event: Event): void => {
      event.preventDefault()
      void runner.run(input?.value.trim() || '', 1)
    }
    const handleInput = (): void => {
      if (input)
        void preloadSearch().catch(() => {})
    }
    const handleSortChange = (): void => {
      if (!sorting)
        return
      state.currentSort = normalizeSearchSort(sorting.value)
      void runner.renderInteractivePage(1, 'replace')
    }

    window.addEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
    form?.addEventListener('submit', handleFormSubmit)
    input?.addEventListener('input', handleInput)
    sorting?.addEventListener('change', handleSortChange)

    cleanup = () => {
      window.removeEventListener(searchIndexStatusEventName, handleSearchIndexStatus)
      form?.removeEventListener('submit', handleFormSubmit)
      input?.removeEventListener('input', handleInput)
      sorting?.removeEventListener('change', handleSortChange)
      cleanup = null
      activePage = null
    }

    const params = new URLSearchParams(window.location.search)
    const term = params.get('q')?.trim() || ''
    const pageNumber = normalizePageNumber(params.get('p'))
    const sort = normalizeSearchSort(params.get('sort'))
    const shouldFocusInput = consumeSearchFocusIntent() || !term
    const matchedSnapshot = ctx.history.isPopstate ? snapshot.match(term, sort) : null

    state.currentSort = sort
    if (sorting)
      sorting.value = sort

    if (term && input) {
      input.value = term
      if (matchedSnapshot) {
        await runner.restore(matchedSnapshot, pageNumber)
      }
      else {
        resetSearchState(state)
        state.currentSort = sort
        void runner.run(term, pageNumber)
      }
    }
    else {
      resetSearchState(state)
      state.currentSort = sort
      if (input)
        input.value = ''
      renderer.setControlsVisible(0)
      setSearchRelatedTags([])
    }

    if (shouldFocusInput)
      focusCurrentSearchInput()

    void preloadSearch().catch(() => {})
    if (!term)
      void runner.updateIdleMessage()
  }

  const dispose = (): void => {
    runner.cancel()
    snapshot.clear()
    cleanup?.()
  }

  return { init, dispose }
}