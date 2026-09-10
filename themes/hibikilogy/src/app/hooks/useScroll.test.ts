import { effectScope } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScroll } from './useScroll.ts'

function stubAnimationFrames(): FrameRequestCallback[] {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  return frames
}

describe('useScroll', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    document.body.className = ''
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('coalesces window scroll events into reactive frame updates', () => {
    const frames = stubAnimationFrames()
    const scope = effectScope()
    const scroll = scope.run(() => useScroll())!

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 20 })
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('scroll'))
    expect(frames).toHaveLength(1)
    expect(scroll.y.value).toBe(0)

    frames.shift()?.(0)
    expect(scroll.y.value).toBe(20)
    expect(scroll.atTop.value).toBe(false)
    expect(scroll.directions.down).toBe(true)

    scope.stop()
  })

  it('updates position immediately but direction only past the tolerance', () => {
    const frames = stubAnimationFrames()
    const scope = effectScope()
    const scroll = scope.run(() => useScroll({ directionTolerance: 6 }))!

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 4 })
    window.dispatchEvent(new Event('scroll'))
    frames.shift()?.(0)
    expect(scroll.y.value).toBe(4)
    expect(scroll.directions.down).toBe(false)

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 24 })
    window.dispatchEvent(new Event('scroll'))
    frames.shift()?.(0)
    expect(scroll.y.value).toBe(24)
    expect(scroll.directions.down).toBe(true)

    scope.stop()
  })
})
