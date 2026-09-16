/** Shared types for the `<tags-list>` component. */

/** A tag link rendered inside `<tags-list>`. */
export interface TagItem {
  name: string
  href: string
  /** Optional occurrence count; omitted when unknown. */
  count?: number
}
