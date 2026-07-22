import { titleMotionPerformance, compactViewportWidth } from './config.ts'

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number
}

/**
 * Disable the per-glyph pipeline only when the viewport looks mobile and the
 * browser exposes an explicit low-resource signal. Desktop and capable mobile
 * devices retain the full transition.
 */
function computeLowPerformanceMobileDevice(): boolean {
  const isCompact = window.innerWidth <= compactViewportWidth
  const hasCoarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches === true
  if (!isCompact || !hasCoarsePointer)
    return false

  const cores = navigator.hardwareConcurrency
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory
  const hasLowCoreCount = cores > 0 && cores <= titleMotionPerformance.lowCoreCount
  const hasLowMemory = memory !== undefined
    && memory <= titleMotionPerformance.lowMemoryGb

  return hasLowCoreCount || hasLowMemory
}

// Device capability signals are stable for the lifetime of a page; compute once.
const isLowPerformance = computeLowPerformanceMobileDevice()

export function isLowPerformanceMobileDevice(): boolean {
  return isLowPerformance
}