// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'
import { getRuntimeConfig, resetRuntimeConfig } from './runtimeConfig.ts'

describe('getRuntimeConfig', () => {
  beforeEach(resetRuntimeConfig)

  it('uses worker-safe defaults when document is unavailable', () => {
    expect(getRuntimeConfig()).toEqual({
      baseUrl: 'http://localhost',
      searchIndexUrl: 'search_index.zh.json',
      searchWorkerUrl: '/js/search/worker.js',
      searchArticlesDataUrl: 'search-articles/',
      searchTagsDataUrl: 'search-tags/',
    })
  })

  it('parses a valid runtime config once', () => {
    const root = createConfigRoot(JSON.stringify({
      baseUrl: 'https://example.com',
      searchIndexUrl: '/index.json',
      searchWorkerUrl: '/worker.js',
      searchArticlesDataUrl: '/articles-data/',
      searchTagsDataUrl: '/tags-data/',
    }))

    expect(getRuntimeConfig(root)).toEqual({
      baseUrl: 'https://example.com',
      searchIndexUrl: '/index.json',
      searchWorkerUrl: '/worker.js',
      searchArticlesDataUrl: '/articles-data/',
      searchTagsDataUrl: '/tags-data/',
    })
  })

  it('falls back when runtime JSON is invalid', () => {
    expect(getRuntimeConfig(createConfigRoot('{invalid'))).toEqual({
      baseUrl: 'http://localhost',
      searchIndexUrl: 'search_index.zh.json',
      searchWorkerUrl: '/js/search/worker.js',
      searchArticlesDataUrl: 'search-articles/',
      searchTagsDataUrl: 'search-tags/',
    })
  })
})

function createConfigRoot(textContent: string): ParentNode {
  return { querySelector: () => ({ textContent }) } as unknown as ParentNode
}
