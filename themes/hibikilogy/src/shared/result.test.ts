import { describe, expect, it } from 'vitest'
import { catchAsyncError, catchError } from './result.ts'

describe('catchError', () => {
  it('returns synchronous values without an error', () => {
    expect(catchError(() => 0)).toEqual([0, null])
  })

  it('maps synchronous errors', () => {
    expect(catchError(
      () => {
        throw new Error('failed')
      },
      error => String(error),
    )).toEqual([undefined, 'Error: failed'])
  })

  it('captures asynchronous errors', async () => {
    const error = new Error('failed')
    expect(await catchAsyncError(() => Promise.reject(error))).toEqual([undefined, error])
  })
})
