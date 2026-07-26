import type { PostTitleTransitionPreparation } from '../ui/post-title-transition/index.ts'
import type { PageContext } from './types.ts'
import { createSwup } from '../infrastructure/swup/index.ts'
import { pageDom } from '../shared/dom.ts'
import {
  clearTransitionState,
  setTransitionState,
} from '../ui/page-transition/index.ts'
import {
  beginPostTitleTransition,
  playPostTitleExitAnimation,
  preloadPostTitleTransition,
  renderPostTitleTransitionTarget,
  resolvePostTitleTransitionTarget,
} from '../ui/post-title-transition/index.ts'
import { createAppContext } from './appContext.ts'
import { mountPageModules } from './page-modules/index.ts'
import { createPageContext } from './pageContext.ts'

// Runs cleanup on the final page unload. Not a once-listener: bfcache
// round-trips fire persisted `pagehide` events first, and a once-listener
// would be consumed by one of those before the real unload happens.
export function onFinalPageHide(cleanup: () => void): void {
  window.addEventListener('pagehide', (event) => {
    if (event.persisted)
      return

    cleanup()
  })
}

export function stopPageEnter(root: HTMLElement = document.documentElement): void {
  root.removeAttribute('data-page-enter')
}

export function startPageEnter(root: HTMLElement = document.documentElement): void {
  root.dataset.pageEnter = 'navigation'
}

export function startApp(): void {
  const swup = createSwup()
  const app = createAppContext(swup)
  const postTitlePreparations = new Map<number, PostTitleTransitionPreparation>()
  let activePostTitleVisitId: number | null = null
  let page: PageContext | null = null

  const preloadTitle = (event: Event): void => {
    preloadPostTitleTransition(event.target as Element | undefined)
  }
  document.addEventListener('pointerover', preloadTitle, { passive: true })
  document.addEventListener('focusin', preloadTitle)

  function initializePage(): void {
    page?.dispose()
    page = null
    normalizeTrailingSlash()

    const root = document.querySelector<HTMLElement>(pageDom.app)
    if (!root)
      return

    const nextPage = createPageContext(app, root)
    page = nextPage
    renderPostTitleTransitionTarget()
    nextPage.run(() => mountPageModules(app, nextPage))
  }

  function normalizeTrailingSlash(): void {
    const { pathname, search, hash } = window.location
    if (pathname.length <= 1 || !pathname.endsWith('/'))
      return

    app.route.replace(pathname.replace(/\/+$/, '') + search + hash)
  }

  function finishPostTitleVisit(visit: { id: number }): void {
    const preparation = postTitlePreparations.get(visit.id)
    if (!preparation)
      return

    preparation.cancel()
    postTitlePreparations.delete(visit.id)
    if (activePostTitleVisitId !== visit.id)
      return

    activePostTitleVisitId = null
    clearTransitionState()
  }

  swup.hooks.on('visit:start', (visit) => {
    stopPageEnter()
    page?.layout.closeNavbar()
    setTransitionState(visit.from.url, visit.to.url)

    const preparation = beginPostTitleTransition({
      trigger: visit.trigger.el,
    })
    postTitlePreparations.set(visit.id, preparation)
    activePostTitleVisitId = visit.id
    if (preparation.waitForTarget)
      visit.animation.wait = true
  })

  swup.hooks.before('visit:transition', async (visit) => {
    const preparation = postTitlePreparations.get(visit.id)
    if (
      !preparation
      || !(await preparation.ready)
      || postTitlePreparations.get(visit.id) !== preparation
    ) {
      return
    }

    resolvePostTitleTransitionTarget(visit.to.document)
    await playPostTitleExitAnimation()
  })

  swup.hooks.before('content:replace', async (visit) => {
    const preparation = postTitlePreparations.get(visit.id)
    if (
      !preparation
      || !(await preparation.ready)
      || postTitlePreparations.get(visit.id) !== preparation
    ) {
      return
    }

    resolvePostTitleTransitionTarget(visit.to.document)
  })

  swup.hooks.on('content:replace', () => {
    startPageEnter()
    initializePage()
  })
  swup.hooks.on('visit:end', finishPostTitleVisit)
  swup.hooks.on('visit:abort', finishPostTitleVisit)

  onFinalPageHide(() => {
    page?.dispose()
    document.removeEventListener('pointerover', preloadTitle)
    document.removeEventListener('focusin', preloadTitle)
    app.dispose()
  })

  initializePage()
}
