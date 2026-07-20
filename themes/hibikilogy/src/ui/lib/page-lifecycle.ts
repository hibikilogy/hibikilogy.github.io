import { initializeAccordions } from '../accordion.ts'
import { disposeOutline, initOutline } from '../outline.ts'
import { bootWaterFalls, disposeWaterFalls } from '../water-fall.ts'
import { disposeArticlePage, initArticlePage } from './article-page.ts'

type SearchPageModule = typeof import('../../search/lib/page.ts')

let searchPageModule: SearchPageModule | null = null
let searchPageLoading: Promise<SearchPageModule> | null = null

function loadSearchPageModule(): Promise<SearchPageModule> | null {
  if (!document.querySelector('#search'))
    return null

  if (!searchPageLoading) {
    searchPageLoading = import('../../search/lib/page.ts').then((module) => {
      searchPageModule = module
      return module
    })
  }
  return searchPageLoading
}

export function initializePageModules(): void {
  initializeAccordions()
  bindPaginationNavigation()
  initOutline()
  bootWaterFalls()
  void loadSearchPageModule()?.then((module) => {
    if (document.querySelector('#search'))
      module.initSearchPage()
  })
  void initArticlePage()
}

export function disposePageModules(): void {
  searchPageModule?.disposeSearchPage()
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
