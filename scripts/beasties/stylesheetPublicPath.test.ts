import { describe, expect, it } from 'vitest'
import { deriveStylesheetPublicPath } from './stylesheetPublicPath.ts'

describe('deriveStylesheetPublicPath', () => {
  it.each([
    ['https://example.com/styles/critical.css?h=1', 'https://example.com/'],
    ['https://example.com/blog/styles/critical.css', 'https://example.com/blog/'],
    ['//cdn.example.com/styles/critical.css', '//cdn.example.com/'],
    ['/styles/critical.css?h=1', '/'],
    ['/blog/styles/critical.css', '/blog/'],
    ['styles/critical.css', ''],
    ['../styles/critical.css', '../'],
  ])('derives the public path from %s', (href, expected) => {
    expect(deriveStylesheetPublicPath(href)).toBe(expected)
  })

  it('ignores unrelated stylesheets', () => {
    expect(deriveStylesheetPublicPath('/assets/app.css')).toBeNull()
  })
})
