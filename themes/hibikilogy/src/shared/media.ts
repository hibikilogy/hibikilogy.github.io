/**
 * Viewport breakpoint constants and predicates shared across features.
 *
 * `MAX_TABLET_WIDTH_PX` mirrors `--max-tablet` in styles/lib/media.css —
 * keep both in sync (covered by media.test.ts).
 */
export const MAX_TABLET_WIDTH_PX = 719

export function isMaxTabletViewport(): boolean {
  return globalThis.matchMedia?.(`(max-width: ${MAX_TABLET_WIDTH_PX}px)`).matches === true
}
