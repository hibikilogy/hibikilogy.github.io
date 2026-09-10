import { describe, expect, it } from 'vitest'
import { getSearchHighlightTerms } from './articleView.ts'

describe('getSearchHighlightTerms', () => {
  it('keeps only clauses whose text can appear in the excerpt', () => {
    expect(getSearchHighlightTerms('body:选拔 description:摘要')).toEqual(['选拔', '摘要'])
  })

  it('drops title, author, slug and negated clauses', () => {
    expect(getSearchHighlightTerms('title:希美 author:老仓 slug:foo tag:舞台')).toEqual([])
    expect(getSearchHighlightTerms('-tag:舞台')).toEqual([])
    expect(getSearchHighlightTerms('NOT tag:舞台')).toEqual([])
  })

  it('keeps plain terms alongside ignored field clauses', () => {
    expect(getSearchHighlightTerms('舞台 tag:动画')).toEqual(['舞台'])
  })
})
