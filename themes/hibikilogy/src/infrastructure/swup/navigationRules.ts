// Feeds and file assets (pathnames with extensions) load natively.
export function isPageNavigationUrl(url: string, base: string): boolean {
  const target = new URL(url, base)
  if (target.origin !== new URL(base).origin)
    return false

  return !/\.[a-z0-9]+$/i.test(target.pathname)
}
