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
  quick: '--duration-quick',
  fast: '--duration-fast',
  verySlow: '--duration-very-slow',
  reveal: '--duration-reveal',
  hamburgerMorph: '--duration-hamburger-morph',
  pageFlip: '--duration-page-flip',
  mediumZoom: '--duration-medium-zoom',
  searchTransition: '--duration-search-transition',
  searchCover: '--duration-search-cover',
  searchMorph: '--duration-search-morph',
  searchJournalDrawer: '--search-journal-drawer-dur',
  textSwap: '--text-swap-dur',
} as const

export type DurationVarName = keyof typeof DURATION_VARS

/**
 * Resolve a registered duration CSS variable in milliseconds, with
 * `fallbackMs` when the variable is missing or unparseable.
 */
export function resolveDurationMs(name: DurationVarName, fallbackMs = 0): number {
  const varName = DURATION_VARS[name]
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  const ms = parseCssTime(raw)
  if (ms != null)
    return ms
  if (fallbackMs > 0)
    return fallbackMs

  // eslint-disable-next-line no-console -- surfaces misconfiguration in dev
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

export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function shouldSkipMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
