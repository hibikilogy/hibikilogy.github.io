import type { SearchTagItem } from '../types.ts'
import { searchDom } from '../searchDom.ts'

interface SearchTagsListElement extends HTMLElement {
  setItems?: (items: SearchTagItem[]) => void
}

export function setSearchRelatedTags(
  tags: SearchTagItem[],
  root: ParentNode = document,
): void {
  const section = root.querySelector<HTMLElement>(searchDom.relatedTags)
  const list = root.querySelector<SearchTagsListElement>(searchDom.relatedTagsList)
  if (!section || !list)
    return

  section.hidden = tags.length === 0
  list.hidden = tags.length === 0
  list.setItems?.(tags)
}
