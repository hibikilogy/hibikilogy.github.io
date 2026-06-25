import { HIBIKILOGY_TRANSLATIONS } from 'virtual:hibikilogy-config'

// Re-export shared URL utilities for backward compatibility
export { getPathSlug, normalizeAssetUrl, normalizeSiteUrl } from '../shared/url.ts'

/** Focus and select the search input on the current page. */
export function focusCurrentSearchInput(): boolean {
  const input = document.querySelector('#search-input')
  if (!(input instanceof HTMLInputElement))
    return false

  input.focus()
  input.select()
  return true
}

export function formatZhPublishDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime()))
    return dateString

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const fmt = HIBIKILOGY_TRANSLATIONS.dateFormat
  return fmt.replace('%Y', String(year)).replace('%m', month).replace('%d', day)
}

export function isDefaultArticleCover(value: string): boolean {
  return /\/imgs\/(?:tag-cloud|tags)\.svg(?:[?#].*)?$/i.test(String(value || ''))
}
