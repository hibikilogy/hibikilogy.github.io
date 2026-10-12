import type { DurationVarName } from 'shared/animation.ts'
import {
  resolveDurationMs,
  shouldSkipMotion,
  wait,
  waitForAnimationFrame,
} from 'shared/animation.ts'

const activeTransitions = new WeakMap<Element, object>()

/**
 * Begin a transition on `element`, superseding any in-flight one; a
 * superseded transition loses ownership of the element's classes.
 */
function beginTransition(element: Element): object {
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

/**
 * Swap the element's text with an exit → enter class transition. No-ops for
 * identical text (but supersedes any in-flight transition), and swaps
 * directly when the element has no existing content to animate out.
 */
async function setTextWithSwapAnimation(element: Element, text: string): Promise<void> {
  const nextText = text ?? ''
  if (element.textContent === nextText) {
    beginTransition(element)
    element.classList.remove('is-exit', 'is-enter-start')
    return
  }
  if (!element.textContent) {
    element.textContent = nextText
    return
  }

  await runSwapTransition(element, {
    durationVar: 'textSwap',
    fallbackDurationMs: 150,
    swap: () => {
      element.textContent = nextText
    },
  })
}

export type SearchJournalMotion = 'forward' | 'backward' | 'replace'

export async function updateSearchMessage(
  element: Element,
  text: string,
  options?: { loading?: boolean },
): Promise<void> {
  if (options?.loading) {
    element.classList.add('loading-dots')
  }
  else {
    element.classList.remove('loading-dots')
  }
  await setTextWithSwapAnimation(element, text)
}

export async function transitionSearchJournalResults(
  journal: HTMLElement | null,
  motion: SearchJournalMotion,
  updateContent: () => void | Promise<void>,
): Promise<boolean> {
  if (!journal) {
    await updateContent()
    return true
  }

  journal.dataset.journalMotion = motion

  const committed = await runSwapTransition(journal, {
    durationVar: 'searchJournalDrawer',
    fallbackDurationMs: 260,
    transitionClass: 'SearchJournal--drawer',
    shouldRunExit: () => hasVisibleContent(journal),
    waitFrameBetweenSwapAndEnter: true,
    swap: updateContent,
  })

  // The attribute belongs to this transition only when it committed;
  // otherwise a superseding transition owns it.
  if (committed)
    journal.removeAttribute('data-journal-motion')
  return committed
}

function hasVisibleContent(element: Element): boolean {
  return element.querySelector(':scope .container > *') !== null
}
