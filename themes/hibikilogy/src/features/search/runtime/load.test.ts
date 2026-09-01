import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonIndex } from './load.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJsonIndex', () => {
  it('解析纯 JSON 响应', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('[{"name":"a"}]', { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/x')).resolves.toEqual([{ name: 'a' }])
  })

  it('裁剪 zola serve 注入的 livereload script 尾段后解析', async () => {
    const body = '[{"name":"a"}]<script>window.LiveReloadOptions{port:1111}</script><script src=/livereload.js></script>'
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(body, { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/search-tags/')).resolves.toEqual([{ name: 'a' }])
  })

  it('可解析的文本完整保留（含字符串内的 <script 字样）', async () => {
    const body = '[{"name":"<script>警示"}]'
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(body, { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/plain')).resolves.toEqual([{ name: '<script>警示' }])
  })

  it('非 2xx 响应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('not found', { status: 404 })
    )))
    await expect(fetchJsonIndex('/missing')).rejects.toThrow('Failed to load /missing')
  })
})
