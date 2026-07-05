import type { LazyImage } from './lazy-image'
import type { SitePagination } from './site-pagination'
import type { TagsList } from './tags-list'

declare global {
  interface HTMLElementTagNameMap {
    'lazy-image': LazyImage
    'site-pagination': SitePagination
    'tags-list': TagsList
  }
}

export {}
