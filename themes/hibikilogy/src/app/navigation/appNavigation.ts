import type { AppContext, PageContext } from 'app/types.ts'
import type Swup from 'swup'
import type { Visit as SwupVisit } from 'swup'
import { onScopeDispose } from '@vue/reactivity'
import { mountPageModules } from 'app/page-modules/index.ts'
import { createPageContext } from 'app/pageContext.ts'
import { pageDom } from 'shared/selectors.ts'
import { Location } from 'swup'
import {
  markOverlaySettling,
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
  // 上一次访问被中断（快速连续导航）：新访问改为瞬间交换，避免把上一页的
  // 状态交叉淡化进新页造成闪页。
  let interrupted = false
  // 当前访问是否已替换过内容：滚动兜底只对真正渲染的访问生效，被中断的
  // 访问不再把 hold 中的旧页滚回顶部。
  let contentReplaced = false

  function isPageEnterRunning(): boolean {
    const { getAnimations } = document as Document & { getAnimations?: () => Animation[] }
    if (!getAnimations)
      return false
    // Call with the document receiver: DOM methods throw "Illegal invocation"
    // when invoked unbound.
    return getAnimations.call(document).some(
      animation => (animation as CSSAnimation).animationName === 'page-enter'
        && animation.playState !== 'finished'
        && animation.playState !== 'idle',
    )
  }

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
    // 中断后的访问直接交换：页面入场动画还在跑或上一次访问被中止时，交叉
    // 淡化会把上一页（半透明/刚被弹全显的状态）叠进新页。
    if (interrupted || isPageEnterRunning())
      visit.animation.native = false
    interrupted = false
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
    // 上一页的入场动画在加载 hold 期间自然播完（visit:start 不再打断它，
    // 避免页面突然弹成全显）；替换时移除再重设属性，让新页重新起动画。
    markOverlaySettling()
    stopPageEnter()
    startPageEnter()
    initializePage()
    contentReplaced = true
  }

  function onVisitEnd(visit: SwupVisit): void {
    titles.finish(visit)
    // 无论标题过渡是否接管，都要收尾搜索过渡状态；否则 `data-search-overlay`
    // 会残留为 active，幕布与搜索框动画状态无法复原。
    settleTransitionState()
    // 兜底：swup 的滚动复位偶发未生效（访问中断等路径），保证普通访问结束后
    // 页面回到顶部，导航栏回到透明的初始状态；popstate 访问保留插件恢复的
    // 滚动。被中断的访问（未渲染内容）跳过，避免把 hold 中的旧页滚回顶部。
    if (!visit.history.popstate && contentReplaced)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    contentReplaced = false
  }

  function onVisitAbort(visit: SwupVisit): void {
    interrupted = true
    onVisitEnd(visit)
  }

  // --- 钩子接线与清理 ---

  const unregister = [
    swup.hooks.on('visit:start', onVisitStart),
    swup.hooks.before('visit:transition', onVisitTransition),
    swup.hooks.before('animation:out:await', onHoldOutPhase),
    swup.hooks.before('content:replace', onBeforeContentReplace),
    swup.hooks.on('content:replace', onContentReplace),
    swup.hooks.on('visit:end', onVisitEnd),
    swup.hooks.on('visit:abort', onVisitAbort),
  ]

  onScopeDispose(() => unregister.forEach(dispose => dispose()))

  initializePage()
}
