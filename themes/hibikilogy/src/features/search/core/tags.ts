import type { SearchResultRecord, SearchTagIndexItem, SearchTagItem } from '../types.ts'
import { sortTagItems } from 'shared/tags.ts'
import { normalizeSearchUrl } from '../utils.ts'

export function buildTagsByUrl(tagIndex: SearchTagIndexItem[]): Map<string, SearchTagItem[]> {
  const tagsByUrl = new Map<string, SearchTagItem[]>()

  for (const tag of tagIndex) {
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

export function aggregateResultTags(records: readonly SearchResultRecord[]): SearchTagItem[] {
  const counts = new Map<string, SearchTagItem & { count: number }>()

  for (const record of records) {
    for (const tag of record.tags) {
      const current = counts.get(tag.name) || { ...tag, count: 0 }
      current.count += 1
      counts.set(tag.name, current)
    }
  }

  return sortTagItems([...counts.values()])
}
