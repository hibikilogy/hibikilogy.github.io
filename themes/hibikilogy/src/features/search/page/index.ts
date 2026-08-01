import type { AppContext, PageContext } from 'app/index.ts'
import { onScopeDispose, watch } from '@vue/reactivity'
import { useEventListener } from 'shared/useEventListener.ts'
import { SEARCH_FOCUS_INTENT_KEY } from '../config.ts'
import { useSearch } from '../hooks/useSearch.ts'
import { focusSearchInput, searchDom } from '../searchDom.ts'
import { createSearchView } from './searchView.ts'
import { createSearchSnapshotStore } from './snapshotStore.ts'

const retainedSnapshot = createSearchSnapshotStore()

export function mountSearchPage(app: AppContext, page: PageContext): void {
  const root = page.root.querySelector<HTMLElement>(searchDom.root)
  if (!root)
    return

  useEventListener(root, 'page-change', (event) => {
    event.stopPropagation()
  })

  const model = useSearch(app.route, app.searchService, retainedSnapshot)
  const view = createSearchView(root, model)
  const input = root.querySelector<HTMLInputElement>(searchDom.input)
  const form = root.querySelector<HTMLFormElement>(searchDom.form)
  const sorting = root.querySelector<HTMLSelectElement>(searchDom.sorting)

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
      void app.searchService.preload().catch(() => {})
    })
  }

  if (sorting) {
    useEventListener(sorting, 'change', () => {
      model.setSort(sorting.value === 'title' ? 'title' : 'relevance')
    })
  }

  if (consumeSearchFocusIntent() || !model.state.value.query.term)
    focusSearchInput(root)

  void app.searchService.preload().catch(() => {})
}

function consumeSearchFocusIntent(): boolean {
  const intent = sessionStorage.getItem(SEARCH_FOCUS_INTENT_KEY)
  if (!intent)
    return false

  sessionStorage.removeItem(SEARCH_FOCUS_INTENT_KEY)
  return true
}
