import type { SearchModel } from '../types.ts'
import type { SearchJournalMotion } from './motion.ts'
import type { SearchView } from './types.ts'
import { html, nothing, render } from 'lit'
import { searchMessages } from '../config.ts'
import { searchDom } from '../searchDom.ts'
import { getSearchHighlightTerms, renderSearchArticle } from './articleView.ts'
import { resolveSearchLoadingMessage } from './loadingMessage.ts'
import {
  transitionSearchJournalResults,
  updateSearchMessage,
} from './motion.ts'
import { renderSearchPagination } from './pagination.ts'
import { setSearchRelatedTags } from './tagView.ts'

export function createSearchView(root: ParentNode, model: SearchModel): SearchView {
  let previousPage = 1
  let renderId = 0

  return {
    async render(state) {
      const currentRender = ++renderId
      const results = root.querySelector<HTMLElement>(searchDom.results)
      const message = root.querySelector<HTMLElement>(searchDom.message)
      const controls = root.querySelector<HTMLElement>(searchDom.controls)
      const pagination = root.querySelector<HTMLElement>(searchDom.pagination)
      const journal = root.querySelector<HTMLElement>(searchDom.journal)

      if (!results)
        return

      results.setAttribute('aria-busy', String(state.phase === 'loading'))

      if (state.phase === 'idle') {
        render(nothing, results)
        setControlsVisible(controls, pagination, false)
        setSearchRelatedTags([], root)
        const text = state.count === undefined
          ? resolveSearchLoadingMessage({
              status: model.indexStatus.value,
              hasSearchTerm: false,
              messages: searchMessages,
            })
          : searchMessages.idle(state.count)
        if (message) {
          await updateSearchMessage(message, text, {
            loading: state.count === undefined,
          })
        }
        return
      }

      if (state.phase === 'loading') {
        render(nothing, results)
        setControlsVisible(controls, pagination, false)
        setSearchRelatedTags([], root)
        if (message) {
          await updateSearchMessage(message, searchMessages.loading(state.query.term), {
            loading: true,
          })
        }
        return
      }

      if (state.phase === 'error') {
        render(nothing, results)
        setControlsVisible(controls, pagination, false)
        setSearchRelatedTags([], root)
        if (message)
          await updateSearchMessage(message, searchMessages.failed)
        return
      }

      const motion = resolveMotion(previousPage, state.query.page)
      const highlightTerms = getSearchHighlightTerms(state.query.term)
      const committed = await transitionSearchJournalResults(journal, motion, () => {
        if (currentRender !== renderId)
          return

        render(html`
          ${model.results.value.map(record => renderSearchArticle(record, highlightTerms))}
        `, results)

        const page = model.pagination.value
        setControlsVisible(controls, pagination, page.totalPages > 1)
        renderSearchPagination({
          currentPage: page.currentPage,
          totalPages: page.totalPages,
          getHref: (pageNumber) => {
            const url = new URL(window.location.href)
            pageNumber > 1
              ? url.searchParams.set('p', String(pageNumber))
              : url.searchParams.delete('p')
            return `${url.pathname}${url.search}${url.hash}`
          },
          onPageChange: model.setPage,
        }, root)
        setSearchRelatedTags(model.relatedTags.value, root)
      })
      if (!committed || currentRender !== renderId)
        return

      previousPage = state.query.page
      if (message) {
        await updateSearchMessage(
          message,
          state.response.records.length === 0
            ? searchMessages.empty(state.query.term)
            : searchMessages.found(state.query.term, state.response.records.length),
        )
      }
    },
  }
}

function resolveMotion(previousPage: number, nextPage: number): SearchJournalMotion {
  if (nextPage > previousPage)
    return 'forward'
  if (nextPage < previousPage)
    return 'backward'
  return 'replace'
}

function setControlsVisible(
  controls: HTMLElement | null,
  pagination: HTMLElement | null,
  visible: boolean,
): void {
  if (controls)
    controls.hidden = !visible
  if (pagination)
    pagination.hidden = !visible
}
