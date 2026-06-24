import type { SearchArticleSnapshot } from './articles.ts'
import type { SearchResultRecord } from './types.ts'
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
  const articleContent = getSearchArticleProps(result, articleSnapshot)

  const article = document.createElement('article')
  article.setAttribute('class', 'Section Article')

  const link = document.createElement('a')
  link.href = articleContent.href

  const heading = document.createElement('h2')
  heading.className = 'article-title'
  const headingText = document.createElement('span')
  headingText.className = 'PostTitleTransition'
  headingText.style.viewTransitionName = articleContent.titleTransitionName
  headingText.textContent = articleContent.title
  heading.appendChild(headingText)
  link.appendChild(heading)

  if (articleContent.subtitle) {
    const subtitle = document.createElement('p')
    subtitle.className = 'article-subtitle'
    subtitle.textContent = articleContent.subtitle
    link.appendChild(subtitle)
  }

  const main = document.createElement('div')
  main.className = 'article-main'

  if (articleContent.coverSrc) {
    const cover = document.createElement('lazy-image')
    cover.className = 'article-cover'
    cover.setAttribute('src', articleContent.coverSrc)
    cover.setAttribute('alt', articleContent.coverAlt)
    cover.setAttribute('loading', 'lazy')
    cover.setAttribute('decoding', 'async')
    if (typeof articleContent.coverWidth === 'number' && articleContent.coverWidth > 0)
      cover.setAttribute('width', String(articleContent.coverWidth))
    if (typeof articleContent.coverHeight === 'number' && articleContent.coverHeight > 0)
      cover.setAttribute('height', String(articleContent.coverHeight))
    if (articleContent.coverThumbhash)
      cover.setAttribute('thumbhash', articleContent.coverThumbhash)
    main.appendChild(cover)
  }

  const content = document.createElement('div')
  content.className = 'article-content'
  const excerpt = document.createElement('p')
  excerpt.textContent = cleanSearchExcerptText(articleContent.excerpt)
  content.appendChild(excerpt)
  main.appendChild(content)

  link.appendChild(main)
  article.appendChild(link)
  article.appendChild(buildSearchMeta(articleContent))
  return article
}

export function getSearchTitle(result: Partial<SearchResultRecord>): string {
  return result.title || result.slug || 'Untitled'
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

function buildSearchMeta(props: SearchArticleProps): HTMLElement {
  const meta = document.createElement('div')
  meta.className = 'article-meta'

  if (props.publishDateValue) {
    const publishDate = document.createElement('time')
    publishDate.className = 'article-publish-date'
    publishDate.dateTime = props.publishDateValue
    publishDate.textContent = formatZhPublishDate(props.publishDateValue)
    meta.appendChild(publishDate)
  }

  if (props.authorName) {
    const authors = document.createElement('span')
    authors.className = 'article-authors'

    const authorTitle = document.createElement('span')
    authorTitle.className = 'author-title'
    authorTitle.innerHTML = '\u4F5C\u8005&nbsp;'
    authors.appendChild(authorTitle)

    const author: HTMLAnchorElement | HTMLSpanElement = props.authorHref
      ? document.createElement('a')
      : document.createElement('span')
    author.className = 'article-author'
    if (props.authorHref) {
      author.setAttribute('href', props.authorHref)
    }

    const authorName = document.createElement('span')
    authorName.className = 'author-name font-bold text-[var(--joh-c-text-1)] [font-variation-settings:\'opsz\'_auto]'
    authorName.textContent = props.authorName
    author.appendChild(authorName)
    authors.appendChild(author)
    meta.appendChild(authors)
  }

  return meta
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

// formatZhPublishDate — imported from ../ui/utils.ts (config-driven)
