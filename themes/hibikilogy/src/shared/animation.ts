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

/**
 * Enable @formkit/auto-animate on an element.
 * Safe to call multiple times — subsequent calls are no-ops for the same element.
 */
export function enableAutoAnimate(element: Element): void {
  if (!(element instanceof HTMLElement) || autoAnimatedElements.has(element))
    return

  autoAnimate(element, {
    duration: 220,
    easing: 'cubic-bezier(0.33, 0, 0.13, 1)',
  })
  autoAnimatedElements.add(element)
}
