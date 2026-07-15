import type { SearchArticleMetadataIndex } from './types.ts'
import { searchArticleIndexInlineId } from './config.ts'
import { parseJsonIndex, readInlineJsonIndex } from './data.ts'
import {
  normalizeAssetUrl,
  normalizeSearchUrl,
  normalizeSiteUrl,
} from './utils.ts'

let searchArticleIndexPromise: Promise<SearchArticleMetadataIndex> | null = null

export interface SearchArticleSnapshot {
  subtitle: string
  coverSrc: string
  coverAlt: string
  coverWidth?: number
  coverHeight?: number
  coverThumbhash?: string
  publishDateValue: string
  authorName: string
  authorHref: string
}

export function getSearchArticleIndex(): Promise<SearchArticleMetadataIndex> {
  if (!searchArticleIndexPromise) {
    searchArticleIndexPromise = Promise.resolve(
      readInlineJsonIndex<SearchArticleMetadataIndex>(searchArticleIndexInlineId) || {},
    )
  }

  return searchArticleIndexPromise
}

export const parseSearchArticleIndex = parseJsonIndex

export async function getArticleSnapshot(href: string): Promise<SearchArticleSnapshot> {
  const index = await getSearchArticleIndex()
  return getArticleSnapshotFromIndex(index, href)
}

export function getArticleSnapshotFromIndex(
  index: SearchArticleMetadataIndex,
  href: string,
): SearchArticleSnapshot {
  const normalizedHref = normalizeSearchUrl(href)
  const record = index?.[normalizedHref] || index?.[href] || {}

  return {
    subtitle: String(record.s || ''),
    coverSrc: normalizeSearchCoverSrc(record.cs || ''),
    coverAlt: String(record.ca || ''),
    coverWidth: normalizePositiveNumber(record.cw),
    coverHeight: normalizePositiveNumber(record.ch),
    coverThumbhash: normalizeString(record.ct),
    publishDateValue: String(record.dv || ''),
    authorName: String(record.an || ''),
    authorHref: record.ah ? normalizeSearchUrl(record.ah) : '',
  }
}

function normalizeSearchCoverSrc(value: string): string {
  const normalizedInternalUrl = normalizeSiteUrl(value)
  if (normalizedInternalUrl !== '#')
    return normalizedInternalUrl

  return normalizeAssetUrl(value)
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function normalizeString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}
