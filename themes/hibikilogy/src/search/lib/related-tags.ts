import type { SearchResultRecord } from './types.ts'
import { setSearchRelatedTags } from './tag-render.ts'
import {
  aggregateTagsForSearchRecords,
  getSearchTagIndex,
} from './tags.ts'

export async function renderSearchRelatedTags(
  records: SearchResultRecord[],
  isStale: () => boolean = () => false,
): Promise<void> {
  try {
    const tagIndex = await getSearchTagIndex()
    if (isStale())
      return
    setSearchRelatedTags(aggregateTagsForSearchRecords(records, tagIndex))
  }
  catch {
    if (!isStale())
      setSearchRelatedTags([])
  }
}
export { setSearchRelatedTags }
