import { describe, expect, it } from 'vitest'
import { startPageEnter, stopPageEnter } from './pageEnter.ts'

describe('page enter lifecycle', () => {
  it('stops the current animation so the incoming page restarts the cascade', () => {
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
