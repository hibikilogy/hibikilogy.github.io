export interface PreloadMarginViewport {
  width: number
  height: number
}

export type PreloadMarginValue = string | number | undefined

export function resolvePreloadMarginPixels(
  value: PreloadMarginValue,
  viewport: PreloadMarginViewport,
  fallback: number,
): number {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : fallback

  if (typeof value !== 'string')
    return fallback

  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?|\.\d+)(px|vh|vw)?$/)
  if (!match)
    return fallback

  const amount = Number.parseFloat(match[1])
  if (!Number.isFinite(amount) || amount < 0)
    return fallback

  const unit = match[2] || 'px'
  if (unit === 'vh')
    return viewport.height > 0 ? amount * viewport.height / 100 : fallback

  if (unit === 'vw')
    return viewport.width > 0 ? amount * viewport.width / 100 : fallback

  return amount
}
