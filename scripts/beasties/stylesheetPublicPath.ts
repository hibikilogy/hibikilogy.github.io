const stylesSegment = /(?:^|\/)styles\//
const absoluteUrl = /^[a-z][a-z\d+.-]*:\/\//i

export function deriveStylesheetPublicPath(href: string): string | null {
  if (href.startsWith('//')) {
    const url = new URL(`https:${href}`)
    const pathPrefix = getPathPrefix(url.pathname)
    return pathPrefix === null ? null : `//${url.host}${pathPrefix}`
  }

  if (absoluteUrl.test(href)) {
    const url = new URL(href)
    const pathPrefix = getPathPrefix(url.pathname)
    return pathPrefix === null ? null : `${url.origin}${pathPrefix}`
  }

  return getPathPrefix(href.split(/[?#]/, 1)[0].replaceAll('\\', '/'))
}

function getPathPrefix(pathname: string): string | null {
  const match = stylesSegment.exec(pathname)
  if (!match)
    return null

  const segmentOffset = match.index + (match[0].startsWith('/') ? 1 : 0)
  return pathname.slice(0, segmentOffset)
}
