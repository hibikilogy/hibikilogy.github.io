import type { SearchResultRecord, SearchTagIndexItem, SearchTagItem } from './types.ts'
import { sortTagItems } from '../shared/tags.ts'
import { searchTagIndexInlineId } from './config.ts'
import { parseJsonIndex, readInlineJsonIndex } from './data.ts'
import { normalizeSearchUrl } from './utils.ts'

export function getSearchTagIndex(): Promise<SearchTagIndexItem[]> {
  return Promise.resolve(readInlineJsonIndex<SearchTagIndexItem[]>(searchTagIndexInlineId) || [])
}

export const parseSearchTagIndex = parseJsonIndex

export function aggregateTagsForSearchRecords(
  records: SearchResultRecord[],
  tagIndex: SearchTagIndexItem[] | Record<string, SearchTagItem[]>,
): SearchTagItem[] {
  if (!Array.isArray(records) || !records.length)
    return []

  if (Array.isArray(tagIndex)) {
    return aggregateTagPageIndex(records, tagIndex)
  }

  return aggregateUrlTagMap(records, tagIndex)
}

function aggregateTagPageIndex(records: SearchResultRecord[], tagIndex: SearchTagIndexItem[]): SearchTagItem[] {
  const recordUrls = new Set(records.map(record => normalizeSearchUrl(record.url || record.path)))
  const items: Array<SearchTagItem & { count: number }> = []

  for (const tag of tagIndex) {
    const pages = Array.isArray(tag?.pages) ? tag.pages : []
    const count = pages.reduce((total, pageUrl) => (
      recordUrls.has(normalizeSearchUrl(pageUrl)) ? total + 1 : total
    ), 0)

    if (count > 0 && tag?.name) {
      items.push({
        name: tag.name,
        href: tag.href || '#',
        count,
      })
    }
  }

  return sortTagItems(items)
}

function aggregateUrlTagMap(
  records: SearchResultRecord[],
  tagsByUrl: Record<string, SearchTagItem[]>,
): SearchTagItem[] {
  const tagCounts = new Map<string, SearchTagItem & { count: number }>()

  for (const record of records) {
    const recordUrl = normalizeSearchUrl(record.url || record.path)
    const tags = getTagsForUrl(tagsByUrl, recordUrl)

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

function getTagsForUrl(tagsByUrl: Record<string, SearchTagItem[]>, recordUrl: string): SearchTagItem[] {
  if (!tagsByUrl || typeof tagsByUrl !== 'object')
    return []
  return tagsByUrl[recordUrl] || tagsByUrl[normalizeSearchUrl(recordUrl)] || []
}
