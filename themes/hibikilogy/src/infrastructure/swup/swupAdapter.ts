import SwupBodyClassPlugin from '@swup/body-class-plugin'
import SwupGaPlugin from '@swup/ga-plugin'
import SwupHeadPlugin from '@swup/head-plugin'
import SwupScrollPlugin from '@swup/scroll-plugin'
import Swup from 'swup'
import { HIBIKILOGY_CONFIG } from 'virtual:hibikilogy-config'
import { LruPageCache } from './lruPageCache.ts'
import { isPageNavigationUrl, isSamePageHashNavigation } from './navigationRules.ts'

export function createSwup(): Swup {
  const gaId = HIBIKILOGY_CONFIG.analyticsGoogle
  const swup = new Swup({
    containers: ['#app'],
    native: true,
    cache: true,
    animateHistoryBrowsing: true,
    animationSelector: false,
    // Uncached visits hold the transition until content arrives
    // (`visit.animation.wait`); a hung fetch must fall back to a native load
    // instead of stalling the page forever.
    timeout: 15_000,
    linkSelector: 'a[href]:not([target="_blank"]):not([download]):not([href^="#"]):not([href^="mailto:"]):not([href^="tel:"]):not([href^="javascript:"])',
    ignoreVisit: (url, { el } = {}) => {
      if (el?.closest('[data-no-swup]'))
        return true

      if (isSamePageHashNavigation(url, window.location.href))
        return true

      return !isPageNavigationUrl(url, window.location.href)
    },
  })

  // Replace swup's unbounded cache with the LRU-backed equivalent (cast: the
  // class is not exported and the field is typed readonly).
  ;(swup as unknown as { cache: LruPageCache }).cache = new LruPageCache(swup)

  swup.use(new SwupHeadPlugin({
    persistAssets: true,
    awaitAssets: true,
  }))

  swup.use(new SwupGaPlugin({ gaMeasurementId: gaId }))

  swup.use(new SwupBodyClassPlugin())

  swup.use(new SwupScrollPlugin({
    shouldResetScrollPosition: () => true,
    animateScroll: {
      betweenPages: false,
      samePageWithHash: false,
      samePage: false,
    },
  }))

  return swup
}
