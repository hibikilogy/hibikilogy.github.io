import { describe, expect, it, vi } from 'vitest'
import { onFinalPageHide } from './pageLifecycle.ts'

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
