import type { SearchTagItem } from './types.ts'
import { html, nothing, render } from 'lit'

interface SearchTagsListElement extends HTMLElement {
  setItems?: (items: SearchTagItem[]) => void
}

export function setSearchRelatedTags(tags: SearchTagItem[]): void {
  const section = document.querySelector<HTMLElement>('#search-related-tags')
  const list = document.querySelector<SearchTagsListElement>('#search-related-tags-list')
  const items = Array.isArray(tags) ? tags : []

  if (!section || !list)
    return
  section.hidden = items.length === 0
  list.hidden = items.length === 0

  if (typeof list.setItems === 'function') {
    list.setItems(items)
    return
  }

  list.replaceChildren(...items.map(tag => renderTagLink(tag)))
}

function renderTagLink(tag: SearchTagItem): HTMLAnchorElement {
  const count = (tag as SearchTagItem & { count?: number }).count
  const showCount = typeof count === 'number' && Number.isFinite(count) && count > 0

  const link = document.createElement('a')
  link.className = 'joh-tag mr-2 font-700 text-inherit no-underline'
  link.href = tag.href || '#'
  link.title = tag.name || ''
  link.target = '_blank'

  render(html`
    <span>${tag.name || ''}</span>
    ${showCount ? html`<span class="hidden text-[0.8rem] text-[var(--footer-directory-title-color)]">${String(count)}</span>` : nothing}
  `, link)

  return link
}
