import { catchError } from './result.ts'
import { getRuntimeConfig } from './runtime-config/index.ts'

export function getDefaultOrigin(): string {
  const { baseUrl } = getRuntimeConfig()
  // Only treat baseUrl as an absolute http(s) URL;
  // fall back to the runtime location origin for relative or empty values.
  if (baseUrl && /^https?:\/\//i.test(baseUrl))
    return baseUrl
  return (typeof location !== 'undefined' && location.origin) || 'http://localhost'
}

export function parseUrl(raw: string, origin: string): URL | null {
  const [url] = catchError(() => new URL(raw, origin))
  return url ?? null
}

export function serializeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`
}

export function safeDecodeURIComponent(value: string): string {
  const [decoded] = catchError(() => decodeURIComponent(value))
  return decoded ?? value
}

// Normalize an internal site URL to a local path (pathname + search + hash);
// returns `#` for external URLs, empty, or invalid values.
export function normalizeSiteUrl(value: string | null | undefined, origin = getDefaultOrigin()): string {
  if (!value)
    return '#'

  const url = parseUrl(String(value), origin)
  if (!url || url.origin !== parseUrl(origin, origin)?.origin)
    return '#'
  return `${url.pathname}${url.search}${url.hash}`
}

// Resolve a potentially-relative asset URL to an absolute URL; empty on failure.
export function normalizeAssetUrl(value: string | null | undefined, origin = getDefaultOrigin()): string {
  if (!value)
    return ''

  const url = parseUrl(String(value), origin)
  return url ? url.toString() : ''
}

// Extract the last path segment (slug) from a URL, decoded.
export function getPathSlug(href: string): string {
  if (!href || href === '#')
    return ''

  const pathname = href.replace(/[?#].*$/, '')
  const segments = pathname.split('/').filter(Boolean)
  const slug = segments[segments.length - 1] || ''

  return safeDecodeURIComponent(slug)
}

// Safely extract the pathname from a URL string, falling back to the raw value.
export function getPathname(url: string, origin: string): string {
  const parsed = parseUrl(url, origin)
  return parsed ? parsed.pathname : url
}

// Strip trailing slashes, default empty to `/`.
export function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

/** Route prefix of the search page (mirrors the site's `/search` page). */
export const SEARCH_PATH = '/search'

export function isSearchUrl(url: string, origin = getDefaultOrigin()): boolean {
  return normalizePathname(getPathname(url, origin)) === SEARCH_PATH
}
