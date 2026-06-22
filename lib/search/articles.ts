import type { SearchArticleMetadata, SearchArticleMetadataIndex } from './types.ts'
import { searchArticleIndexInlineId } from './config.ts'
import { parseJsonIndex, readInlineJsonIndex } from './data.ts'
import {
  normalizeAssetUrl,
  normalizeSearchUrl,
} from './utils.ts'

let searchArticleIndexPromise: Promise<SearchArticleMetadataIndex> | null = null

export function getSearchArticleIndex(): Promise<SearchArticleMetadataIndex> {
  if (!searchArticleIndexPromise) {
    searchArticleIndexPromise = Promise.resolve(
      readInlineJsonIndex<SearchArticleMetadataIndex>(searchArticleIndexInlineId) || {},
    )
  }

  return searchArticleIndexPromise
}

export const parseSearchArticleIndex = parseJsonIndex

export async function getArticleSnapshot(href: string): Promise<Required<SearchArticleMetadata>> {
  const index = await getSearchArticleIndex()
  return getArticleSnapshotFromIndex(index, href)
}

export function getArticleSnapshotFromIndex(
  index: SearchArticleMetadataIndex,
  href: string,
): Required<SearchArticleMetadata> {
  const normalizedHref = normalizeSearchUrl(href)
  const record = index?.[normalizedHref] || index?.[href] || {}

  return {
    subtitle: String(record.subtitle || ''),
    coverSrc: normalizeAssetUrl(record.coverSrc || ''),
    coverAlt: String(record.coverAlt || ''),
    publishDateText: String(record.publishDateText || ''),
    publishDateValue: String(record.publishDateValue || ''),
    authorName: String(record.authorName || ''),
    authorHref: record.authorHref ? normalizeSearchUrl(record.authorHref) : '',
  }
}
