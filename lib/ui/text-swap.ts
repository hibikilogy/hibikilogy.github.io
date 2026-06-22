import { parseCssTime, shouldSkipMotion, wait } from '../shared/animation.ts'

const activeTextSwapTokens = new WeakMap<Element, symbol>()

export async function setTextWithSwapAnimation(element: Element, text: string, options: { durationMs?: number } = {}): Promise<void> {
  if (!element)
    return

  const nextText = text ?? ''
  if (element.textContent === nextText)
    return
  if (!element.textContent) {
    element.textContent = nextText
    return
  }

  const token = Symbol('text-swap')
  activeTextSwapTokens.set(element, token)

  if (element.classList.contains('is-enter-start')) {
    element.classList.remove('is-enter-start')
  }
  element.classList.add('is-exit')
  await wait(getTextSwapDurationMs(element, options))
  if (activeTextSwapTokens.get(element) !== token)
    return

  element.textContent = nextText
  element.classList.remove('is-exit')
  element.classList.add('is-enter-start')
  void (element as HTMLElement).offsetWidth
  if (activeTextSwapTokens.get(element) !== token)
    return
  element.classList.remove('is-enter-start')
}

function getTextSwapDurationMs(element: Element, options: { durationMs?: number }): number {
  if (Number.isFinite(options.durationMs))
    return Math.max(0, options.durationMs || 0)
  if (shouldSkipMotion())
    return 0

  const styles = globalThis.getComputedStyle?.(element)
  const duration = styles?.getPropertyValue('--text-swap-dur') || ''
  return parseCssTime(duration) ?? 150
}
