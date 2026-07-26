import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWaterfallController } from './waterfallController.ts'

describe('waterfall controller', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('coalesces layout requests into one frame and cleans up listeners', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      frames.push(callback)
      return frames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const journal = document.createElement('div')
    const item = document.createElement('article')
    item.className = 'Section Article'
    journal.append(item)
    document.body.append(journal)
    journal.style.gridAutoRows = '10px'
    journal.style.rowGap = '0px'

    setMetric(journal, 'clientWidth', 600)
    setMetric(item, 'offsetWidth', 200)
    setMetric(item, 'offsetHeight', 100)
    setMetric(item, 'offsetLeft', 0)
    setMetric(item, 'offsetTop', 0)

    const controller = createWaterfallController(journal, '.Section', false)
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))

    expect(frames).toHaveLength(1)
    frames.shift()?.(0)
    expect(item.style.gridRow).toBe('span 10')
    expect(journal.style.opacity).toBe('1')
    expect(journal.hasAttribute('data-layout-ready')).toBe(true)

    const replacement = document.createElement('article')
    replacement.className = 'Section Article'
    setMetric(replacement, 'offsetWidth', 200)
    setMetric(replacement, 'offsetHeight', 100)
    setMetric(replacement, 'offsetLeft', 0)
    setMetric(replacement, 'offsetTop', 0)
    journal.replaceChildren(replacement)
    window.dispatchEvent(new Event('resize'))
    frames.shift()?.(0)
    expect(replacement.style.gridRow).toBe('span 10')

    controller.dispose()
    window.dispatchEvent(new Event('resize'))
    expect(frames).toHaveLength(0)
  })
})

function setMetric(
  element: HTMLElement,
  property: 'clientWidth' | 'offsetHeight' | 'offsetLeft' | 'offsetTop' | 'offsetWidth',
  value: number,
): void {
  Object.defineProperty(element, property, {
    configurable: true,
    value,
  })
}
