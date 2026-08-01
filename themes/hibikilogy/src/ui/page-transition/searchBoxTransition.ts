import { resolveDurationMs, shouldSkipMotion, wait } from 'shared/animation.ts'
import { isMaxTabletViewport } from 'shared/media.ts'
import { pageDom } from 'shared/selectors.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

const CLEAR_GRACE_MS = 20

function shouldHoldSearchOutPhase(): boolean {
  return isMaxTabletViewport() && !shouldSkipMotion()
}

/**
 * Holds the out phase while the search transition is mid-flight: the veil
 * covers the page on enter, the box collapses into the navbar trigger on
 * leave. Returns nothing when the visit does not cross the search boundary.
 */
export function waitForSearchTransition(fromUrl: string, toUrl: string): Promise<void> | undefined {
  const scope = getSearchTransitionScope(fromUrl, toUrl)
  if (scope === 'enter-search')
    return waitForSearchVeilCover()
  if (scope === 'leave-search')
    return waitForSearchBoxExit()
  return undefined
}

// Holds the out phase until the veil covers the page; timed because the cover
// runs on a `body::before` pseudo-element with unreliable animation events.
export async function waitForSearchVeilCover(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  await wait(resolveDurationMs('searchCover') + 30)
}

// Holds the out phase until the box collapses into the navbar trigger; the
// box lives in the swapped container and would vanish with the old page.
export async function waitForSearchBoxExit(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  const box = document.querySelector<HTMLElement>(`${pageDom.search} .SearchShell--page`)
  if (!box)
    return

  const boxMs = resolveDurationMs('searchMorph')
  await new Promise<void>((resolve) => {
    let timer = 0
    const finish = (): void => {
      window.clearTimeout(timer)
      resolve()
    }
    box.addEventListener('animationend', finish, { once: true })
    timer = window.setTimeout(finish, boxMs + 100)
  })
}

// Clears after the veil retracts; the captured scope guards against
// clobbering a newer visit's state.
export function deferClearSearchTransitionState(clear: () => void): void {
  const root = document.documentElement
  const scope = root.dataset.searchTransitionScope ?? null

  window.setTimeout(() => {
    if ((root.dataset.searchTransitionScope ?? null) === scope)
      clear()
  }, resolveDurationMs('searchMorph') + CLEAR_GRACE_MS)
}
