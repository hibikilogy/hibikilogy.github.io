import type { AppContext, PageContext } from 'app/types.ts'
import type Swup from 'swup'
import type { Visit as SwupVisit } from 'swup'
import { onScopeDispose } from '@vue/reactivity'
import { mountPageModules } from 'app/page-modules/index.ts'
import { createPageContext } from 'app/pageContext.ts'
import { pageDom } from 'shared/selectors.ts'
import { Location } from 'swup'
import {
  settleTransitionState,
  setTransitionState,
  shouldDisableNativeTransition,
  waitForSearchTransition,
} from 'ui/page-transition/index.ts'
import { startPageEnter, stopPageEnter } from 'ui/page-transition/pageEnter.ts'
import {
  playPostTitleExitAnimation,
  preloadPostTitleTransition,
  renderPostTitleTransitionTarget,
  setupTitleTransitionCoordinator,
} from 'ui/post-title-transition/index.ts'

export function setupAppNavigation(swup: Swup, app: AppContext): void {
  const titles = setupTitleTransitionCoordinator()
  let page: PageContext | null = null

  function initializePage(): void {
    page?.dispose()
    page = null
    normalizeTrailingSlash()

    const root = document.querySelector<HTMLElement>(pageDom.app)
    if (!root)
      return

    app.scope.run(() => {
      const nextPage = createPageContext(app, root)
      page = nextPage
      renderPostTitleTransitionTarget()
      nextPage.run(() => mountPageModules(app, nextPage))
    })
  }

  function normalizeTrailingSlash(): void {
    const { pathname, search, hash } = window.location
    if (pathname.length <= 1 || !pathname.endsWith('/'))
      return

    app.route.replace(pathname.replace(/\/+$/, '') + search + hash)
  }

  const preloadTitle = (event: Event): void => {
    preloadPostTitleTransition(event.target as Element | undefined)
  }
  document.addEventListener('pointerover', preloadTitle, { passive: true })
  document.addEventListener('focusin', preloadTitle)
  onScopeDispose(() => {
    document.removeEventListener('pointerover', preloadTitle)
    document.removeEventListener('focusin', preloadTitle)
  })

  function onVisitStart(visit: SwupVisit): void {
    stopPageEnter()
    page?.layout.closeNavbar()
    setTransitionState(visit.from.url, visit.to.url)
    if (shouldDisableNativeTransition(visit.from.url, visit.to.url))
      visit.animation.native = false
    titles.begin(visit)
  }

  async function onVisitTransition(visit: SwupVisit): Promise<void> {
    if (!(await titles.awaitIncoming(visit)))
      return
    await playPostTitleExitAnimation()
  }

  function onHoldOutPhase(visit: SwupVisit): Promise<void> | undefined {
    const url = Location.fromUrl(visit.to.url).url
    return waitForSearchTransition(visit.from.url, visit.to.url, swup.cache.has(url))
  }

  async function onBeforeContentReplace(visit: SwupVisit): Promise<void> {
    await titles.awaitIncoming(visit)
  }

  function onContentReplace(): void {
    startPageEnter()
    initializePage()
  }

  function onVisitEnd(visit: SwupVisit): void {
    if (titles.finish(visit))
      settleTransitionState()
  }

  // --- 钩子接线与清理 ---

  const unregister = [
    swup.hooks.on('visit:start', onVisitStart),
    swup.hooks.before('visit:transition', onVisitTransition),
    swup.hooks.before('animation:out:await', onHoldOutPhase),
    swup.hooks.before('content:replace', onBeforeContentReplace),
    swup.hooks.on('content:replace', onContentReplace),
    swup.hooks.on('visit:end', onVisitEnd),
    swup.hooks.on('visit:abort', onVisitEnd),
  ]

  onScopeDispose(() => unregister.forEach(dispose => dispose()))

  initializePage()
}
