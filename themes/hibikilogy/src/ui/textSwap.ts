import { beginTransition, runSwapTransition } from '../shared/motion.ts'

/**
 * Swap the element's text with an exit → enter class transition. No-ops for
 * identical text (but supersedes any in-flight transition), and swaps
 * directly when the element has no existing content to animate out.
 */
export async function setTextWithSwapAnimation(element: Element, text: string): Promise<void> {
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
