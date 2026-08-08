import { effectScope } from '@vue/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupOutline } from './outlineController.ts'

// Mirror of templates/components/toc.html; h1/h2 live in `.content-container`.
function mountOutlineDom(): void {
  document.body.innerHTML = `
    <div class="content-container">
      <h1 id="intro">Intro</h1>
      <h2 id="details">Details</h2>
    </div>
    <nav class="AsideOutline">
      <div class="outline-marker"></div>
      <ul>
        <li><a class="outline-link" href="#intro">Intro</a></li>
        <li><a class="outline-link" href="#details">Details</a></li>
      </ul>
    </nav>
  `
}

function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

function setViewport(innerHeight: number, bodyHeight: number): void {
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(document.body, 'offsetHeight', { value: bodyHeight, configurable: true })
}

function setHeadingTop(id: string, top: number): void {
  Object.defineProperty(document.getElementById(id)!, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    }),
  })
}

function marker(): HTMLElement {
  return document.querySelector<HTMLElement>('.outline-marker')!
}

function activeLinks(): string[] {
  return [...document.querySelectorAll<HTMLAnchorElement>('.outline-link.active')]
    .map(link => link.getAttribute('href')!)
}

describe('outlineController', () => {
  let scope: ReturnType<typeof effectScope> | null = null
  let replaceHash: (hash: string | null) => void

  function runOutline(): void {
    scope = effectScope()
    scope.run(() => setupOutline({ replaceHash }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    replaceHash = vi.fn()
    // Run the initial scroll-position sync synchronously instead of on rAF.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    setViewport(800, 2000)
    setScrollY(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    scope?.stop()
    scope = null
    document.body.replaceChildren()
    window.history.replaceState(null, '', '/')
  })

  it('scrolls to the heading for a valid hash on init', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#details')
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')

    runOutline()

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('details'))
  })

  it('treats a malformed hash as no active link without throwing', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#%')
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    setHeadingTop('intro', -50)
    setHeadingTop('details', 300)

    expect(runOutline).not.toThrow()

    expect(scrollIntoView).not.toHaveBeenCalled()
    // Scroll tracking keeps working: the malformed hash only affects the
    // initial sync, not subsequent activations.
    setScrollY(400)
    window.dispatchEvent(new Event('scroll'))
    expect(activeLinks()).toEqual(['#intro'])
  })

  it('returns early when no outline marker is present', () => {
    document.body.innerHTML = '<div class="content-container"><h1 id="intro">Intro</h1></div>'

    expect(runOutline).not.toThrow()
    expect(replaceHash).not.toHaveBeenCalled()
  })

  it('hides the marker while at the top of the page', () => {
    mountOutlineDom()
    runOutline()

    expect(activeLinks()).toEqual([])
    expect(marker().style.top).toBe('40px')
    expect(marker().style.opacity).toBe('0')
  })

  it('activates the crossed heading, positions the marker and syncs the hash', () => {
    mountOutlineDom()
    setHeadingTop('intro', -50)
    setHeadingTop('details', 300)
    runOutline()

    setScrollY(400)
    window.dispatchEvent(new Event('scroll'))

    expect(activeLinks()).toEqual(['#intro'])
    expect(marker().style.top).toBe('8px')
    expect(marker().style.opacity).toBe('1')
    expect(replaceHash).toHaveBeenCalledWith('#intro')
  })

  it('activates the last link at the bottom of the page', () => {
    mountOutlineDom()
    setHeadingTop('intro', -500)
    setHeadingTop('details', -50)
    runOutline()

    // scrollY + innerHeight === offsetHeight
    setScrollY(1200)
    window.dispatchEvent(new Event('scroll'))

    expect(activeLinks()).toEqual(['#details'])
    expect(replaceHash).toHaveBeenCalledWith('#details')
  })

  it('clears the active link when scrolling back to the top', () => {
    mountOutlineDom()
    setHeadingTop('intro', -50)
    setHeadingTop('details', 300)
    runOutline()
    setScrollY(400)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(120) // let the throttle trailing call settle
    expect(activeLinks()).toEqual(['#intro'])

    setScrollY(0)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(120)

    expect(activeLinks()).toEqual([])
    expect(marker().style.top).toBe('40px')
    expect(marker().style.opacity).toBe('0')
    expect(replaceHash).toHaveBeenCalledWith(null)
  })

  it('focuses the heading on click and only syncs the hash after the settle delay', () => {
    mountOutlineDom()
    setHeadingTop('intro', -50)
    setHeadingTop('details', 300)
    runOutline()
    const detailsHeading = document.getElementById('details')!
    const focus = vi.spyOn(detailsHeading, 'focus')

    document.querySelector<HTMLAnchorElement>('.outline-link[href="#details"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })

    // While a navigation is pending, scrolling updates the marker but not the hash.
    setScrollY(500)
    window.dispatchEvent(new Event('scroll'))
    expect(activeLinks()).toEqual(['#intro'])
    expect(replaceHash).not.toHaveBeenCalled()

    // After the settle delay the hash sync resumes.
    vi.advanceTimersByTime(200)
    expect(replaceHash).toHaveBeenCalledWith('#intro')
  })

  it('stops tracking when the scope is disposed', () => {
    mountOutlineDom()
    setHeadingTop('intro', -50)
    setHeadingTop('details', 300)
    runOutline()
    setScrollY(400)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(120)
    expect(activeLinks()).toEqual(['#intro'])

    scope!.stop()
    setScrollY(0)
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(120)

    expect(activeLinks()).toEqual(['#intro'])
  })
})
