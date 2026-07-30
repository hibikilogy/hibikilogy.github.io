// Feeds and file assets (any pathname with an extension) load natively —
// swup can't match their containers, and caching non-HTML bodies as pages
// would break subsequent visits.
export function isPageNavigationUrl(url: string, base: string): boolean {
  const target = new URL(url, base)
  if (target.origin !== new URL(base).origin)
    return false

  return !/\.[a-z0-9]+$/i.test(target.pathname)
}
