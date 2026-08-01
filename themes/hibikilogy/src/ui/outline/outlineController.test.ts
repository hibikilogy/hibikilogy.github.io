import { effectScope } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupOutline } from './outlineController.ts'

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
  let scope: ReturnType<typeof effectScope> | null = null

  afterEach(() => {
    scope?.stop()
    scope = null
    document.body.replaceChildren()
    window.history.replaceState(null, '', '/')
  })

  it('initializes without throwing when location.hash has malformed percent escapes', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#%')

    scope = effectScope()
    expect(() => {
      scope!.run(() => setupOutline({ replaceHash: vi.fn() }))
    }).not.toThrow()
  })

  it('initializes and scrolls to the heading for a valid hash', () => {
    mountOutlineDom()
    window.history.replaceState(null, '', '/articles/foo/#details')

    scope = effectScope()
    expect(() => {
      scope!.run(() => setupOutline({ replaceHash: vi.fn() }))
    }).not.toThrow()
  })
})
