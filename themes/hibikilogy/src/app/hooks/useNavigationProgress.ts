import type Swup from 'swup'
import type { FetchLatencyMonitor } from '../../infrastructure/network/index.ts'
import { onScopeDispose } from '@vue/reactivity'
import NProgress from 'nprogress'
import { Location } from 'swup'

export const NAVIGATION_PROGRESS_FALLBACK_DELAY_MS = 700

export interface NavigationProgressOptions {
  fallbackDelayMs?: number
  onStart: () => void
  onDone: () => void
}

export interface NavigationProgress {
  onVisitStart: (state: { cached: boolean, slow: boolean }) => void
  onTransitionStart: () => void
  onSettle: () => void
}

// Shows only for uncached pages when the network is measured slow (or turns out slow).
export function createNavigationProgress({
  fallbackDelayMs = NAVIGATION_PROGRESS_FALLBACK_DELAY_MS,
  onStart,
  onDone,
}: NavigationProgressOptions): NavigationProgress {
  let timer: ReturnType<typeof setTimeout> | null = null
  let started = false

  function clearTimer(): void {
    if (timer === null)
      return

    clearTimeout(timer)
    timer = null
  }

  function start(): void {
    clearTimer()
    if (started)
      return

    started = true
    onStart()
  }

  function finish(): void {
    clearTimer()
    if (!started)
      return

    started = false
    onDone()
  }

  return {
    onVisitStart({ cached, slow }) {
      clearTimer()
      if (cached)
        return

      if (slow) {
        start()
        return
      }

      timer = setTimeout(start, fallbackDelayMs)
    },
    onTransitionStart() {
      finish()
    },
    onSettle() {
      finish()
    },
  }
}

export function useNavigationProgress(swup: Swup, monitor: FetchLatencyMonitor): void {
  NProgress.configure({ showSpinner: false, minimum: 0.1, trickleSpeed: 200 })

  const progress = createNavigationProgress({
    onStart: () => NProgress.start(),
    // done(true) completes the bar first so the finish flash is visible.
    onDone: () => NProgress.done(true),
  })

  const unregister = [
    swup.hooks.on('visit:start', (visit) => {
      const url = Location.fromUrl(visit.to.url).url
      progress.onVisitStart({ cached: swup.cache.has(url), slow: monitor.isSlow() })
    }),
    // Below swup's own handlers so the bar hits 100% before the exit animation.
    swup.hooks.before('visit:transition', () => progress.onTransitionStart(), { priority: -100 }),
    swup.hooks.on('content:replace', () => progress.onTransitionStart()),
    swup.hooks.on('visit:abort', () => progress.onSettle()),
    swup.hooks.on('fetch:error', () => progress.onSettle()),
    swup.hooks.on('fetch:timeout', () => progress.onSettle()),
  ]
  onScopeDispose(() => unregister.forEach(dispose => dispose()))
}
