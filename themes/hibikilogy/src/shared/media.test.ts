import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMaxTabletViewport, MAX_TABLET_WIDTH_PX } from './media.ts'

describe('media breakpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Keeps the TS constant and the CSS `--max-tablet` definition from drifting.
  it('mirrors the --max-tablet breakpoint in styles/lib/media.css', () => {
    const css = readFileSync(
      join(process.cwd(), 'themes/hibikilogy/styles/lib/media.css'),
      'utf8',
    )
    expect(css).toMatch(
      new RegExp(`--max-tablet\\s*\\(max-width: ${MAX_TABLET_WIDTH_PX}px\\)`),
    )
  })

  it('delegates to matchMedia at the max-tablet query', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    expect(isMaxTabletViewport()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith(`(max-width: ${MAX_TABLET_WIDTH_PX}px)`)
  })

  it('reports false when matchMedia reports a wider viewport', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))

    expect(isMaxTabletViewport()).toBe(false)
  })
})
