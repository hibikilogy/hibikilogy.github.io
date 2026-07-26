import { describe, expect, it, vi } from 'vitest'
import { onFinalPageHide, startPageEnter, stopPageEnter } from './appController.ts'

function dispatchPageHide(persisted: boolean): void {
  window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }))
}

describe('onFinalPageHide', () => {
  it('skips persisted (bfcache) events but still runs cleanup on the final unload', () => {
    const cleanup = vi.fn()
    onFinalPageHide(cleanup)

    dispatchPageHide(true)
    dispatchPageHide(true)
    expect(cleanup).not.toHaveBeenCalled()

    dispatchPageHide(false)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})

describe('page enter lifecycle', () => {
  it('stops the current animation before SPA navigation', () => {
    const root = document.createElement('html')
    root.dataset.pageEnter = 'initial'

    stopPageEnter(root)

    expect(root.hasAttribute('data-page-enter')).toBe(false)
  })

  it('starts the animation after SPA content replacement', () => {
    const root = document.createElement('html')

    startPageEnter(root)

    expect(root.dataset.pageEnter).toBe('navigation')
  })
})
