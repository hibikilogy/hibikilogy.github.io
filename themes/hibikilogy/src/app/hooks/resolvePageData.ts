import type { PageData, PageKind } from './types.ts'
import { pageDom } from 'shared/selectors.ts'

function resolvePageKind(root: HTMLElement): PageKind {
  if (root.querySelector(pageDom.search))
    return 'search'
  if (root.querySelector(pageDom.article))
    return 'article'
  if (root.querySelector(pageDom.journal))
    return 'journal'
  return 'default'
}

export function resolvePageData(root: HTMLElement): PageData {
  return Object.freeze({
    kind: resolvePageKind(root),
  })
}
