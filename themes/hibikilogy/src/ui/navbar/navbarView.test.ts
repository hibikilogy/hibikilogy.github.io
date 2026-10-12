import { afterEach, describe, expect, it } from 'vitest'
import { syncNavbarView } from './navbarView.ts'

const closedState = {
  open: false,
  top: true,
  searchPage: false,
  scrollingDown: false,
  postHeroPassed: false,
} as const

function mountNavbar(): HTMLElement {
  const root = document.createElement('main')
  root.innerHTML = `
    <header class="NavBar">
      <button class="NavBarHamburger" aria-expanded="false"></button>
      <div id="NavScreen" class="NavScreen">
        <nav class="NavScreenMenu"><a href="/one">One</a></nav>
        <button class="NavScreenClose" aria-expanded="false"></button>
      </div>
    </header>
  `
  document.body.append(root)
  return root
}

function hamburger(root: ParentNode): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>('.NavBarHamburger')!
}

afterEach(() => {
  document.body.replaceChildren()
  document.documentElement.classList.remove('navscreen-noscroll')
  document.documentElement.style.removeProperty('--navscreen-scrollbar-width')
})

describe('syncNavbarView', () => {
  it('reflects the open state in both controls and the scroll lock', () => {
    const root = mountNavbar()

    syncNavbarView(root, { ...closedState, open: true })

    expect(hamburger(root).getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelector('.NavScreenClose')?.getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelector('.NavScreen')?.classList.contains('open')).toBe(true)
    expect(document.documentElement.classList.contains('navscreen-noscroll')).toBe(true)

    syncNavbarView(root, closedState)

    expect(hamburger(root).getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('.NavScreenClose')?.getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('.NavScreen')?.classList.contains('open')).toBe(false)
    expect(document.documentElement.classList.contains('navscreen-noscroll')).toBe(false)
  })

  it('opens the hamburger for the search page without opening the navbar', () => {
    const root = mountNavbar()

    syncNavbarView(root, { ...closedState, searchPage: true })

    expect(hamburger(root).classList.contains('open')).toBe(true)
    expect(hamburger(root).getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('.NavBar')?.classList.contains('open')).toBe(false)
    expect(root.querySelector('.NavScreen')?.classList.contains('open')).toBe(false)
  })
})
