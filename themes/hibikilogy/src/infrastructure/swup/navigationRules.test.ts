import { describe, expect, it } from 'vitest'
import { isPageNavigationUrl } from './navigationRules.ts'

const base = 'https://hibikilogy.vercel.app/articles/'

describe('isPageNavigationUrl', () => {
  it('accepts same-origin directory-style page URLs', () => {
    expect(isPageNavigationUrl('/articles/hello/', base)).toBe(true)
    expect(isPageNavigationUrl('https://hibikilogy.vercel.app/tags/', base)).toBe(true)
    expect(isPageNavigationUrl('/search?q=atom.xml', base)).toBe(true)
  })

  it('rejects feed and file URLs so they load natively', () => {
    expect(isPageNavigationUrl('/atom.xml', base)).toBe(false)
    expect(isPageNavigationUrl('https://hibikilogy.vercel.app/atom.xml', base)).toBe(false)
    expect(isPageNavigationUrl('/search_index.zh.json', base)).toBe(false)
    expect(isPageNavigationUrl('/files/slides.pdf', base)).toBe(false)
  })

  it('rejects cross-origin URLs', () => {
    expect(isPageNavigationUrl('https://example.com/atom.xml', base)).toBe(false)
    expect(isPageNavigationUrl('https://example.com/articles/', base)).toBe(false)
  })
})
