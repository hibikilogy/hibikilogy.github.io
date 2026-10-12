import type { SitePagination } from 'components/site-pagination/index.ts'
import type { SearchPaginationOptions } from './types.ts'
import { searchDom } from '../searchDom.ts'

export function renderSearchPagination(options: SearchPaginationOptions, root: ParentNode): void {
  const pagination = root.querySelector<SitePagination>(searchDom.pagination)
  if (!pagination)
    return

  pagination.setAttribute('current-page', String(options.currentPage))
  pagination.setAttribute('total-pages', String(options.totalPages))
  pagination.getHref = options.getHref
}
