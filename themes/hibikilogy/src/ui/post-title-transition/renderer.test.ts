import { describe, expect, it } from 'vitest'
import { postTitleDom } from './config.ts'
import { getTitleTextNode } from './renderer.ts'

describe('getTitleTextNode', () => {
  it('finds Lit-rendered text after its comment marker', () => {
    const title = document.createElement('span')
    const text = document.createElement('span')
    text.className = postTitleDom.titleTextSelector.slice(1)
    text.append(
      document.createComment('?lit$'),
      document.createTextNode('搜索结果标题'),
    )
    title.append(text)

    expect(getTitleTextNode(title)?.data).toBe('搜索结果标题')
  })
})
