import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonIndex } from './load.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJsonIndex', () => {
  it('解析 JSON，且可解析文本内的 <script 字样完整保留', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('[{"name":"a"}]', { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/x')).resolves.toEqual([{ name: 'a' }])

    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('[{"name":"<script>警示"}]', { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/plain')).resolves.toEqual([{ name: '<script>警示' }])
  })

  it('裁剪 zola serve 注入的 livereload script 尾段后解析', async () => {
    const body = '[{"name":"a"}]<script>window.LiveReloadOptions{port:1111}</script><script src=/livereload.js></script>'
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(body, { status: 200 })
    )))
    await expect(fetchJsonIndex<{ name: string }[]>('/search-tags/')).resolves.toEqual([{ name: 'a' }])
  })

  it('非 2xx 响应抛错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response('not found', { status: 404 })
    )))
    await expect(fetchJsonIndex('/missing')).rejects.toThrow('Failed to load /missing')
  })
})
