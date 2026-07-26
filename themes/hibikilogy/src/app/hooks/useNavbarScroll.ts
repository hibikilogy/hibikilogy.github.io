import type { ScrollModel } from './types.ts'
import { onScopeDispose, readonly, ref, watch } from '@vue/reactivity'
import { useEventListener } from '../../shared/hooks/index.ts'
import { navbarDom } from '../../ui/navbar/index.ts'

const CSS_DIRECTION_PROPERTY = '--joh-scroll-direction'

export function useNavbarScroll(root: ParentNode, scroll: ScrollModel) {
  const navbar = root.querySelector<HTMLElement>(navbarDom.root)
  const postHero = document.body.classList.contains('post')
    ? root.querySelector<HTMLElement>('.Hero')
    : null
  const scrollingDown = ref(false)
  const postHeroPassed = ref(!postHero)
  const nativePostHeroBackground = typeof CSS !== 'undefined'
    && CSS.supports('animation-timeline: view()')
  let directionProbeFrame = 0
  let nativeDirection: 'pending' | 'supported' | 'unsupported'
    = typeof CSS !== 'undefined' && CSS.supports('container-type: scroll-state')
      ? 'pending'
      : 'unsupported'

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
    syncPostHero(postHero.getBoundingClientRect().bottom)
    syncPostHeroBackground()

    if (typeof IntersectionObserver === 'function') {
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
    if (postHero && typeof IntersectionObserver !== 'function')
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
