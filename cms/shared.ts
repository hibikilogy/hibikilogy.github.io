export const PREVIEW_FONT_STYLES = [
  '/styles/source-han-sans-sc-vf.patch.css',
] as const

export const DEFAULT_COVER = '/imgs/tags.svg'
export const DEFAULT_AVATAR = 'https://random-kumiko.interknot.site/api/v1/image/random'

export function formatDate(value: unknown): string {
  if (!value)
    return ''

  const text = String(value)
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)

  if (!match)
    return text

  const [, year, month, day] = match

  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

export function normalizeExternalUrl(value: unknown): string {
  const url = String(value ?? '').trim()

  if (!url)
    return ''

  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

export function getDomain(value: unknown): string {
  const url = normalizeExternalUrl(value)

  if (!url)
    return ''

  try {
    return new URL(url).hostname
  }
  catch {
    return String(value ?? '')
  }
}
