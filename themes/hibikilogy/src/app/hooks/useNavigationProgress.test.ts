import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavigationProgress } from './useNavigationProgress.ts'

function createProgress(fallbackDelayMs = 700) {
  const onStart = vi.fn()
  const onDone = vi.fn()
  const progress = createNavigationProgress({ fallbackDelayMs, onStart, onDone })
  return { progress, onStart, onDone }
}

describe('createNavigationProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never starts for a cached (preloaded) target', () => {
    const { progress, onStart, onDone } = createProgress()
    progress.onVisitStart({ cached: true, slow: true })
    vi.advanceTimersByTime(10_000)
    expect(onStart).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('starts immediately when the network is measured slow', () => {
    const { progress, onStart } = createProgress()
    progress.onVisitStart({ cached: false, slow: true })
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('waits for the fallback delay when the network is not known slow', () => {
    const { progress, onStart } = createProgress()
    progress.onVisitStart({ cached: false, slow: false })
    expect(onStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(699)
    expect(onStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not start when the transition begins before the fallback delay', () => {
    const { progress, onStart, onDone } = createProgress()
    progress.onVisitStart({ cached: false, slow: false })
    vi.advanceTimersByTime(300)
    progress.onTransitionStart()
    vi.advanceTimersByTime(10_000)
    expect(onStart).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('finishes exactly once when the transition starts after the bar showed', () => {
    const { progress, onStart, onDone } = createProgress()
    progress.onVisitStart({ cached: false, slow: true })
    progress.onTransitionStart()
    progress.onTransitionStart()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('settles without onDone when the bar never started', () => {
    const { progress, onStart, onDone } = createProgress()
    progress.onVisitStart({ cached: false, slow: false })
    progress.onSettle()
    vi.advanceTimersByTime(10_000)
    expect(onStart).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('keeps the bar running across a superseded visit until it settles', () => {
    const { progress, onStart, onDone } = createProgress()
    progress.onVisitStart({ cached: false, slow: true })
    progress.onVisitStart({ cached: false, slow: true })
    expect(onStart).toHaveBeenCalledTimes(1)
    progress.onSettle()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
