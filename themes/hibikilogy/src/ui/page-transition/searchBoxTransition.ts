import { resolveDurationMs, shouldSkipMotion, wait } from 'shared/animation.ts'
import { isMaxTabletViewport } from 'shared/media.ts'
import { pageDom } from 'shared/selectors.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

const CLEAR_GRACE_MS = 20
const VEIL_COVER_GRACE_MS = 30
const BOX_EXIT_GRACE_MS = 100

function shouldHoldSearchOutPhase(): boolean {
  return isMaxTabletViewport() && !shouldSkipMotion()
}

export function shouldDisableNativeTransition(fromUrl: string, toUrl: string): boolean {
  return getSearchTransitionScope(fromUrl, toUrl) !== null && isMaxTabletViewport()
}

export function waitForSearchTransition(fromUrl: string, toUrl: string): Promise<void> | undefined {
  const scope = getSearchTransitionScope(fromUrl, toUrl)
  if (scope === 'enter-search')
    return waitForSearchVeilCover()
  if (scope === 'leave-search')
    return waitForSearchBoxExit()
  return undefined
}

export async function waitForSearchVeilCover(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  await wait(resolveDurationMs('searchCover') + VEIL_COVER_GRACE_MS)
}

export async function waitForSearchBoxExit(): Promise<void> {
  if (!shouldHoldSearchOutPhase())
    return

  const veilCover = wait(resolveDurationMs('searchCover') + VEIL_COVER_GRACE_MS)
  const box = document.querySelector<HTMLElement>(`${pageDom.search} .SearchShell--page`)
  if (!box) {
    await veilCover
    return
  }

  const boxMs = resolveDurationMs('searchMorph')
  const boxExit = new Promise<void>((resolve) => {
    let timer = 0
    const finish = (): void => {
      window.clearTimeout(timer)
      resolve()
    }
    box.addEventListener('animationend', finish, { once: true })
    timer = window.setTimeout(finish, boxMs + BOX_EXIT_GRACE_MS)
  })

  await Promise.all([boxExit, veilCover])
}

export function deferClearSearchTransitionState(clear: () => void): void {
  const root = document.documentElement
  const scope = root.dataset.searchTransitionScope ?? null

  window.setTimeout(() => {
    if ((root.dataset.searchTransitionScope ?? null) === scope)
      clear()
  }, resolveDurationMs('searchVeil') + CLEAR_GRACE_MS)
}
