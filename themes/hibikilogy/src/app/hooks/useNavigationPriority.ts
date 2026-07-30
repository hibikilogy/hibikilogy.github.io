import type Swup from 'swup'
import type { FetchLatencyMonitor } from '../../infrastructure/network/index.ts'
import type { PagePreloader } from '../../infrastructure/swup/index.ts'
import { onScopeDispose } from '@vue/reactivity'
import { Location } from 'swup'

export function useNavigationPriority(swup: Swup, monitor: FetchLatencyMonitor, preloader: PagePreloader): void {
  const inFlightPreloads = new Map<string, AbortController>()
  let navigationUrl: string | null = null

  const unregister = [
    swup.hooks.replace('fetch:request', (visit, args) => {
      const { url } = args
      const isNavigation = navigationUrl !== null && url === navigationUrl

      // Chain upstream timeout into our controller so preloads stay abortable.
      const controller = new AbortController()
      const upstream = args.options.signal
      if (upstream) {
        if (upstream.aborted) {
          controller.abort(upstream.reason)
        }
        else {
          upstream.addEventListener('abort', () => controller.abort(upstream.reason), { once: true })
        }
      }

      if (!isNavigation)
        inFlightPreloads.set(url, controller)

      const startedAt = performance.now()
      // Three tiers: navigation > user-intent preloads (hover/touch/focus)
      // > background viewport preloads.
      const priority: RequestInit['priority'] = isNavigation
        ? 'high'
        : preloader.isPriorityPreload(url) ? 'auto' : 'low'
      const init: RequestInit = {
        ...args.options,
        signal: controller.signal,
        priority,
      }
      return fetch(url, init)
        .then((response) => {
          // Fail non-OK responses so navigations fall back to native load.
          if (!response.ok) {
            void swup.hooks.call('fetch:error', visit, { url, status: response.status, response })
            throw Object.assign(new Error(`Request failed (${response.status}): ${url}`), {
              name: 'FetchError',
              status: response.status,
            })
          }
          return response
        })
        .finally(() => {
          inFlightPreloads.delete(url)
          if (isNavigation || !controller.signal.aborted)
            monitor.record(performance.now() - startedAt)
        })
    }),
    swup.hooks.on('visit:start', (visit) => {
      const url = Location.fromUrl(visit.to.url).url
      navigationUrl = url
      if (swup.cache.has(url))
        return

      visit.animation.wait = true

      // Keep the target's own in-flight preload for the navigation to reuse.
      preloader.releaseForNavigation(url)
      for (const [preloadUrl, controller] of inFlightPreloads) {
        if (preloadUrl !== url)
          controller.abort()
      }
    }),
    swup.hooks.on('visit:end', () => {
      navigationUrl = null
    }),
    swup.hooks.on('visit:abort', () => {
      navigationUrl = null
    }),
  ]
  onScopeDispose(() => unregister.forEach(dispose => dispose()))
}
