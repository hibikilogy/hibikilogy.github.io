import type { LayoutModel, RouteModel } from './types.ts'
import { computed, onScopeDispose, readonly, ref, watch } from '@vue/reactivity'
import { useEventListener } from '../../shared/hooks/index.ts'
import { navbarDom, syncNavbarView } from '../../ui/navbar/index.ts'

export function useLayout(root: ParentNode, route: RouteModel): LayoutModel {
  const navbarOpen = ref(false)
  const scrollY = ref(window.scrollY || document.documentElement.scrollTop)
  const atTop = computed(() => scrollY.value === 0)

  const syncView = (): void => {
    syncNavbarView(root, {
      open: navbarOpen.value,
      top: atTop.value,
      searchPage: route.isSearchPage.value,
    })
  }
  syncView()
  const stopViewSync = watch(
    [navbarOpen, atTop, route.isSearchPage],
    syncView,
  )

  onScopeDispose(stopViewSync)
  useEventListener(window, 'scroll', () => {
    scrollY.value = window.scrollY || document.documentElement.scrollTop
  }, { passive: true })

  const hamburger = root.querySelector<HTMLButtonElement>(navbarDom.hamburger)
  if (hamburger) {
    useEventListener(hamburger, 'click', () => {
      if (route.isSearchPage.value) {
        route.back('/')
        return
      }
      navbarOpen.value = !navbarOpen.value
    })
  }

  const navScreen = root.querySelector<HTMLElement>(navbarDom.screen)
  if (navScreen) {
    useEventListener(navScreen, 'click', (event) => {
      const target = event.target as Element | null
      if (target?.closest(navbarDom.link) || target?.closest(navbarDom.close))
        navbarOpen.value = false
    })
  }

  useEventListener(document, 'keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || event.altKey)
      return

    if (event.key === 'Escape' && navbarOpen.value) {
      event.preventDefault()
      navbarOpen.value = false
    }
  })

  // Refresh the velocity-proportional panel rate while the navscreen is open.
  useEventListener(window, 'resize', () => {
    if (navbarOpen.value)
      syncView()
  })

  root.querySelectorAll<HTMLSelectElement>(navbarDom.sorting).forEach((select) => {
    useEventListener(select, 'change', () => route.navigate(`/${select.value}`))
  })

  return {
    navbarOpen: readonly(navbarOpen),
    atTop,
    toggleNavbar: () => {
      navbarOpen.value = !navbarOpen.value
    },
    closeNavbar: () => {
      navbarOpen.value = false
    },
  }
}
