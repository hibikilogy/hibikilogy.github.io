import type { ScrollModel } from './types.ts'
import { onScopeDispose, readonly, ref, watch } from '@vue/reactivity'
import { supportsIntersectionObserver, supportsScrollStateContainers, supportsViewTimeline } from 'shared/capabilities.ts'
import { pageDom } from 'shared/selectors.ts'
import { useEventListener } from 'shared/useEventListener.ts'
import { navbarDom } from '../../ui/navbar/index.ts'

const CSS_DIRECTION_PROPERTY = '--joh-scroll-direction'

export function useNavbarScroll(root: ParentNode, scroll: ScrollModel) {
  const navbar = root.querySelector<HTMLElement>(navbarDom.root)
  const postHero = document.body.classList.contains('post')
    ? root.querySelector<HTMLElement>(pageDom.hero)
    : null
  const scrollingDown = ref(false)
  const postHeroPassed = ref(!postHero)
  const nativePostHeroBackground = supportsViewTimeline()
  let directionProbeFrame = 0
  let nativeDirection: 'pending' | 'supported' | 'unsupported'
    = supportsScrollStateContainers() ? 'pending' : 'unsupported'

  const syncPostHero = (bottom: number): void => {
    if (bottom <= 0)
      postHeroPassed.value = true
  }

  const syncPostHeroBackground = (): void => {
    if (!navbar || !postHero || nativePostHeroBackground)
      return

    const heroRect = postHero.getBoundingClientRect()
    const progress = heroRect.height > 0
      ? Math.min(Math.max(-heroRect.top / heroRect.height, 0), 1)
      : 1
    navbar.style.setProperty('--post-navbar-background-opacity', `${progress * 100}%`)
    navbar.style.setProperty(
      '--post-navbar-backdrop-saturation',
      `${100 + progress * 80}%`,
    )
    navbar.style.setProperty('--post-navbar-backdrop-blur', `${progress * 20}px`)
  }

  const probeNativeDirection = (): void => {
    if (nativeDirection !== 'pending' || directionProbeFrame)
      return

    // @supports cannot verify that `scrolled` queries execute.
    directionProbeFrame = requestAnimationFrame(() => {
      directionProbeFrame = 0
      const direction = navbar
        ? getComputedStyle(navbar).getPropertyValue(CSS_DIRECTION_PROPERTY).trim()
        : ''
      nativeDirection = direction ? 'supported' : 'unsupported'
      if (nativeDirection === 'supported')
        scrollingDown.value = false
    })
  }

  if (postHero) {
    // 初次同步推迟到 swup 滚动复位之后（content:replace 后约一帧 scrollTo(0,0)），
    // 避免用搜索页残留的滚动位置把 postHeroPassed 误置为 true，导航栏闪白。
    const deferInitialSync = (remaining: number): void => {
      if (remaining > 0) {
        requestAnimationFrame(() => deferInitialSync(remaining - 1))
        return
      }
      syncPostHero(postHero.getBoundingClientRect().bottom)
      syncPostHeroBackground()
    }
    deferInitialSync(2)

    if (supportsIntersectionObserver()) {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry)
          syncPostHero(entry.boundingClientRect.bottom)
      })
      observer.observe(postHero)
      onScopeDispose(() => observer.disconnect())
    }
  }

  const stopScrollSync = watch(scroll.y, (nextScrollY) => {
    if (postHero && nextScrollY === 0)
      postHeroPassed.value = false
    if (nativeDirection !== 'supported')
      scrollingDown.value = nextScrollY > 0 && scroll.directions.bottom
    if (nativeDirection === 'pending')
      probeNativeDirection()
    syncPostHeroBackground()
    if (postHero && !supportsIntersectionObserver())
      syncPostHero(postHero.getBoundingClientRect().bottom)
  })
  onScopeDispose(stopScrollSync)

  useEventListener(window, 'resize', syncPostHeroBackground, { passive: true })
  onScopeDispose(() => cancelAnimationFrame(directionProbeFrame))

  return {
    scrollingDown: readonly(scrollingDown),
    postHeroPassed: readonly(postHeroPassed),
  }
}
