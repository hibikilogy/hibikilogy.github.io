import type { ArticleMeta, OgManifest } from './meta.ts'
import { describe, expect, it } from 'vitest'
import {
  cleanCardText,
  clipCardText,
  computeDigest,
  decideRender,
  describeArticle,
  parseArticleFrontMatter,
  resolveRoute,
  slugify,
} from './meta.ts'

describe('parseArticleFrontMatter', () => {
  it('解析 TOML front matter', () => {
    const front = parseArticleFrontMatter(`+++
title = "测试"
date = "2025-10-14"
[extra]
abstract = "摘要"
cover = "/imgs/x.png"
+++
正文
`)
    expect(front.title).toBe('测试')
    expect(front.extra?.abstract).toBe('摘要')
    expect(front.extra?.cover).toBe('/imgs/x.png')
  })

  it('缺 front matter 时报错', () => {
    expect(() => parseArticleFrontMatter('没有 front matter')).toThrow()
  })
})

describe('resolveRoute', () => {
  it('front path 优先', () => {
    expect(resolveRoute('2025-10-14-a.md', { path: '/custom/route/' })).toBe('custom/route')
    expect(resolveRoute('a.md', { path: 'custom-route' })).toBe('custom-route')
  })

  it('slug 次优先并小写化', () => {
    expect(resolveRoute('2025-10-14-a.md', { slug: 'Kitauji-Power' })).toBe('kitauji-power')
  })

  it('无 slug 时剥离日期前缀', () => {
    expect(resolveRoute('2019-03-27-Nozomi.md', {})).toBe('nozomi')
    expect(resolveRoute('2020-01-10-ruhewenze.md', {})).toBe('ruhewenze')
  })

  it('无日期前缀时使用文件 stem', () => {
    expect(resolveRoute('custom-slug.md', {})).toBe('custom-slug')
  })
})

describe('slugify', () => {
  it('小写、连字符压缩、去首尾', () => {
    expect(slugify('  A--B  C ')).toBe('a-b-c')
    expect(slugify('标题/测试')).toBe('标题-测试')
  })
})

describe('describeArticle', () => {
  it('description 回退到 extra.abstract', () => {
    const meta = describeArticle('2025-10-14-a.md', {
      title: 'T',
      extra: { abstract: '摘要文字' },
    })
    expect(meta.description).toBe('摘要文字')
  })

  it('缺 title 时使用文件名', () => {
    expect(describeArticle('2025-10-14-a.md', {}).title).toBe('2025-10-14-a')
  })
})

describe('cleanCardText / clipCardText', () => {
  it('连续破折号折叠为两字长破折号 ⸺（U+2E3A）', () => {
    expect(cleanCardText('久美子——黄前')).toBe('久美子\u2E3A黄前')
    expect(cleanCardText('——驳《为什么历史选择了久石奏》')).toBe('\u2E3A驳《为什么历史选择了久石奏》')
    expect(cleanCardText('——三连——')).toBe('\u2E3A三连\u2E3A')
    expect(cleanCardText('单个—破折号保持')).toBe('单个—破折号保持')
  })

  it('合并空白并去除首尾空白', () => {
    expect(cleanCardText('  多点  空格\n换行 ')).toBe('多点 空格 换行')
  })

  it('截断并附加省略号', () => {
    expect(clipCardText('一二三四五六', 5)).toBe('一二三四…')
    expect(clipCardText('短文本', 10)).toBe('短文本')
  })
})

describe('computeDigest / decideRender', () => {
  const meta: ArticleMeta = {
    route: 'a',
    title: '标题',
    description: '摘要',
    cover: '/imgs/x.png',
  }
  const fingerprint = 'f1'

  it('摘要稳定且随内容变化', () => {
    const first = computeDigest(meta, 'abc')
    expect(computeDigest(meta, 'abc')).toBe(first)
    expect(computeDigest({ ...meta, title: '另' }, 'abc')).not.toBe(first)
    expect(computeDigest(meta, 'def')).not.toBe(first)
  })

  it('命中缓存时跳过，未命中时渲染', () => {
    const digest = computeDigest(meta, null)
    const manifest: OgManifest = {
      version: 1,
      fingerprint,
      records: { a: { digest, output: 'og/articles/a.png' } },
    }
    const hit = decideRender(meta, null, manifest, 'og/articles/a.png', fingerprint, true)
    expect(hit.render).toBe(false)

    const miss = decideRender({ ...meta, title: '新' }, null, manifest, 'og/articles/a.png', fingerprint, true)
    expect(miss.render).toBe(true)
  })

  it('输出路径变化时视为缓存失效', () => {
    const digest = computeDigest(meta, null)
    const manifest: OgManifest = {
      version: 1,
      fingerprint,
      records: { a: { digest, output: 'og/articles/old.png' } },
    }
    expect(
      decideRender(meta, null, manifest, 'og/articles/new.png', fingerprint, true).render,
    ).toBe(true)
  })

  it('输出文件缺失时视为缓存失效', () => {
    const digest = computeDigest(meta, null)
    const manifest: OgManifest = {
      version: 1,
      fingerprint,
      records: { a: { digest, output: 'og/articles/a.jpg' } },
    }
    expect(
      decideRender(meta, null, manifest, 'og/articles/a.jpg', fingerprint, false).render,
    ).toBe(true)
  })

  it('渲染器指纹变化时全部失效', () => {
    const digest = computeDigest(meta, null)
    const manifest: OgManifest = {
      version: 1,
      fingerprint,
      records: { a: { digest, output: 'og/articles/a.jpg' } },
    }
    expect(
      decideRender(meta, null, manifest, 'og/articles/a.jpg', 'f2', true).render,
    ).toBe(true)
  })
})
