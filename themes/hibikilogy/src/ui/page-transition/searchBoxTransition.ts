import { resolveDurationMs, shouldSkipMotion, wait } from 'shared/animation.ts'
import { isMaxTabletViewport } from 'shared/media.ts'
import { pageDom } from 'shared/selectors.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

const VEIL_COVER_GRACE_MS = 30
const BOX_EXIT_GRACE_MS = 100

function shouldHoldSearchOutPhase(): boolean {
  return isMaxTabletViewport() && !shouldSkipMotion()
}

// On mobile the cover animation IS the transition, so it always plays. On
// desktop the morph is the transition, and the veil only needs to cover an
// uncached page while it loads underneath.
function shouldHoldSearchVeilCover(isCached: boolean): boolean {
  return !shouldSkipMotion() && (isMaxTabletViewport() || !isCached)
}

export function shouldDisableNativeTransition(fromUrl: string, toUrl: string): boolean {
  return getSearchTransitionScope(fromUrl, toUrl) === 'enter-search' && isMaxTabletViewport()
}

export function waitForSearchTransition(
  fromUrl: string,
  toUrl: string,
  isCached: boolean,
  hasNativeTransition: boolean,
): Promise<void> | undefined {
  const scope = getSearchTransitionScope(fromUrl, toUrl)
  if (scope === 'enter-search')
    return waitForSearchVeilCover(isCached)
  if (scope === 'leave-search' && !hasNativeTransition)
    return waitForSearchBoxExit()
  return undefined
}

export async function waitForSearchVeilCover(isCached: boolean): Promise<void> {
  if (!shouldHoldSearchVeilCover(isCached))
    return

  // Desktop covers via the `--duration-search-transition` transition, mobile
  // via the `--duration-search-cover` keyframe animation.
  const duration = isMaxTabletViewport() ? 'searchCover' : 'searchTransition'
  await wait(resolveDurationMs(duration) + VEIL_COVER_GRACE_MS)
}

export async function waitForSearchBoxExit(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  const box = document.querySelector<HTMLElement>(`${pageDom.search} .SearchShell--page`)
  if (!box)
    return

  const boxMs = resolveDurationMs('searchMorph')
  await waitForNamedAnimation(box, 'search-box-morph-out', boxMs + BOX_EXIT_GRACE_MS)
}

function waitForNamedAnimation(
  element: HTMLElement,
  animationName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let timer = 0
    function finish(): void {
      window.clearTimeout(timer)
      element.removeEventListener('animationend', onAnimationEnd)
      resolve()
    }
    function onAnimationEnd(event: AnimationEvent): void {
      if (event.animationName === animationName)
        finish()
    }
    element.addEventListener('animationend', onAnimationEnd)
    timer = window.setTimeout(finish, timeoutMs)
  })
}
