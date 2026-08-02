/**
 * Browser capability probes shared across features. CSS feature support,
 * input characteristics and hardware signals are stable for the page
 * lifetime, so each probe is evaluated once and cached.
 */

import { isMaxTabletViewport } from './media.ts'

const cssSupportCache = new Map<string, boolean>()

function supportsCss(property: string, value: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return false

  const key = `${property}: ${value}`
  let result = cssSupportCache.get(key)
  if (result === undefined) {
    result = CSS.supports(property, value)
    cssSupportCache.set(key, result)
  }
  return result
}

function matchesMedia(query: string): boolean {
  return globalThis.matchMedia?.(query).matches === true
}

export function supportsGridLanes(): boolean {
  return supportsCss('display', 'grid-lanes')
}

export function supportsViewTimeline(): boolean {
  return supportsCss('animation-timeline', 'view()')
}

export function supportsScrollStateContainers(): boolean {
  return supportsCss('container-type', 'scroll-state')
}

export function deviceSupportsHover(): boolean {
  return matchesMedia('(hover: hover)')
}

export function hasCoarsePointer(): boolean {
  return matchesMedia('(pointer: coarse)')
}

export function supportsIntersectionObserver(): boolean {
  return typeof IntersectionObserver === 'function'
}

export function supportsIdleCallback(): boolean {
  return 'requestIdleCallback' in window
}

const LOW_CORE_COUNT = 4
const LOW_MEMORY_GB = 4

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number
}

function computeLowResourceSignal(): boolean {
  const cores = navigator.hardwareConcurrency
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory
  const hasLowCoreCount = cores > 0 && cores <= LOW_CORE_COUNT
  const hasLowMemory = memory !== undefined
    && memory <= LOW_MEMORY_GB

  return hasLowCoreCount || hasLowMemory
}

// Hardware signals are stable for the page lifetime; viewport and pointer
// characteristics are evaluated per call because they can change. The probe
// is lazy so importing this module never touches `navigator` eagerly.
let lowResourceSignal: boolean | undefined

function hasLowResourceSignal(): boolean {
  lowResourceSignal ??= computeLowResourceSignal()
  return lowResourceSignal
}

export function isLowPerformanceMobileDevice(): boolean {
  return hasLowResourceSignal()
    && isMaxTabletViewport()
    && hasCoarsePointer()
}
