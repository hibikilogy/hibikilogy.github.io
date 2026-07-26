import type { NavbarViewState } from './types.ts'
import { navbarDom } from './config.ts'

function syncNavScreenItems(screen: HTMLElement): void {
  const menu = screen.querySelector<HTMLElement>('.NavScreenMenu')
  const items = menu ? Array.from(menu.children) : []
  items.forEach((item, index) => {
    if (item instanceof HTMLElement)
      item.style.setProperty('--navscreen-item-index', String(index))
  })
  // The close button cascades as the final item: enters last, exits first.
  screen.querySelector<HTMLElement>(navbarDom.close)
    ?.style
    .setProperty('--navscreen-item-index', String(items.length))
}

function syncNavScreenScrollLock(open: boolean): void {
  const root = document.documentElement
  if (open) {
    const scrollbarWidth = Math.max(window.innerWidth - root.clientWidth, 0)
    root.style.setProperty('--navscreen-scrollbar-width', `${scrollbarWidth}px`)
    root.classList.add('navscreen-noscroll')
  }
  else {
    root.classList.remove('navscreen-noscroll')
    root.style.removeProperty('--navscreen-scrollbar-width')
  }
}

export function syncNavbarView(root: ParentNode, state: NavbarViewState): void {
  const navbar = root.querySelector<HTMLElement>(navbarDom.root)
  const hamburger = root.querySelector<HTMLButtonElement>(navbarDom.hamburger)
  const screen = root.querySelector<HTMLElement>(navbarDom.screen)
  const close = screen?.querySelector<HTMLButtonElement>(navbarDom.close)

  navbar?.classList.toggle('open', state.open)
  navbar?.classList.toggle('top', state.top)
  navbar?.classList.toggle('scrolling-down', state.scrollingDown)
  navbar?.classList.toggle('post-hero-passed', state.postHeroPassed)
  hamburger?.classList.toggle('open', state.open || state.searchPage)
  hamburger?.classList.toggle('top', state.top)
  hamburger?.setAttribute('aria-expanded', String(state.open))
  screen?.classList.toggle('open', state.open)
  screen?.classList.toggle('top', state.top)
  close?.classList.toggle('open', state.open)
  close?.setAttribute('aria-expanded', String(state.open))

  if (screen && state.open)
    syncNavScreenItems(screen)
  syncNavScreenScrollLock(state.open)
  document.documentElement.classList.toggle('navscreen-open', state.open)
}
