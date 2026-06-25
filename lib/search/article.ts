import type { SearchArticleSnapshot } from './articles.ts'
import type { SearchResultRecord } from './types.ts'
import { html, nothing, render } from 'lit'
import { HIBIKILOGY_TRANSLATIONS } from 'virtual:hibikilogy-config'
import { formatZhPublishDate } from '../ui/utils.ts'
import { getArticleSnapshot } from './articles.ts'
import {
  createExcerpt,
  getPathSlug,
  normalizeSiteUrl,
} from './utils.ts'

interface SearchArticleProps {
  title: string
  href: string
  subtitle: string
  excerpt: string
  coverSrc: string
  coverAlt: string
  coverWidth?: number
  coverHeight?: number
  coverThumbhash?: string
  publishDateValue: string
  authorName: string
  authorHref: string
  titleTransitionName: string
}

export async function buildSearchArticle(result: SearchResultRecord): Promise<HTMLElement> {
  const href = normalizeSiteUrl(result.url || result.path)
  const articleSnapshot = await getArticleSnapshot(href)
  const props = getSearchArticleProps(result, articleSnapshot)

  const article = document.createElement('article')
  article.className = 'Section Article'
  render(buildSearchArticleTemplate(props), article)
  return article
}

function buildSearchArticleTemplate(props: SearchArticleProps) {
  const showCover = Boolean(props.coverSrc)
  const coverAttrs = showCover
    ? {
        src: props.coverSrc,
        alt: props.coverAlt,
        width: props.coverWidth && props.coverWidth > 0 ? String(props.coverWidth) : undefined,
        height: props.coverHeight && props.coverHeight > 0 ? String(props.coverHeight) : undefined,
        thumbhash: props.coverThumbhash || undefined,
      }
    : null

  return html`
    <a href=${props.href}>
      <h2 class="article-title">
        <span class="PostTitleTransition" style="view-transition-name:${props.titleTransitionName}">
          ${props.title}
        </span>
      </h2>
      ${props.subtitle ? html`<p class="article-subtitle">${props.subtitle}</p>` : nothing}
      <div class="article-main">
        ${coverAttrs
          ? html`
          <lazy-image class="article-cover"
            src=${coverAttrs.src}
            alt=${coverAttrs.alt}
            loading="lazy"
            decoding="async"
            width=${coverAttrs.width || nothing}
            height=${coverAttrs.height || nothing}
            thumbhash=${coverAttrs.thumbhash || nothing}>
          </lazy-image>
        `
          : nothing}
        <div class="article-content">
          <p>${cleanSearchExcerptText(props.excerpt)}</p>
        </div>
      </div>
    </a>
    ${buildSearchMetaTemplate(props)}
  `
}

export function getSearchTitle(result: Partial<SearchResultRecord>): string {
  return result.title || result.slug || HIBIKILOGY_TRANSLATIONS.untitled
}

export function getSearchArticleProps(
  result: Partial<SearchResultRecord>,
  articleSnapshot: SearchArticleSnapshot,
): SearchArticleProps {
  const title = getSearchTitle(result)
  const href = normalizeSiteUrl(result.url || result.path)
  const publishDateValue = articleSnapshot.publishDateValue || result.date || ''
  const subtitle = articleSnapshot.subtitle || result.description || getPathSlug(href)

  return {
    title,
    href,
    subtitle,
    excerpt: buildSearchExcerpt(result, subtitle),
    coverSrc: articleSnapshot.coverSrc || '',
    coverAlt: articleSnapshot.coverAlt || title,
    coverWidth: articleSnapshot.coverWidth,
    coverHeight: articleSnapshot.coverHeight,
    coverThumbhash: articleSnapshot.coverThumbhash,
    publishDateValue,
    authorName: articleSnapshot.authorName || result.authorName || '',
    authorHref: articleSnapshot.authorHref || '',
    titleTransitionName: getPostTitleTransitionName(href),
  }
}

function buildSearchExcerpt(result: Partial<SearchResultRecord>, subtitle: string): string {
  if (result.bodyMatchExcerpt && result.body) {
    return createExcerpt(result.body)
  }

  const description = result.description || ''
  if (description && description !== subtitle) {
    return createExcerpt(description)
  }

  return createExcerpt(result.body || result.title || result.slug)
}

export function cleanSearchExcerptText(value: string): string {
  return String(value || '').replaceAll('↩', '')
}

function buildSearchMetaTemplate(props: SearchArticleProps) {
  return html`
    <div class="article-meta">
      ${props.publishDateValue
        ? html`
        <time class="article-publish-date" datetime=${props.publishDateValue}>
          ${formatZhPublishDate(props.publishDateValue)}
        </time>
      `
        : nothing}
      ${props.authorName
        ? html`
        <span class="article-authors">
          <span class="author-title">${HIBIKILOGY_TRANSLATIONS.authorTitle}&nbsp;</span>
          ${props.authorHref
            ? html`
            <a class="article-author" href=${props.authorHref}>
              <span class="author-name font-bold text-[var(--joh-c-text-1)] [font-variation-settings:'opsz'_auto]">
                ${props.authorName}
              </span>
            </a>
          `
            : html`
            <span class="article-author">
              <span class="author-name font-bold text-[var(--joh-c-text-1)] [font-variation-settings:'opsz'_auto]">
                ${props.authorName}
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
  if (!href || href === '#')
    return 'none'

  const normalizedPath = href
    .replace(/[?#].*$/, '')
    .replace(/^\/|\/$/g, '')
    .replace(/[/.]/g, '-')

  return `post-title-${normalizedPath || 'index'}`
}
