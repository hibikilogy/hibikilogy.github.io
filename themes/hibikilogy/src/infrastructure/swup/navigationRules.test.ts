import { describe, expect, it } from 'vitest'
import { isPageNavigationUrl, isSamePageHashNavigation } from './navigationRules.ts'

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

describe('isSamePageHashNavigation', () => {
  it('accepts same-page hash anchors rendered as full URLs', () => {
    expect(isSamePageHashNavigation('https://hibikilogy.vercel.app/articles/#fn-1', base)).toBe(true)
    expect(isSamePageHashNavigation('https://hibikilogy.vercel.app/articles/#fnref-1', base)).toBe(true)
    expect(isSamePageHashNavigation('/articles/#section-2', base)).toBe(true)
  })

  it('treats trailing-slash differences as the same page', () => {
    expect(isSamePageHashNavigation('/articles/hello/#fn-1', 'https://hibikilogy.vercel.app/articles/hello')).toBe(true)
    expect(isSamePageHashNavigation('https://hibikilogy.vercel.app/articles/hello/#fn-1', 'https://hibikilogy.vercel.app/articles/hello/')).toBe(true)
  })

  it('rejects plain same-page URLs without a hash', () => {
    expect(isSamePageHashNavigation('/articles/hello/', base)).toBe(false)
    expect(isSamePageHashNavigation('https://hibikilogy.vercel.app/articles/hello/', base)).toBe(false)
  })

  it('rejects cross-page or cross-origin URLs', () => {
    expect(isSamePageHashNavigation('/articles/other/#fn-1', base)).toBe(false)
    expect(isSamePageHashNavigation('https://example.com/articles/hello/#fn-1', base)).toBe(false)
    expect(isSamePageHashNavigation('https://hibikilogy.vercel.app/tags/#fn-1', base)).toBe(false)
  })
})
