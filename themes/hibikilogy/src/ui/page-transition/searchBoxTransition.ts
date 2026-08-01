import { resolveDurationMs, shouldSkipMotion, wait } from '../../shared/animation.ts'

// Mirrors the --max-tablet breakpoint in styles/lib/media.css.
const MOBILE_MEDIA_QUERY = '(max-width: 719px)'

const CLEAR_GRACE_MS = 20

export function isMobileSearchBoxTransition(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

function shouldHoldSearchOutPhase(): boolean {
  return isMobileSearchBoxTransition() && !shouldSkipMotion()
}

/**
 * Holds the swup out phase until the search veil has covered the page (its
 * cover stage runs at `--duration-search-cover`). Waits on a timer because
 * the cover animation runs on the `body::before` pseudo-element, whose
 * animation events are not reliably dispatched to the host element.
 */
export async function waitForSearchVeilCover(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  await wait(resolveDurationMs('searchCover') + 30)
}

/**
 * Holds the swup out phase until the mobile search box finishes collapsing
 * into the navbar trigger; the box lives in the swapped container and would
 * otherwise be removed a frame after `is-leaving`.
 */
export async function waitForSearchBoxExit(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  const box = document.querySelector<HTMLElement>('#search .SearchShell--page')
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

/**
 * Clears the search transition state after the veil's retract animation has
 * finished; clearing right at `visit:end` would snap the veil back. The
 * captured scope guards against clobbering a newer visit's state when the
 * clear is deferred.
 */
export function deferClearSearchTransitionState(clear: () => void): void {
  const root = document.documentElement
  const scope = root.dataset.searchTransitionScope ?? null

  window.setTimeout(() => {
    if ((root.dataset.searchTransitionScope ?? null) === scope)
      clear()
  }, resolveDurationMs('searchMorph') + CLEAR_GRACE_MS)
}
