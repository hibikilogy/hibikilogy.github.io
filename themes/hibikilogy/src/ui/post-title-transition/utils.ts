// FNV-1a provides a small, deterministic browser-side hash for stable names
// and repeatable motion. It is not used for security-sensitive data.
const FNV_OFFSET_BASIS = 0x811C9DC5
const FNV_PRIME = 0x01000193
const MAX_UNSIGNED_32_BIT_VALUE = 0xFFFFFFFF
const COORDINATE_PRECISION = 1000
const JITTER_WAVE_FREQUENCY = 12.9898
const JITTER_WAVE_SCALE = 43758.5453

export function createStableToken(value: string): string {
  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(36)
}

export function deterministicUnitValue(seed: string, channel: number): number {
  const hash = Number.parseInt(createStableToken(`${seed}:${channel}`), 36)
  return (hash >>> 0) / MAX_UNSIGNED_32_BIT_VALUE
}

/** Preserve the established per-index jitter used by shared title movement. */
export function deterministicIndexJitter(index: number): number {
  const value = Math.sin((index + 1) * JITTER_WAVE_FREQUENCY) * JITTER_WAVE_SCALE
  return value - Math.floor(value)
}

export function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION
}
