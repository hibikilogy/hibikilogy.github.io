import { describe, expect, it } from 'vitest'
import {
  isCacheablePageResponse,
  isExcludedPath,
  isPageRequest,
  isSameOriginGet,
  isStaticAssetRequest,
  shouldUseNavigationPreload,
} from './policy.ts'

const scope = { origin: 'https://example.com', pathname: '/' }

describe('service worker request policy', () => {
  it('only accepts same-origin GET requests', () => {
    expect(isSameOriginGet(new Request('https://example.com/articles/post/'), scope)).toBe(true)
    expect(isSameOriginGet(new Request('https://cdn.example.com/app.js'), scope)).toBe(false)
    expect(isSameOriginGet(new Request('https://example.com/articles/post/', { method: 'POST' }), scope)).toBe(false)
  })

  it('matches site-page navigations and Swup HTML fetches', () => {
    const navigationRequest = {
      method: 'GET',
      url: 'https://example.com/articles/post/',
      mode: 'navigate',
      headers: new Headers(),
    } as unknown as Request
    expect(isPageRequest(navigationRequest)).toBe(true)
    expect(isPageRequest(new Request('https://example.com/articles/post/', {
      headers: { accept: 'text/html,application/xhtml+xml' },
    }))).toBe(true)
    const htmlHeaders = { headers: { accept: 'text/html' } }
    expect(isPageRequest(new Request('https://example.com/docs/markdown/', htmlHeaders))).toBe(true)
    expect(isPageRequest(new Request('https://example.com/author/example/', htmlHeaders))).toBe(true)
    expect(isPageRequest(new Request('https://example.com/tags/example/page/2/', htmlHeaders))).toBe(true)
    expect(isPageRequest(new Request('https://example.com/articles/post/image.png'))).toBe(false)
    expect(isPageRequest(new Request('https://example.com/search/', {
      headers: { accept: 'text/html' },
    }))).toBe(false)
    expect(isPageRequest(new Request('https://example.com/search-articles/', {
      headers: { accept: 'text/html' },
    }))).toBe(false)
    expect(shouldUseNavigationPreload(navigationRequest)).toBe(true)
    expect(shouldUseNavigationPreload(new Request('https://example.com/articles/post/', {
      headers: { accept: 'text/html' },
    }))).toBe(false)
  })

  it('does not intercept the CMS path', () => {
    expect(isExcludedPath('/admin/')).toBe(true)
    expect(isExcludedPath('/admin/admin.js')).toBe(true)
    const cmsNavigationRequest = {
      method: 'GET',
      url: 'https://example.com/admin/articles/post/',
      mode: 'navigate',
      headers: new Headers(),
    } as unknown as Request
    expect(isPageRequest(cmsNavigationRequest)).toBe(false)
  })

  it('matches versioned and known immutable static resources', () => {
    expect(isStaticAssetRequest(new Request('https://example.com/styles/uno.css?h=abc'))).toBe(true)
    expect(isStaticAssetRequest(new Request('https://example.com/js/chunks/app-abc.js'))).toBe(true)
    expect(isStaticAssetRequest(new Request('https://example.com/js/ui.js'))).toBe(false)
    expect(isStaticAssetRequest(new Request('https://example.com/fonts/body.woff2'))).toBe(true)
    expect(isStaticAssetRequest(new Request('https://example.com/imgs/cover.webp'))).toBe(false)
  })

  it('only caches successful page HTML responses', () => {
    expect(isCacheablePageResponse(new Response('<html></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }))).toBe(true)
    expect(isCacheablePageResponse(new Response('missing', {
      status: 404,
      headers: { 'content-type': 'text/html' },
    }))).toBe(false)
    expect(isCacheablePageResponse(new Response('{}', {
      headers: { 'content-type': 'application/json' },
    }))).toBe(false)
    expect(isCacheablePageResponse(Response.redirect('https://example.com/articles/new/'))).toBe(false)
  })
})
