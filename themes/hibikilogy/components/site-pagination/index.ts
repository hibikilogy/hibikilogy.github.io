import type { PaginationItem, PaginationMode } from './types'
import { css, html, LitElement, nothing } from 'lit'

import { customElement, property } from 'lit/decorators.js'
import { cn } from '../utils'
import {
  clampPage,
  compactPageLimit,
  getPaginationItems,
  normalizePageNumber,
} from './utils'

const DIRECTION_LINK_CLASS = [
  'inline-flex',
  'min-h-6',
  'min-w-6',
  'items-center',
  'justify-center',
  'text-inherit',
  'no-underline',
].join(' ')
const DIRECTION_ICON_CLASS = 'inline-block h-[1.5em] w-[1.5em] align-sub'

/**
 * `<site-pagination>` - paginated navigation, rendered into Shadow DOM.
 */
@customElement('site-pagination')
export class SitePagination extends LitElement {
  getHref?: (page: number) => string
  onPageChange?: (page: number) => void

  static override readonly styles = css`
    @unocss-placeholder

    :host {
      display: block;
      width: 100%;
      font: inherit;
      color: inherit;
      line-height: inherit;
    }
  `

  /** @attr current-page */
  @property({ attribute: 'current-page', type: Number })
  currentPage = 1

  /** @attr total-pages */
  @property({ attribute: 'total-pages', type: Number })
  totalPages = 1

  /** @attr base-url */
  @property({ attribute: 'base-url' })
  baseUrl = ''

  /** @attr previous-url */
  @property({ attribute: 'previous-url' })
  previousUrl: string | null = null

  /** @attr next-url */
  @property({ attribute: 'next-url' })
  nextUrl: string | null = null

  /** @attr aria-label */
  @property({ attribute: 'aria-label' })
  navigationLabel = '分页'

  /** @attr previous-label */
  @property({ attribute: 'previous-label' })
  previousLabel = '上一页'

  /** @attr next-label */
  @property({ attribute: 'next-label' })
  nextLabel = '下一页'

  /** @attr current-page-template */
  @property({ attribute: 'current-page-template' })
  currentPageTemplate = '第 {page} 页'

  /** @attr page-aria-label-template */
  @property({ attribute: 'page-aria-label-template' })
  pageAriaLabelTemplate = '前往第 {page} 页'

  /** @attr mobile-page-template */
  @property({ attribute: 'mobile-page-template' })
  mobilePageTemplate = '第 {page} 页'

  /** @attr mode - `"link"` (navigate) or `"event"` (dispatch page-change). */
  @property()
  mode: PaginationMode = 'link'

  override render() {
    const items = getPaginationItems(this.currentPage, this.totalPages)

    this.hidden = items.length === 0

    if (items.length === 0)
      return nothing

    return html`
      <div class="block w-full">
        ${this.renderDesktopNav(items)}
        ${this.renderMobileNav()}
      </div>
    `
  }

  private renderDesktopNav(items: PaginationItem[]) {
    return html`
      <nav class="hidden w-full md:block" aria-label=${this.navigationLabel}>
        <ul class="ml-8 flex list-none flex-wrap items-center p-0">
          ${items.map(item => this.renderItem(item))}
        </ul>
      </nav>
    `
  }

  private renderItem(item: PaginationItem) {
    switch (item.type) {
      case 'ellipsis':
        return html`<li class="flex min-h-8 min-w-8 items-center justify-center px-1 text-[#999] cursor-default">
          <span aria-hidden="true">...</span>
        </li>`
      case 'previous':
        return html`<li class="flex min-h-8 min-w-8 items-center justify-center px-1">
          ${this.renderDirectionLink('previous', item.page)}
        </li>`
      case 'next':
        return html`<li class="flex min-h-8 min-w-8 items-center justify-center px-1">
          ${this.renderDirectionLink('next', item.page)}
        </li>`
      case 'page':
        return html`<li class="flex min-h-8 min-w-8 items-center justify-center px-1">
          ${this.renderPageLink(item.page, item.current)}
        </li>`
      default:
        return nothing
    }
  }

  private renderPageLink(page: number, isCurrent: boolean) {
    const showPageNumber = isCurrent && this.totalPages > compactPageLimit
    const label = showPageNumber
      ? this.formatTemplate(this.currentPageTemplate, page)
      : String(page)

    return html`
      <a
        class="${DIRECTION_LINK_CLASS} ${isCurrent ? 'cursor-default font-bold' : ''}"
        aria-label=${this.formatTemplate(this.pageAriaLabelTemplate, page)}
        aria-current="${isCurrent ? 'page' : nothing}"
        href="${isCurrent ? '#' : this.getPageHref(page)}"
        @click=${(event: MouseEvent) =>
          this.handlePageClick(event, page, isCurrent)}
      >${label}</a>
    `
  }

  private renderDirectionLink(
    direction: 'previous' | 'next',
    page: number,
  ) {
    const isPrevious = direction === 'previous'
    const label = isPrevious ? this.previousLabel : this.nextLabel

    return html`
      <a
        class="${DIRECTION_LINK_CLASS}"
        title=${label}
        aria-label=${label}
        href="${this.getPageHref(page)}"
        @click=${(event: MouseEvent) =>
          this.handlePageClick(event, page, false)}
      >
        <i
          class="${cn(DIRECTION_ICON_CLASS, isPrevious ? 'i-custom-prev' : 'i-custom-next')}"
        ></i>
      </a>
    `
  }

  private renderMobileNav() {
    return html`
      <nav
        class="hidden w-full items-center justify-end gap-2 text-right lt-md:flex font-bold"
        aria-label=${this.navigationLabel}
      >
        ${this.currentPage > 1
          ? this.renderDirectionLink('previous', this.currentPage - 1)
          : nothing}
        <span>${this.formatTemplate(this.mobilePageTemplate, this.currentPage)}</span>
        ${this.currentPage < this.totalPages
          ? this.renderDirectionLink('next', this.currentPage + 1)
          : nothing}
      </nav>
    `
  }

  private handlePageClick(
    event: MouseEvent,
    page: number,
    isCurrent: boolean,
  ): void {
    if (isCurrent)
      return

    const href = this.getPageHref(page)
    if (this.mode === 'event' || this.onPageChange) {
      event.preventDefault()
    }

    this.dispatchEvent(
      new CustomEvent<{ page: number, href: string }>('page-change', {
        bubbles: true,
        composed: true,
        detail: { page, href },
      }),
    )
    this.onPageChange?.(page)
  }

  private getPageHref(page: number): string {
    if (page === this.currentPage)
      return '#'

    const externalHref = this.getHref?.(page)
    if (externalHref)
      return externalHref

    if (page === this.currentPage - 1 && this.previousUrl) {
      return this.previousUrl
    }

    if (page === this.currentPage + 1 && this.nextUrl) {
      return this.nextUrl
    }

    if (this.baseUrl.includes('{page}')) {
      return this.baseUrl.replaceAll('{page}', String(page))
    }

    return `${this.baseUrl}${page}`
  }

  private formatTemplate(template: string, page: number): string {
    return (template || '{page}').replaceAll('{page}', String(page))
  }
}

export const Pagination = SitePagination
export { clampPage, getPaginationItems, normalizePageNumber }
export type { PaginationItem, PaginationMode }
