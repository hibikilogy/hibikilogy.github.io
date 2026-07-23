import type { SearchResultRecord } from '../types.ts'
import { html, nothing } from 'lit'
import { formatZhPublishDate } from 'ui/index.ts'
import { HIBIKILOGY_TRANSLATIONS } from 'virtual:hibikilogy-config'
import { parseSearchQuery } from '../core/query.ts'
import { createExcerpt, getPathSlug, normalizeSiteUrl } from '../utils.ts'

export function renderSearchArticle(
  result: SearchResultRecord,
  highlightTerms: readonly string[],
) {
  const href = normalizeSiteUrl(result.url || result.path)
  const title = getSearchTitle(result)
  const subtitle = result.subtitle || result.description || getPathSlug(href)
  const excerpt = buildSearchExcerpt(result, subtitle)

  return html`
    <article class="Section Article">
      <a href=${href}>
        <h2 class="article-title">
          <span class="PostTitleTransition" data-post-title-key=${getPostTitleTransitionName(href)}>
            <span class="PostTitleTransitionText">${title}</span>
          </span>
        </h2>
        ${subtitle ? html`<p class="article-subtitle">${subtitle}</p>` : nothing}
        <div class="article-main">
          ${result.coverSrc
            ? html`
              <lazy-image class="article-cover"
                src=${result.coverSrc}
                alt=${result.coverAlt || title}
                loading="lazy"
                decoding="async"
                width=${result.coverWidth || nothing}
                height=${result.coverHeight || nothing}
                thumbhash=${result.coverThumbhash || nothing}>
              </lazy-image>
            `
            : nothing}
          <div class="article-content">
            <p>${renderHighlightedText(cleanExcerpt(excerpt), highlightTerms)}</p>
          </div>
        </div>
      </a>
      ${renderMeta(result)}
    </article>
  `
}

export function getSearchHighlightTerms(searchTerm: string): string[] {
  const terms = parseSearchQuery(searchTerm).clauses.filter(clause => clause.type !== 'not').map(clause => clause.value.trim()).filter(Boolean)

  return [...new Set(terms)]
    .sort((left, right) => right.length - left.length)
    .slice(0, 6)
}

function getSearchTitle(result: Partial<SearchResultRecord>): string {
  return result.title || result.slug || HIBIKILOGY_TRANSLATIONS.untitled
}

function buildSearchExcerpt(result: SearchResultRecord, subtitle: string): string {
  if (result.bodyMatchExcerpt && result.body)
    return createExcerpt(result.body)
  if (result.description && result.description !== subtitle)
    return createExcerpt(result.description)
  return createExcerpt(result.body || result.title || result.slug)
}

function cleanExcerpt(value: string): string {
  return value.replaceAll('↩', '')
}

function renderHighlightedText(value: string, terms: readonly string[]) {
  if (!value || !terms.length)
    return value

  const pattern = terms.map(escapeRegExp).join('|')
  const matcher = new RegExp(`(${pattern})`, 'giu')
  return value.split(matcher).map((part, index) => (
    index % 2 === 1 ? html`<mark class="SearchHighlight">${part}</mark>` : part
  ))
}

function renderMeta(result: SearchResultRecord) {
  const publishDate = result.publishDateValue || result.date
  return html`
    <div class="article-meta">
      ${publishDate
        ? html`
          <time class="article-publish-date" datetime=${publishDate}>
            ${formatZhPublishDate(publishDate)}
          </time>
        `
        : nothing}
      ${result.authorName
        ? html`
          <span class="article-authors">
            <span class="author-title">${HIBIKILOGY_TRANSLATIONS.authorTitle}&nbsp;</span>
            ${result.authorHref
              ? html`
                <a class="article-author" href=${normalizeSiteUrl(result.authorHref)}>
                  <span class="author-name font-bold text-[var(--joh-c-text-1)] [font-variation-settings:'opsz'_auto]">
                    ${result.authorName}
                  </span>
                </a>
              `
              : html`
                <span class="article-author">
                  <span class="author-name font-bold text-[var(--joh-c-text-1)] [font-variation-settings:'opsz'_auto]">
                    ${result.authorName}
                  </span>
                </span>
              `}
          </span>
        `
        : nothing}
    </div>
  `
}

function getPostTitleTransitionName(href: string): string {
  const path = href.replace(/[?#].*$/, '').replace(/^\/|\/$/g, '').replace(/[/.]/g, '-')
  return `post-title-${path || 'index'}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
