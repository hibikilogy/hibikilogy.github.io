import { getRuntimeConfig } from '../search/runtime-config.ts'

export function getDefaultOrigin(): string {
  const { baseUrl } = getRuntimeConfig()
  // Only treat baseUrl as an origin when it is an absolute http(s) URL;
  // fall back to the runtime location origin for relative or empty values.
  if (baseUrl && /^https?:\/\//i.test(baseUrl))
    return baseUrl
  return (typeof location !== 'undefined' && location.origin) || 'http://localhost'
}

/**
 * Normalize an internal site URL to a local path (pathname + search + hash).
 * Returns `#` for external URLs, empty, or invalid values.
 */
export function normalizeSiteUrl(value: string | null | undefined, origin = getDefaultOrigin()): string {
  if (!value)
    return '#'

  try {
    const url = new URL(String(value), origin)
    if (url.origin !== new URL(origin).origin)
      return '#'
    return `${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return '#'
  }
}

/**
 * Resolve a potentially-relative asset URL to an absolute URL.
 * Returns empty string on failure.
 */
export function normalizeAssetUrl(value: string | null | undefined, origin = getDefaultOrigin()): string {
  if (!value)
    return ''

  try {
    return new URL(String(value), origin).toString()
  }
  catch {
    return ''
  }
}

/**
 * Extract the last path segment (slug) from a URL, decoded.
 * Returns empty string for empty/invalid inputs.
 */
export function getPathSlug(href: string): string {
  if (!href || href === '#')
    return ''

  const pathname = href.replace(/[?#].*$/, '')
  const segments = pathname.split('/').filter(Boolean)
  const slug = segments[segments.length - 1] || ''

  try {
    return decodeURIComponent(slug)
  }
  catch {
    return slug
  }
}

/**
 * Safely extract the pathname from a URL string.
 * Falls back to returning the raw value if parsing fails.
 */
export function getPathname(url: string, origin: string): string {
  try {
    return new URL(url, origin).pathname
  }
  catch {
    return url
  }
}

/**
 * Normalize a pathname: strip trailing slashes, default empty to `/`.
 */
export function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}
