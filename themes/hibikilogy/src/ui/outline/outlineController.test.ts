import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeOutline, initOutline } from './outlineController.ts'

function mountOutlineDom(): void {
  document.body.innerHTML = `
    <div class="content-container">
      <h1 id="intro">Intro</h1>
      <h2 id="details">Details</h2>
    </div>
    <aside class="AsideOutline">
      <div class="outline-marker"></div>
      <a class="outline-link" href="#intro">Intro</a>
      <a class="outline-link" href="#details">Details</a>
    </aside>
  `
}

describe('outlineController', () => {
  afterEach(() => {
    disposeOutline()
    document.body.replaceChildren()
    window.history.replaceState(null, '', '/')
  })

  it('initializes without throwing when location.hash has malformed percent escapes', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#%')

    expect(() => initOutline({ replaceHash: vi.fn() })).not.toThrow()

    // Outline listeners and cleanup are registered despite the bad hash
    expect(() => disposeOutline()).not.toThrow()
  })

  it('initializes and scrolls to the heading for a valid hash', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#details')

    expect(() => initOutline({ replaceHash: vi.fn() })).not.toThrow()
  })
})
