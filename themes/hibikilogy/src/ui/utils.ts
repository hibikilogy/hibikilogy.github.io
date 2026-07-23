import { HIBIKILOGY_TRANSLATIONS } from 'virtual:hibikilogy-config'

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
