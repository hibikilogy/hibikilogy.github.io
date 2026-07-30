import { describe, expect, it } from 'vitest'
import { createFetchLatencyMonitor } from './fetchLatency.ts'

describe('createFetchLatencyMonitor', () => {
  it('stays conservative until enough samples exist', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500 })
    monitor.record(2000)
    expect(monitor.isSlow()).toBe(false)
    monitor.record(2000)
    expect(monitor.isSlow()).toBe(true)
  })

  it('reports fast when the median duration is below the threshold', () => {
    const monitor = createFetchLatencyMonitor({ slowThresholdMs: 500 })
    monitor.record(120)
    monitor.record(180)
    expect(monitor.isSlow()).toBe(false)
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
  })

  it('reports fast only once enough quick samples exist', () => {
    const monitor = createFetchLatencyMonitor()
    expect(monitor.isFast()).toBe(false)
    monitor.record(100)
    expect(monitor.isFast()).toBe(false)
    monitor.record(150)
    expect(monitor.isFast()).toBe(true)
    expect(monitor.isSlow()).toBe(false)
  })

  it('counts seeded durations toward the sample window', () => {
    const monitor = createFetchLatencyMonitor({ seed: [100] })
    expect(monitor.isFast()).toBe(false)
    monitor.record(150)
    expect(monitor.isFast()).toBe(true)
  })

  it('is neither fast nor slow in the middle band', () => {
    const monitor = createFetchLatencyMonitor()
    monitor.record(300)
    monitor.record(400)
    expect(monitor.isFast()).toBe(false)
    expect(monitor.isSlow()).toBe(false)
  })
})
