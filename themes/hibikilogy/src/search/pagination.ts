interface SearchPaginationOptions {
  currentPage: number
  totalPages: number
  getHref: (page: number) => string
  onPageChange: (page: number) => void
}

export function renderSearchPagination(options: SearchPaginationOptions): void {
  const pagination = document.querySelector<HTMLElement>('site-pagination#search-page-control')
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
