import { disposeSearchPage, initSearchPage } from '../search/page.ts'
import { initializeAccordions } from './accordion.ts'
import { disposeArticlePage, initArticlePage } from './article-page.ts'
import { disposeOutline, initOutline } from './outline.ts'
import { bootWaterFalls, disposeWaterFalls } from './water-fall.ts'

export function initializePageModules(): void {
  initializeAccordions()
  bindPaginationNavigation()
  initOutline()
  bootWaterFalls()
  initSearchPage()
  void initArticlePage()
}

export function disposePageModules(): void {
  disposeSearchPage()
  disposeArticlePage()
  disposeOutline()
  disposeWaterFalls()
}

function bindPaginationNavigation(): void {
  document
    .querySelectorAll<HTMLElement>('site-pagination:not(#search-page-control)')
    .forEach(pagination => pagination.setAttribute('mode', 'event'))
}

export function listenForPaginationNavigation(navigate: (url: string) => void): void {
  document.addEventListener('page-change', (event) => {
    const customEvent = event as CustomEvent<{ href?: string }>
    const pagination = customEvent.target
    const href = customEvent.detail?.href

    if (!(pagination instanceof HTMLElement) || pagination.id === 'search-page-control' || !href)
      return

    navigate(href)
  })
}
