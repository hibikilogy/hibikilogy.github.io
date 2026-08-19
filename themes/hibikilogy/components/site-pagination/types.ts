/** Shared types for the `<site-pagination>` component. */

/** A single item produced by {@link getPaginationItems}. */
export type PaginationItem
  = | { type: 'ellipsis' }
    | { type: 'previous', page: number }
    | { type: 'next', page: number }
    | { type: 'page', page: number, current: boolean }
