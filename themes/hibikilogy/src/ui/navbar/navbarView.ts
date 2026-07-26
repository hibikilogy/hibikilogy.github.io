import type { NavbarViewState } from './types.ts'
import { shouldSkipMotion } from '../../shared/animation.ts'
import { navbarDom } from './config.ts'

const NAVSCREEN_RATE_MIN_MS = 240
const NAVSCREEN_RATE_MAX_MS = 480

function navscreenRateMs(): number {
  return Math.min(Math.max(window.innerHeight / 2, NAVSCREEN_RATE_MIN_MS), NAVSCREEN_RATE_MAX_MS)
}

function syncNavScreenMotion(screen: HTMLElement): void {
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
  screen.style.setProperty('--navscreen-item-total', String(items.length))
  // The search-page footer flourish consumes the total as well.
  document.documentElement.style.setProperty('--navscreen-item-total', String(items.length))
  if (!shouldSkipMotion())
    screen.style.setProperty('--navscreen-rate', `${navscreenRateMs()}ms`)
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

  navbar?.classList.toggle('open', state.open)
  navbar?.classList.toggle('top', state.top)
  hamburger?.classList.toggle('open', state.open || state.searchPage)
  hamburger?.classList.toggle('top', state.top)
  hamburger?.setAttribute('aria-expanded', String(state.open))
  screen?.classList.toggle('open', state.open)
  screen?.classList.toggle('top', state.top)
  screen?.querySelector<HTMLElement>(navbarDom.close)
    ?.classList
    .toggle('open', state.open)

  if (screen && state.open)
    syncNavScreenMotion(screen)
  syncNavScreenScrollLock(state.open)
  document.documentElement.classList.toggle('navscreen-open', state.open)
}
