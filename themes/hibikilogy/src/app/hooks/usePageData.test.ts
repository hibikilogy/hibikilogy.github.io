import { describe, expect, it } from 'vitest'
import { usePageData } from './usePageData.ts'

function createRoot(markup: string): HTMLElement {
  const root = document.createElement('main')
  root.innerHTML = markup
  return root
}

describe('usePageData', () => {
  it.each([
    ['search', '<div id="search"><div class="Journal"></div></div>', 'search'],
    ['article', '<section class="content-container"><article></article></section>', 'article'],
    ['journal', '<div class="Journal"></div>', 'journal'],
    ['default', '<div></div>', 'default'],
  ] as const)('detects %s pages', (_name, markup, kind) => {
    expect(usePageData(createRoot(markup)).kind).toBe(kind)
  })
})
