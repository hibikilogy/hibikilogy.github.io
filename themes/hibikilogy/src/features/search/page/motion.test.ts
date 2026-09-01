import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSwapTransition } from './motion.ts'

function transitionOptions(swap: () => void) {
  return {
    durationVar: 'textSwap',
    fallbackDurationMs: 100,
    swap,
  } as const
}

describe('runSwapTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('supersedes an in-flight transition; only the newest one owns the classes', async () => {
    const element = document.createElement('div')
    const firstSwap = vi.fn()
    const secondSwap = vi.fn()

    const first = runSwapTransition(element, transitionOptions(firstSwap))
    expect(element.classList.contains('is-exit')).toBe(true)

    // A new transition starting mid-flight invalidates the first one, clears
    // its residual phase classes, and takes over the element.
    const second = runSwapTransition(element, transitionOptions(secondSwap))
    expect(element.classList.contains('is-exit')).toBe(true)
    expect(element.classList.contains('is-enter-start')).toBe(false)

    await vi.advanceTimersByTimeAsync(150)
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(firstSwap).not.toHaveBeenCalled()
    expect(secondSwap).toHaveBeenCalledTimes(1)
    expect(element.className).toBe('')
  })

  it('skips the exit delay when shouldRunExit returns false', async () => {
    const element = document.createElement('div')
    const swap = vi.fn()

    const transition = runSwapTransition(element, {
      ...transitionOptions(swap),
      shouldRunExit: () => false,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(await transition).toBe(true)
    expect(swap).toHaveBeenCalledTimes(1)
    expect(element.className).toBe('')
  })

  it('swaps without phase classes under prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const element = document.createElement('div')
    const swap = vi.fn()

    const transition = runSwapTransition(element, transitionOptions(swap))
    expect(await transition).toBe(true)
    expect(swap).toHaveBeenCalledTimes(1)
    expect(element.className).toBe('')
  })
})
