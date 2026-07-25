import { describe, expect, it } from 'vitest'
import { getSearchHighlightTerms } from './articleView.ts'

describe('getSearchHighlightTerms', () => {
  it('ignores tag field clauses', () => {
    expect(getSearchHighlightTerms('tag:舞台')).toEqual([])
  })

  it('ignores author and slug field clauses', () => {
    expect(getSearchHighlightTerms('author:老仓')).toEqual([])
    expect(getSearchHighlightTerms('slug:foo')).toEqual([])
  })

  it('keeps plain terms while ignoring tag field clauses', () => {
    expect(getSearchHighlightTerms('舞台 tag:动画')).toEqual(['舞台'])
  })

  it('keeps body and description field clauses', () => {
    expect(getSearchHighlightTerms('body:选拔')).toEqual(['选拔'])
    expect(getSearchHighlightTerms('description:摘要')).toEqual(['摘要'])
  })

  it('ignores negated field clauses', () => {
    expect(getSearchHighlightTerms('-tag:舞台')).toEqual([])
    expect(getSearchHighlightTerms('NOT tag:舞台')).toEqual([])
  })

  it('ignores title field clauses', () => {
    expect(getSearchHighlightTerms('title:希美')).toEqual([])
  })
})
