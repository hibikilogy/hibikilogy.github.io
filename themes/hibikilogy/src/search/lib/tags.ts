import type { SearchResultRecord, SearchTagIndexItem, SearchTagItem } from './types.ts'
import { sortTagItems } from '../../shared/tags.ts'
import { searchTagIndexInlineId } from './config.ts'
import { parseJsonIndex, readInlineJsonIndex } from './data.ts'
import { normalizeSearchUrl } from './utils.ts'

export function getSearchTagIndex(): Promise<SearchTagIndexItem[]> {
  return Promise.resolve(readInlineJsonIndex<SearchTagIndexItem[]>(searchTagIndexInlineId) || [])
}

export const parseSearchTagIndex = parseJsonIndex

export function buildTagsByUrl(tagIndex: SearchTagIndexItem[]): Map<string, SearchTagItem[]> {
  const tagsByUrl = new Map<string, SearchTagItem[]>()

  for (const tag of tagIndex || []) {
    if (!tag?.name)
      continue

    for (const pageUrl of tag.pages || []) {
      const url = normalizeSearchUrl(pageUrl)
      const tags = tagsByUrl.get(url) || []
      tags.push({ name: tag.name, href: tag.href || '#' })
      tagsByUrl.set(url, tags)
    }
  }

  return tagsByUrl
}

export function aggregateTagsForSearchRecords(
  records: SearchResultRecord[],
  tagIndex: SearchTagIndexItem[] | Record<string, SearchTagItem[]>,
): SearchTagItem[] {
  if (!Array.isArray(records) || !records.length)
    return []

  if (Array.isArray(tagIndex)) {
    return aggregateUrlTagMap(records, buildTagsByUrl(tagIndex))
  }

  return aggregateUrlTagMap(records, new Map(Object.entries(tagIndex)))
}

function aggregateUrlTagMap(
  records: SearchResultRecord[],
  tagsByUrl: Map<string, SearchTagItem[]>,
): SearchTagItem[] {
  const tagCounts = new Map<string, SearchTagItem & { count: number }>()

  for (const record of records) {
    const recordUrl = normalizeSearchUrl(record.url || record.path)
    const tags = tagsByUrl.get(recordUrl) || tagsByUrl.get(normalizeSearchUrl(recordUrl)) || []

    for (const tag of tags) {
      if (!tag?.name)
        continue

      const current = tagCounts.get(tag.name) || {
        name: tag.name,
        href: tag.href || '#',
        count: 0,
      }
      current.count += 1
      tagCounts.set(tag.name, current)
    }
  }

  return sortTagItems([...tagCounts.values()])
}
