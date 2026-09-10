import { describe, expect, it } from 'vitest'
import { createFetchLatencyMonitor } from './fetchLatency.ts'

describe('createFetchLatencyMonitor', () => {
  it('withholds a verdict until enough samples exist', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500 })
    monitor.record(2000)
    expect(monitor.isSlow()).toBe(false)
    expect(monitor.isFast()).toBe(false)

    monitor.record(2000)
    expect(monitor.isSlow()).toBe(true)
    expect(monitor.isFast()).toBe(false)
  })

  it('counts seeded durations toward the sample window', () => {
    const monitor = createFetchLatencyMonitor({ seed: [100] })
    expect(monitor.isFast()).toBe(false)

    monitor.record(150)
    expect(monitor.isFast()).toBe(true)
  })

  it('classifies the median into fast and slow bands with a neutral middle', () => {
    const fast = createFetchLatencyMonitor()
    fast.record(120)
    fast.record(180)
    expect(fast.isFast()).toBe(true)
    expect(fast.isSlow()).toBe(false)

    const middle = createFetchLatencyMonitor()
    middle.record(300)
    middle.record(400)
    expect(middle.isFast()).toBe(false)
    expect(middle.isSlow()).toBe(false)
  })

  it('tolerates a single fast outlier via the median', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500 })
    monitor.record(900)
    monitor.record(80)
    monitor.record(1200)
    expect(monitor.isSlow()).toBe(true)
  })

  it('drops stale samples outside the sliding window', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500, windowSize: 3 })
    monitor.record(2000)
    monitor.record(2000)
    monitor.record(2000)
    expect(monitor.isSlow()).toBe(true)
    monitor.record(50)
    monitor.record(60)
    monitor.record(70)
    expect(monitor.isSlow()).toBe(false)
  })

  it('ignores invalid durations', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500 })
    monitor.record(Number.NaN)
    monitor.record(-1)
    expect(monitor.isSlow()).toBe(false)
    expect(monitor.isFast()).toBe(false)
  })
})
