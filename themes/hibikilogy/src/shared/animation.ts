import autoAnimate from '@formkit/auto-animate'

/**
 * Parse a CSS time value (e.g. "300ms", "0.5s") to milliseconds.
 * Returns null if the value is empty or unparseable.
 */
export function parseCssTime(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  if (trimmed.endsWith('ms')) {
    const ms = Number.parseFloat(trimmed)
    return Number.isFinite(ms) ? ms : null
  }
  if (trimmed.endsWith('s')) {
    const seconds = Number.parseFloat(trimmed)
    return Number.isFinite(seconds) ? seconds * 1000 : null
  }

  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Registry of animation-duration CSS custom properties consumed from JS. */
export const DURATION_VARS = {
  fast: '--duration-fast',
  verySlow: '--duration-very-slow',
  reveal: '--duration-reveal',
  hamburgerMorph: '--duration-hamburger-morph',
  pageFlip: '--duration-page-flip',
  mediumZoom: '--duration-medium-zoom',
  searchJournalDrawer: '--search-journal-drawer-dur',
  textSwap: '--text-swap-dur',
} as const

export type DurationVarName = keyof typeof DURATION_VARS

/**
 * Resolve a registered animation-duration CSS custom property from :root
 * and return its value in milliseconds.
 *
 * Logs a console warning when the CSS variable is missing or unparseable
 * so misconfiguration is surfaced during development.
 */
export function resolveDurationMs(name: DurationVarName): number {
  const varName = DURATION_VARS[name]
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  const ms = parseCssTime(raw)
  if (ms != null && ms > 0)
    return ms

  console.warn(
    `[animation] CSS variable "${varName}" resolved to "${raw || '(empty)'}" — `
    + `expected a valid time value (e.g. "300ms" or "0.5s"). `
    + `Falling back to 0ms (instant).`,
  )
  return 0
}

export function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

/** Wait until the browser starts the next rendering frame. */
export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/** Check if the user prefers reduced motion. */
export function shouldSkipMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

const autoAnimatedElements = new WeakSet<Element>()

function resolveStandardEasing(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--ease-standard')
    .trim()
  return value || 'cubic-bezier(0.33, 0, 0.13, 1)'
}

/**
 * Enable @formkit/auto-animate on an element.
 * Safe to call multiple times — subsequent calls are no-ops for the same element.
 */
export function enableAutoAnimate(element: Element): void {
  if (!(element instanceof HTMLElement) || autoAnimatedElements.has(element))
    return

  autoAnimate(element, {
    duration: resolveDurationMs('fast'),
    easing: resolveStandardEasing(),
  })
  autoAnimatedElements.add(element)
}
