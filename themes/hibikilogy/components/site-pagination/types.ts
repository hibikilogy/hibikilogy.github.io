/** Shared types for the `<site-pagination>` component. */

export type PaginationMode = 'link' | 'event'

/** A single item produced by {@link getPaginationItems}. */
export type PaginationItem
  = | { type: 'ellipsis' }
    | { type: 'previous', page: number }
    | { type: 'next', page: number }
    | { type: 'page', page: number, current: boolean }
