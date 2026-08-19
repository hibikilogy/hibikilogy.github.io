import type { ApiAsset, CustomPreviewTemplateProps } from '@sveltia/cms'

export type PreviewProps = CustomPreviewTemplateProps
type Entry = PreviewProps['entry']
type GetAsset = PreviewProps['getAsset']

export function getField<T>(entry: Entry, path: string | string[], fallback: T): T {
  const keys = Array.isArray(path) ? path : [path]
  const value = entry.getIn(['data', ...keys]) as T | null | undefined

  return value ?? fallback
}

export function toArray(value: unknown): string[] {
  if (!value)
    return []

  const items = Array.isArray(value)
    ? value
    : isImmutableList(value)
      ? value.toArray()
      : []

  return items
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
}

export function resolveAsset(path: unknown, getAsset: GetAsset): string {
  const value = String(path ?? '').trim()

  if (!value)
    return ''

  let asset: ApiAsset | undefined

  try {
    asset = getAsset(value)
  }
  catch {
    // The entry may reference an existing public asset unknown to the CMS media store.
  }

  return asset?.url || value
}

function isImmutableList(value: unknown): value is { toArray: () => unknown[] } {
  return typeof value === 'object'
    && value !== null
    && 'toArray' in value
    && typeof value.toArray === 'function'
}
