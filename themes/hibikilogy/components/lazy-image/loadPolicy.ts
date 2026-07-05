import type { PreloadMarginValue, PreloadMarginViewport } from './preloadMargin'
import { DEFAULT_PRELOAD_ROOT_MARGIN } from './constants'
import { resolvePreloadMarginPixels } from './preloadMargin'

export function shouldLoadImmediately(preload: boolean, loading: 'lazy' | 'eager'): boolean {
  return preload || loading === 'eager'
}

export function getPreloadRootMargin(preloadMargin: PreloadMarginValue): string {
  return `${getPreloadMarginPixels(preloadMargin)}px 0px`
}

export function isWithinLoadThreshold(
  image: HTMLImageElement,
  preloadMargin: PreloadMarginValue,
): boolean {
  if (typeof window === 'undefined')
    return false

  const rect = image.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0)
    return false

  const rootMargin = getPreloadMarginPixels(preloadMargin)
  const viewport = getPreloadViewport()

  return (
    rect.bottom >= -rootMargin
    && rect.right >= -rootMargin
    && rect.top <= viewport.height + rootMargin
    && rect.left <= viewport.width + rootMargin
  )
}

export function getPreloadMarginPixels(preloadMargin: PreloadMarginValue): number {
  const viewport = getPreloadViewport()
  const fallback = resolvePreloadMarginPixels(DEFAULT_PRELOAD_ROOT_MARGIN, viewport, 600)
  return resolvePreloadMarginPixels(preloadMargin, viewport, fallback)
}

function getPreloadViewport(): PreloadMarginViewport {
  if (typeof window === 'undefined')
    return { width: 0, height: 0 }

  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }
}
