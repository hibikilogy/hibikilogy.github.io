import type { SearchNavigation, SearchService } from '../types.ts'
import { onScopeDispose, watch } from '@vue/reactivity'
import { useEventListener } from 'shared/useEventListener.ts'
import { SEARCH_FOCUS_INTENT_KEY } from '../config.ts'
import { useSearch } from '../hooks/useSearch.ts'
import { focusSearchInput, searchDom } from '../searchDom.ts'
import { createSearchView } from './searchView.ts'
import { createSearchSnapshotStore } from './snapshotStore.ts'

const retainedSnapshot = createSearchSnapshotStore()

export function mountSearchPage(
  nav: SearchNavigation,
  service: SearchService,
  root: HTMLElement,
): void {
  const searchRoot = root.querySelector<HTMLElement>(searchDom.root)
  if (!searchRoot)
    return

  const model = useSearch(nav, service, retainedSnapshot)
  const view = createSearchView(searchRoot, model)
  const input = searchRoot.querySelector<HTMLInputElement>(searchDom.input)
  const form = searchRoot.querySelector<HTMLFormElement>(searchDom.form)
  const sorting = searchRoot.querySelector<HTMLSelectElement>(searchDom.sorting)

  // page-change must not reach the document-level navigation handler;
  // the search page swaps results in place instead of navigating.
  useEventListener(searchRoot, 'page-change', (event) => {
    event.stopPropagation()
    model.setPage((event as CustomEvent<{ page: number }>).detail.page)
  })

  const stopView = watch(
    () => model.state.value,
    (state) => {
      if (input && input.value !== state.query.term)
        input.value = state.query.term
      if (sorting && sorting.value !== state.query.sort)
        sorting.value = state.query.sort
      void view.render(state)
    },
    { immediate: true },
  )
  onScopeDispose(stopView)

  if (form) {
    useEventListener(form, 'submit', (event) => {
      event.preventDefault()
      model.setTerm(input?.value || '')
    })
  }

  if (input) {
    useEventListener(input, 'input', () => {
      void service.preload().catch(() => {})
    })
  }

  if (sorting) {
    useEventListener(sorting, 'change', () => {
      model.setSort(sorting.value === 'title' ? 'title' : 'relevance')
    })
  }

  if (consumeSearchFocusIntent() || !model.state.value.query.term)
    focusSearchInput(searchRoot)

  void service.preload().catch(() => {})
}

function consumeSearchFocusIntent(): boolean {
  const intent = sessionStorage.getItem(SEARCH_FOCUS_INTENT_KEY)
  if (!intent)
    return false

  sessionStorage.removeItem(SEARCH_FOCUS_INTENT_KEY)
  return true
}
