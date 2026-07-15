import { parseCssTime, shouldSkipMotion, wait, waitForAutoAnimateFrame } from '../../shared/animation.ts'
import { setTextWithSwapAnimation } from '../../ui/text-swap.ts'

export { setTextWithSwapAnimation }
export type SearchJournalMotion = 'forward' | 'backward' | 'replace'

const activeTransitions = new WeakMap<Element, object>()

export async function updateSearchMessage(
  element: Element,
  text: string,
  options?: { loading?: boolean, durationMs?: number },
): Promise<void> {
  if (options?.loading) {
    element.classList.add('loading-dots')
  }
  else {
    element.classList.remove('loading-dots')
  }
  await setTextWithSwapAnimation(element, text, { durationMs: options?.durationMs })
}

export async function transitionSearchJournalResults(
  journal: Element | null,
  motion: SearchJournalMotion,
  updateContent: () => void | Promise<void>,
): Promise<boolean> {
  if (!journal) {
    await updateContent()
    return false
  }

  const token = {}
  activeTransitions.set(journal, token)
  prepareJournalMotion(journal, motion)

  if (shouldSkipMotion()) {
    await updateContent()
    cleanupJournalMotion(journal, token)
    return activeTransitions.get(journal) === token
  }

  journal.classList.add('SearchJournal--drawer')

  if (hasVisibleContent(journal)) {
    journal.classList.remove('is-enter-start')
    journal.classList.add('is-exit')
    await wait(getSearchJournalDrawerDurationMs(journal))
    if (activeTransitions.get(journal) !== token) {
      cleanupJournalMotion(journal, token)
      return false
    }
  }

  journal.classList.remove('is-exit')
  journal.classList.add('is-enter-start')
  await updateContent()
  if (activeTransitions.get(journal) !== token) {
    cleanupJournalMotion(journal, token)
    return false
  }

  await waitForAutoAnimateFrame()
  if (activeTransitions.get(journal) !== token) {
    cleanupJournalMotion(journal, token)
    return false
  }

  void (journal as HTMLElement).offsetWidth
  journal.classList.remove('is-enter-start')
  cleanupJournalMotion(journal, token)
  return activeTransitions.get(journal) === token
}

// ── private helpers ──────────────────────────────────────────

function prepareJournalMotion(element: Element, motion: SearchJournalMotion): void {
  if (!(element instanceof HTMLElement))
    return

  element.classList.remove('is-exit', 'is-enter-start')
  element.dataset.journalMotion = motion
}

function cleanupJournalMotion(element: Element, token: object): void {
  if (!(element instanceof HTMLElement))
    return
  if (activeTransitions.get(element) !== token)
    return

  element.classList.remove('is-exit', 'is-enter-start')
  element.removeAttribute('data-journal-motion')
}

function hasVisibleContent(element: Element): boolean {
  return element.querySelector(':scope .container > *') !== null
}

function getSearchJournalDrawerDurationMs(element: Element): number {
  const styles = globalThis.getComputedStyle?.(element)
  const duration = styles?.getPropertyValue('--search-journal-drawer-dur') || ''
  return parseCssTime(duration) ?? 260
}
