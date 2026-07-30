export const FETCH_LATENCY_WINDOW_SIZE = 5
export const FETCH_LATENCY_SLOW_THRESHOLD_MS = 500
export const FETCH_LATENCY_FAST_THRESHOLD_MS = 200
export const FETCH_LATENCY_MIN_SAMPLES = 2

export interface FetchLatencyMonitor {
  record: (durationMs: number) => void
  isSlow: () => boolean
  isFast: () => boolean
}

export interface FetchLatencyMonitorOptions {
  windowSize?: number
  slowThresholdMs?: number
  fastThresholdMs?: number
  minSamples?: number
  // Pre-populated durations, e.g. the initial document fetch, so network
  // classification kicks in one real sample earlier.
  seed?: number[]
}

// Tracks median fetch duration over a sliding window so network quality is
// known before a navigation starts.
export function createFetchLatencyMonitor({
  windowSize = FETCH_LATENCY_WINDOW_SIZE,
  slowThresholdMs = FETCH_LATENCY_SLOW_THRESHOLD_MS,
  fastThresholdMs = FETCH_LATENCY_FAST_THRESHOLD_MS,
  minSamples = FETCH_LATENCY_MIN_SAMPLES,
  seed = [],
}: FetchLatencyMonitorOptions = {}): FetchLatencyMonitor {
  const samples: number[] = []

  function record(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0)
      return

    samples.push(durationMs)
    if (samples.length > windowSize)
      samples.shift()
  }

  function median(): number | null {
    if (samples.length < minSamples)
      return null

    const sorted = [...samples].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2
  }

  seed.forEach(record)

  return {
    record,
    isSlow: () => (median() ?? 0) > slowThresholdMs,
    isFast: () => {
      const value = median()
      return value !== null && value <= fastThresholdMs
    },
  }
}
