import { describe, expect, it } from 'vitest'
import { findChunkCycle } from './chunkCycleGuard.ts'

describe('findChunkCycle', () => {
  it('accepts an acyclic chunk graph', () => {
    expect(findChunkCycle(new Map([
      ['ui.js', ['config.js']],
      ['search-page.js', ['ui.js']],
      ['config.js', []],
    ]))).toBeNull()
  })

  it('reports the complete static import cycle', () => {
    expect(findChunkCycle(new Map([
      ['ui.js', ['search-page.js']],
      ['search-page.js', ['ui.js']],
    ]))).toEqual(['ui.js', 'search-page.js', 'ui.js'])
  })
})
