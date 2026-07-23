import { compactViewportWidth, titleMotionPerformance } from './config.ts'

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number
}

function computeLowResourceSignal(): boolean {
  const cores = navigator.hardwareConcurrency
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory
  const hasLowCoreCount = cores > 0 && cores <= titleMotionPerformance.lowCoreCount
  const hasLowMemory = memory !== undefined
    && memory <= titleMotionPerformance.lowMemoryGb

  return hasLowCoreCount || hasLowMemory
}

// Hardware capability signals are stable for the page lifetime. Viewport and
// pointer characteristics are evaluated per transition because they can change.
const hasLowResourceSignal = computeLowResourceSignal()

export function isLowPerformanceMobileDevice(): boolean {
  return hasLowResourceSignal
    && window.innerWidth <= compactViewportWidth
    && globalThis.matchMedia?.('(pointer: coarse)').matches === true
}
