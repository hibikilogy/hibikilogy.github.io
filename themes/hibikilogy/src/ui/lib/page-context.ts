/**
 * Cross-cutting page context handed to page modules during initialization.
 *
 * Carries the dependencies a sub-module (currently the search page) needs to
 * observe history events and to mutate the URL through a swup-aware adapter,
 * keeping swup internals out of feature modules.
 */
export interface HistoryAdapter {
  /** Replace the current history record with `url` (path + search + hash). */
  replace: (url: string) => void
  /** Whether the current visit was triggered by browser back/forward. */
  isPopstate: boolean
}

export interface PageContext {
  history: HistoryAdapter
  /** Register a cleanup callback, run on the next `dispose` of page modules. */
  onDispose: (callback: () => void) => void
}