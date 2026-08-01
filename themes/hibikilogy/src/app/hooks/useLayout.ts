import type { LayoutModel, RouteModel } from './types.ts'
import { onScopeDispose, readonly, ref, watch } from '@vue/reactivity'
import { shouldIgnoreKeyEvent } from 'shared/keyboard.ts'
import { useEventListener } from 'shared/useEventListener.ts'
import { navbarDom, syncNavbarView } from '../../ui/navbar/index.ts'
import { useNavbarScroll } from './useNavbarScroll.ts'
import { useScroll } from './useScroll.ts'

export function useLayout(root: ParentNode, route: RouteModel): LayoutModel {
  const navbarOpen = ref(false)
  const scroll = useScroll(window, { directionTolerance: 6 })
  const { scrollingDown, postHeroPassed } = useNavbarScroll(root, scroll)

  const syncView = (): void => {
    syncNavbarView(root, {
      open: navbarOpen.value,
      top: scroll.atTop.value,
      searchPage: route.isSearchPage.value,
      scrollingDown: scrollingDown.value,
      postHeroPassed: postHeroPassed.value,
    })
  }
  syncView()
  const stopViewSync = watch(
    [navbarOpen, scroll.atTop, route.isSearchPage, scrollingDown, postHeroPassed],
    syncView,
  )

  onScopeDispose(stopViewSync)

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
    if (shouldIgnoreKeyEvent(event))
      return

    if (event.key === 'Escape' && navbarOpen.value) {
      event.preventDefault()
      navbarOpen.value = false
    }
  })

  root.querySelectorAll<HTMLSelectElement>(navbarDom.sorting).forEach((select) => {
    useEventListener(select, 'change', () => route.navigate(`/${select.value}`))
  })

  return {
    navbarOpen: readonly(navbarOpen),
    atTop: scroll.atTop,
    toggleNavbar: () => {
      navbarOpen.value = !navbarOpen.value
    },
    closeNavbar: () => {
      navbarOpen.value = false
    },
  }
}
