import { describe, expect, it, vi } from 'vitest'
import { createSingleFlight } from './singleFlight.ts'

describe('createSingleFlight', () => {
  it('deduplicates concurrent runs into one factory call', async () => {
    const factory = vi.fn(async () => 'result')
    const flight = createSingleFlight(factory)

    const [first, second] = await Promise.all([flight.run(), flight.run()])
    expect(first).toBe('result')
    expect(second).toBe('result')
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('keeps a settled success cached until reset', async () => {
    const factory = vi.fn(async () => 'result')
    const flight = createSingleFlight(factory)

    await flight.run()
    await flight.run()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('discards a rejected promise so the next run retries', async () => {
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')
    const flight = createSingleFlight(factory)

    await expect(flight.run()).rejects.toThrow('boom')
    await expect(flight.run()).resolves.toBe('recovered')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('propagates synchronous factory errors without caching them', () => {
    const factory = vi.fn(() => {
      throw new Error('boom')
    })
    const flight = createSingleFlight(factory)

    expect(() => flight.run()).toThrow('boom')
    expect(flight.peek()).toBeNull()
  })

  it('reset drops the cached promise so the next run refetches', async () => {
    const factory = vi.fn(async () => 'result')
    const flight = createSingleFlight(factory)

    await flight.run()
    flight.reset()
    await flight.run()
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('peek exposes the cached promise; only a rejected run clears it', async () => {
    const factory = vi.fn(async () => 'result')
    const flight = createSingleFlight(factory)

    const running = flight.run()
    expect(flight.peek()).toBe(running)
    await running
    // A settled success stays cached until reset.
    expect(flight.peek()).toBe(running)

    flight.reset()
    expect(flight.peek()).toBeNull()
  })
})
