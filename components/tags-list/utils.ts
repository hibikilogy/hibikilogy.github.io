/** Pure helpers for `<tags-list>` — sorting and hydration from light DOM. */

import type { TagItem } from './types'
import { sortTagItems } from '../../lib/shared/tags.ts'

/**
 * Read the server-rendered light-DOM children (`<a>` links with optional
 * `.tag-count` spans) into a plain item list. Used to hydrate the component
 * on connect; the original anchors stay in light DOM for SEO/no-JS fallback.
 */
export function readItemsFromChildren(root: ParentNode): TagItem[] {
  return [...root.querySelectorAll('a')]
    .map((link): TagItem => {
      const countElement = link.querySelector('.tag-count')
      const count = Number.parseInt(countElement?.textContent ?? '', 10)

      const item: TagItem = {
        name:
          (link.querySelector('span')?.textContent ?? '').trim()
          || (link.textContent ?? '').trim(),
        href: link.getAttribute('href') || '#',
      }

      if (countElement && Number.isFinite(count)) {
        item.count = count
      }

      return item
    })
    .filter(item => item.name)
}

export { sortTagItems }
