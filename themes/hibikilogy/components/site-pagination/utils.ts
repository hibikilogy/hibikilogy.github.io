/** Pure pagination-window logic, ported verbatim from the original JS. */

import type { PaginationItem } from './types'

export const compactPageLimit = 10
const siblingCount = 4
const neighborPageBudget = siblingCount * 2

/** Either a concrete page number, or an ellipsis placeholder. */
type WindowPage = number | 'ellipsis'

export function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  const current = clampPage(currentPage, totalPages)
  const total = normalizePageNumber(totalPages)

  if (total <= 1)
    return []

  const pages = total <= compactPageLimit
    ? range(1, total)
    : getWindowedPages(current, total)

  const items: PaginationItem[] = []

  for (const page of pages) {
    if (page === 'ellipsis') {
      items.push({ type: 'ellipsis' })
      continue
    }

    if (page === current && current > 1) {
      items.push({ type: 'previous', page: current - 1 })
    }

    items.push({ type: 'page', page, current: page === current })

    if (page === current && current < total) {
      items.push({ type: 'next', page: current + 1 })
    }
  }

  return items
}

function getWindowedPages(
  currentPage: number,
  totalPages: number,
): WindowPage[] {
  const availableLeft = currentPage - 1
  const availableRight = totalPages - currentPage
  const leftCount = Math.min(
    siblingCount,
    availableLeft + Math.max(0, siblingCount - availableRight),
  )
  const rightCount = Math.min(
    siblingCount,
    availableRight + Math.max(0, siblingCount - availableLeft),
  )
  const remainingBudget = neighborPageBudget - leftCount - rightCount
  const extraLeftCount = Math.min(
    remainingBudget,
    Math.max(0, availableLeft - leftCount),
  )
  const extraRightCount = Math.min(
    remainingBudget - extraLeftCount,
    Math.max(0, availableRight - rightCount),
  )
  const start = Math.max(1, currentPage - leftCount - extraLeftCount)
  const end = Math.min(totalPages, currentPage + rightCount + extraRightCount)
  const pages: WindowPage[] = []

  appendBoundaryPages(pages, 1, start)
  pages.push(...range(start, end))
  appendBoundaryPages(pages, totalPages, end)

  return pages
}

function appendBoundaryPages(
  pages: WindowPage[],
  boundaryPage: number,
  windowEdgePage: number,
): void {
  if (boundaryPage === 1) {
    if (windowEdgePage <= 1)
      return
    pages.push(1)
    if (windowEdgePage === 3) {
      pages.push(2)
    }
    else if (windowEdgePage > 3) {
      pages.push('ellipsis')
    }
    return
  }

  if (windowEdgePage >= boundaryPage)
    return
  if (windowEdgePage === boundaryPage - 2) {
    pages.push(boundaryPage - 1)
  }
  else if (windowEdgePage < boundaryPage - 2) {
    pages.push('ellipsis')
  }
  pages.push(boundaryPage)
}

function range(start: number, end: number): number[] {
  const values: number[] = []
  for (let page = start; page <= end; page += 1) {
    values.push(page)
  }
  return values
}

export function clampPage(page: number | string | null, totalPages: number): number {
  const total = normalizePageNumber(totalPages)
  const parsed = normalizePageNumber(page)
  if (total <= 1)
    return 1
  return Math.min(Math.max(parsed, 1), total)
}

export function normalizePageNumber(value: number | string | null): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}
