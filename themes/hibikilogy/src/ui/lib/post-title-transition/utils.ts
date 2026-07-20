// FNV-1a provides a small, deterministic browser-side hash for stable names
// and repeatable motion. It is not used for security-sensitive data.
const fnvOffsetBasis = 0x811C9DC5
const fnvPrime = 0x01000193
const maxUnsigned32BitValue = 0xFFFFFFFF
const coordinatePrecision = 1000
const jitterWaveFrequency = 12.9898
const jitterWaveScale = 43758.5453

export function createStableToken(value: string): string {
  let hash = fnvOffsetBasis
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, fnvPrime)
  }
  return (hash >>> 0).toString(36)
}

export function deterministicUnitValue(seed: string, channel: number): number {
  const hash = Number.parseInt(createStableToken(`${seed}:${channel}`), 36)
  return (hash >>> 0) / maxUnsigned32BitValue
}

/** Preserve the established per-index jitter used by shared title movement. */
export function deterministicIndexJitter(index: number): number {
  const value = Math.sin((index + 1) * jitterWaveFrequency) * jitterWaveScale
  return value - Math.floor(value)
}

export function roundCoordinate(value: number): number {
  return Math.round(value * coordinatePrecision) / coordinatePrecision
}
