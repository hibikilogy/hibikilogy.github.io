import { runSwapTransition } from 'shared/motion.ts'
import { setTextWithSwapAnimation } from 'ui/textSwap.ts'

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
