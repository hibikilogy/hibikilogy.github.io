import type { TagsList } from 'components/tags-list/index.ts'
import type { SearchTagItem } from '../types.ts'
import { searchDom } from '../searchDom.ts'

export function setSearchRelatedTags(
  tags: SearchTagItem[],
  root: ParentNode = document,
): void {
  const section = root.querySelector<HTMLElement>(searchDom.relatedTags)
  const list = root.querySelector<TagsList>(searchDom.relatedTagsList)
  if (!section || !list)
    return

  section.hidden = tags.length === 0
  list.hidden = tags.length === 0
  list.setItems(tags)
}
