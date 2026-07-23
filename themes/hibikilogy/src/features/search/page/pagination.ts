import type { SearchPaginationOptions } from './types.ts'
import { searchDom } from '../searchDom.ts'

export function renderSearchPagination(options: SearchPaginationOptions, root: ParentNode): void {
  const pagination = root.querySelector<HTMLElement>(searchDom.pagination)
  if (!pagination)
    return

  pagination.setAttribute('current-page', String(options.currentPage))
  pagination.setAttribute('total-pages', String(options.totalPages))
  const controller = pagination as HTMLElement & {
    getHref?: (page: number) => string
    onPageChange?: (page: number) => void
  }

  controller.getHref = options.getHref
  controller.onPageChange = options.onPageChange
}
