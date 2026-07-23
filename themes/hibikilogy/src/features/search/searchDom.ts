import { pageDom } from 'shared/dom.ts'

export const searchDom = {
  root: pageDom.search,
  input: '#search-input',
  form: '.SearchShell--page',
  sorting: '#search-sorting',
  results: '#search-results',
  message: '#search-message',
  controls: '#search-pagination',
  pagination: 'site-pagination#search-page-control',
  journal: '.SearchJournal',
  relatedTags: '#search-related-tags',
  relatedTagsList: '#search-related-tags-list',
  openTrigger: '[data-action="open-search"]',
} as const

export function focusSearchInput(root: ParentNode = document): boolean {
  const input = root.querySelector<HTMLInputElement>(searchDom.input)
  if (!input)
    return false

  input.focus()
  input.select()
  return true
}
