import { afterEach, describe, expect, it } from 'vitest'
import { syncNavbarView } from './navbarView.ts'

const closedState = {
  open: false,
  top: true,
  searchPage: false,
  scrollingDown: false,
  postHeroPassed: false,
} as const

describe('syncNavbarView', () => {
  afterEach(() => {
    document.documentElement.classList.remove('navscreen-open', 'navscreen-noscroll')
    document.documentElement.style.removeProperty('--navscreen-scrollbar-width')
  })

  it('synchronizes both controls and assigns stable item indices', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <header class="NavBar">
        <button class="NavBarHamburger" aria-expanded="false"></button>
        <div id="NavScreen" class="NavScreen">
          <nav class="NavScreenMenu">
            <a href="/one">One</a>
            <a href="/two">Two</a>
          </nav>
          <button class="NavScreenClose" aria-expanded="false"></button>
        </div>
      </header>
    `

    syncNavbarView(root, { ...closedState, open: true })

    const screen = root.querySelector<HTMLElement>('.NavScreen')
    const close = root.querySelector<HTMLButtonElement>('.NavScreenClose')
    expect(root.querySelector('.NavBarHamburger')?.getAttribute('aria-expanded')).toBe('true')
    expect(close?.getAttribute('aria-expanded')).toBe('true')
    expect(close?.classList.contains('open')).toBe(true)
    expect(screen?.classList.contains('open')).toBe(true)
    expect(document.documentElement.classList.contains('navscreen-open')).toBe(true)
    expect(document.documentElement.classList.contains('navscreen-noscroll')).toBe(true)
    expect(
      screen
        ?.querySelector<HTMLElement>('.NavScreenMenu > :first-child')
        ?.style
        .getPropertyValue('--navscreen-item-index'),
    ).toBe('0')
    expect(close?.style.getPropertyValue('--navscreen-item-index')).toBe('2')

    syncNavbarView(root, closedState)

    expect(root.querySelector('.NavBarHamburger')?.getAttribute('aria-expanded')).toBe('false')
    expect(close?.getAttribute('aria-expanded')).toBe('false')
    expect(close?.classList.contains('open')).toBe(false)
    expect(screen?.classList.contains('open')).toBe(false)
    expect(document.documentElement.classList.contains('navscreen-open')).toBe(false)
    expect(document.documentElement.classList.contains('navscreen-noscroll')).toBe(false)
  })
})
