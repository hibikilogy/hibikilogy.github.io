import type Swup from 'swup'
import type { RouteLocation, RouteModel } from './types.ts'
import { computed, onScopeDispose, readonly, ref, shallowRef } from '@vue/reactivity'
import { Location, updateHistoryRecord } from 'swup'
import { isSearchUrl } from '../../ui/page-transition/index.ts'

function readLocation(url = window.location.href): RouteLocation {
  const resolved = new URL(url, window.location.href)
  return {
    href: resolved.href,
    pathname: resolved.pathname,
    search: resolved.search,
    hash: resolved.hash,
  }
}

// swup tags its history records with `{ source: 'swup', index }`; the index
// starts at 1 for the session's entry page and increments on every in-app
// push, so an index above 1 proves a prior same-site page exists.
function hasSameSiteHistory(): boolean {
  const state = window.history.state as { source?: unknown, index?: unknown } | null
  return state?.source === 'swup' && typeof state.index === 'number' && state.index > 1
}

export function useRoute(swup: Swup): RouteModel {
  const current = shallowRef(readLocation())
  const isNavigating = ref(false)
  const navigationKind = ref<RouteModel['navigationKind']['value']>('initial')
  const isSearchPage = computed(() => isSearchUrl(current.value.href))

  const unregister = [
    swup.hooks.on('visit:start', (visit) => {
      isNavigating.value = true
      navigationKind.value = visit.history.popstate ? 'popstate' : 'navigate'
    }),
    swup.hooks.on('content:replace', (visit) => {
      current.value = readLocation(visit.to.url)
    }),
    swup.hooks.on('visit:end', () => {
      current.value = readLocation()
      isNavigating.value = false
    }),
    swup.hooks.on('visit:abort', () => {
      current.value = readLocation()
      isNavigating.value = false
    }),
  ]

  const handleHashChange = (): void => {
    navigationKind.value = 'replace'
    current.value = readLocation()
  }
  window.addEventListener('hashchange', handleHashChange)
  onScopeDispose(() => {
    unregister.forEach(dispose => dispose())
    window.removeEventListener('hashchange', handleHashChange)
  })

  function navigate(url: string): void {
    void swup.navigate(url)
  }

  function preload(url: string): void {
    void swup.preload?.(url, { priority: true })
  }

  function replace(url: string): void {
    updateHistoryRecord(url)
    swup.location = Location.fromUrl(url)
    navigationKind.value = 'replace'
    current.value = readLocation(url)
  }

  function back(fallback = '/'): void {
    if (hasSameSiteHistory()) {
      window.history.back()
      return
    }
    navigate(fallback)
  }

  return {
    current: readonly(current),
    isNavigating: readonly(isNavigating),
    isSearchPage,
    navigationKind: readonly(navigationKind),
    preload,
    navigate,
    replace,
    back,
  }
}
