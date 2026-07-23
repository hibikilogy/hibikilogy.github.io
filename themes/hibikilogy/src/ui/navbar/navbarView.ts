import type { NavbarViewState } from './types.ts'
import { navbarDom } from './config.ts'

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
}
