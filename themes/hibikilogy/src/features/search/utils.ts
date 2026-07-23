import { getDefaultOrigin, parseUrl } from '../../shared/url.ts'

const cjkPattern = /[\u3400-\u9FFF]+/gu

/**
 * Replace `{0}` `{1}` ... positional placeholders with provided arguments.
 * Usage: fmt('共找到 {0} 条与"{1}"相关的结果', 12, '黄前久美子')
 */
export function fmt(template: string, ...args: (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[+i] ?? ''))
}

type SearchTextInput = string | number | boolean | null | undefined

export function normalizeSearchText(value: SearchTextInput): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeSearchBody(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Re-export shared URL utilities for backward compatibility
export { getPathSlug, normalizeAssetUrl, normalizeSiteUrl } from '../../shared/url.ts'

export function normalizeSearchUrl(value: string | null | undefined): string {
  if (!value)
    return '#'

  const url = parseUrl(String(value), getDefaultOrigin())
  return url ? url.pathname + url.search + url.hash : String(value)
}

export function createExcerpt(value: SearchTextInput, maxLength = 180): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength)
    return text

  return `${text.slice(0, maxLength).trim()}...`
}

export function segmentSearchText(value: SearchTextInput): string {
  const normalized = normalizeSearchText(value)
  if (!normalized)
    return ''

  return uniqueTokens([
    normalized,
    ...segmentWords(normalized),
    ...getCjkBigrams(normalized),
  ]).join(' ')
}

export function segmentSearchQueryText(value: SearchTextInput): string {
  const normalized = normalizeSearchText(value)
  if (!normalized)
    return ''

  const tokens = segmentSearchText(normalized).split(/\s+/).filter(Boolean)
  if (normalized.length <= 1)
    return tokens.join(' ')

  return tokens.filter(token => token.length > 1).join(' ')
}

export function tokenizeForFuse(value: string): string[] {
  const normalized = normalizeSearchText(value)
  if (!normalized)
    return []

  return uniqueTokens([
    ...normalized.split(/\s+/).filter(Boolean),
    ...segmentWords(normalized),
    ...getCjkBigrams(normalized),
  ])
}

export function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens.map(normalizeSearchText).filter(Boolean))]
}

function segmentWords(value: string): string[] {
  const segmenter = getSegmenter()
  if (!segmenter)
    return value.split(/\s+/).filter(Boolean)

  return [...segmenter.segment(value)]
    .filter(part => part.isWordLike)
    .map(part => part.segment)
}

function getCjkBigrams(value: string): string[] {
  const grams: string[] = []

  for (const match of value.matchAll(cjkPattern)) {
    const text = match[0]
    for (let index = 0; index < text.length - 1; index += 1) {
      grams.push(text.slice(index, index + 2))
    }
  }

  return grams
}

interface SearchSegment {
  segment: string
  isWordLike?: boolean
}

interface SearchSegmenter {
  segment: (value: string) => Iterable<SearchSegment>
}

let searchSegmenter: SearchSegmenter | null | undefined

function getSegmenter(): SearchSegmenter | null {
  if (searchSegmenter !== undefined)
    return searchSegmenter
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl))
    return searchSegmenter = null
  const Segmenter = (Intl as typeof Intl & {
    Segmenter: new (locale: string, options: { granularity: 'word' }) => SearchSegmenter
  }).Segmenter
  return searchSegmenter = new Segmenter('zh-Hans', { granularity: 'word' })
}
