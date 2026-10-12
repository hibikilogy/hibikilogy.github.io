import { describe, expect, it } from 'vitest'
import { tokenizeForFuse } from './utils.ts'

describe('search tokenization', () => {
  it('does not make cross-word bigrams or retain the whole multi-word query', () => {
    expect(tokenizeForFuse('京都动画')).toEqual(['京都', '动画'])
  })

  it('normalizes mixed text and preserves meaningful single characters', () => {
    expect(tokenizeForFuse('ＡＩ 京都 金')).toEqual(['ai', '京都', '金'])
  })
})
