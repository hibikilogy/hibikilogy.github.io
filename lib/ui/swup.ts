import SwupBodyClassPlugin from '@swup/body-class-plugin'
import SwupGaPlugin from '@swup/ga-plugin'
import SwupHeadPlugin from '@swup/head-plugin'
import SwupScrollPlugin from '@swup/scroll-plugin'
import Swup from 'swup'
import { HIBIKILOGY_CONFIG } from '../config-env.generated.ts'

export function createSwup(): Swup {
  const gaId = HIBIKILOGY_CONFIG.analyticsGoogle
  const swup = new Swup({
    containers: ['#app'],
    native: true,
    cache: true,
    animateHistoryBrowsing: true,
    animationSelector: false,
    linkSelector: 'a[href]:not([target="_blank"]):not([download]):not([href^="#"]):not([href^="mailto:"]):not([href^="tel:"]):not([href^="javascript:"])',
    ignoreVisit: (url, { el } = {}) => {
      if (el?.closest('[data-no-swup]'))
        return true

      const targetUrl = new URL(url, window.location.href)
      return targetUrl.origin !== window.location.origin
    },
  })

  swup.use(new SwupHeadPlugin({
    persistAssets: true,
    awaitAssets: false,
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
