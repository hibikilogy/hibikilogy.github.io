import { DEFAULT_PRELOAD_ROOT_MARGIN } from './constants'
import { resolvePreloadMarginPixels } from './preloadMargin'

export function getPreloadRootMargin(): string {
  const viewport = typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : {
        width: window.innerWidth || document.documentElement.clientWidth || 0,
        height: window.innerHeight || document.documentElement.clientHeight || 0,
      }
  return `${resolvePreloadMarginPixels(DEFAULT_PRELOAD_ROOT_MARGIN, viewport, 600)}px 0px`
}
