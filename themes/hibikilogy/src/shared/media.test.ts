import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_TABLET_WIDTH_PX } from './media.ts'

describe('media breakpoints', () => {
  // The TS constant and the CSS `--max-tablet` definition must not drift.
  it('mirrors the --max-tablet breakpoint in styles/lib/media.css', () => {
    const css = readFileSync(
      join(process.cwd(), 'themes/hibikilogy/styles/lib/media.css'),
      'utf8',
    )
    expect(css).toMatch(
      new RegExp(`--max-tablet\\s*\\(max-width: ${MAX_TABLET_WIDTH_PX}px\\)`),
    )
  })
})
