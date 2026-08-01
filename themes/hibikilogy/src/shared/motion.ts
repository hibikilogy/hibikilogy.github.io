import type { DurationVarName } from './animation.ts'
import {
  resolveDurationMs,
  shouldSkipMotion,
  wait,
  waitForAnimationFrame,
} from './animation.ts'

const activeTransitions = new WeakMap<Element, object>()

/**
 * Begin a transition on `element`, superseding any in-flight one; a
 * superseded transition loses ownership of the element's classes.
 */
export function beginTransition(element: Element): object {
  const token = {}
  activeTransitions.set(element, token)
  return token
}

function isTransitionCurrent(element: Element, token: object): boolean {
  return activeTransitions.get(element) === token
}

function forceReflow(element: Element): void {
  void (element as HTMLElement).offsetWidth
}

export interface SwapTransitionOptions {
  /** Duration CSS variable; `fallbackDurationMs` applies when it is absent. */
  durationVar: DurationVarName
  fallbackDurationMs: number
  swap: () => void | Promise<void>

  // --- Search journal extensions (drawer-style container swaps) ---
  /** Extra class kept on the element for the whole transition (e.g. drawer state). */
  transitionClass?: string
  /** Skip the exit delay when false (e.g. nothing to animate out). */
  shouldRunExit?: () => boolean
  /** Wait one frame after swap before entering (layout settling). */
  waitFrameBetweenSwapAndEnter?: boolean
}

/**
 * Runs the exit → swap → enter class transition (is-exit / is-enter-start)
 * shared by text swapping and the search journal, skipping all motion under
 * prefers-reduced-motion. Returns false when superseded; classes are then
 * left untouched because the new transition owns them.
 */
export async function runSwapTransition(
  element: Element,
  options: SwapTransitionOptions,
): Promise<boolean> {
  const token = beginTransition(element)
  // Clear any residual phase classes from a superseded transition, so the
  // element never holds both `is-exit` and `is-enter-start` (each sets
  // opacity: 0) when a new swap starts mid-flight.
  element.classList.remove('is-exit', 'is-enter-start')

  if (shouldSkipMotion()) {
    await options.swap()
    return isTransitionCurrent(element, token)
  }

  const durationMs = resolveDurationMs(options.durationVar, options.fallbackDurationMs)

  element.classList.add('is-exit')
  if (options.transitionClass)
    element.classList.add(options.transitionClass)

  if (!options.shouldRunExit || options.shouldRunExit()) {
    await wait(durationMs)
    if (!isTransitionCurrent(element, token))
      return false
  }

  element.classList.remove('is-exit')
  element.classList.add('is-enter-start')

  await options.swap()
  if (!isTransitionCurrent(element, token))
    return false

  if (options.waitFrameBetweenSwapAndEnter) {
    await waitForAnimationFrame()
    if (!isTransitionCurrent(element, token))
      return false
  }

  forceReflow(element)
  element.classList.remove('is-enter-start')
  return true
}
