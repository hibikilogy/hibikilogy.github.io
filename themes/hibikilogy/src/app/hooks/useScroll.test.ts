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
    expect(scroll.directions.bottom).toBe(true)

    scope.stop()
  })

  it('supports element scroll targets and manual measurement', () => {
    stubAnimationFrames()
    const target = document.createElement('div')
    let scrollLeft = 0
    let scrollTop = 0
    Object.defineProperties(target, {
      scrollLeft: { configurable: true, get: () => scrollLeft },
      scrollTop: { configurable: true, get: () => scrollTop },
    })
    const scope = effectScope()
    const scroll = scope.run(() => useScroll(target, { directionTolerance: 6 }))!

    scrollTop = 4
    scroll.measure()
    expect(scroll.directions.bottom).toBe(false)

    scrollLeft = 12
    scrollTop = 24
    scroll.measure()
    expect(scroll.x.value).toBe(12)
    expect(scroll.y.value).toBe(24)
    expect(scroll.directions.right).toBe(true)
    expect(scroll.directions.bottom).toBe(true)

    scope.stop()
  })
})
