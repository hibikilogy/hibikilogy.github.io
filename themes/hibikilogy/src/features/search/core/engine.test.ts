import { describe, expect, it } from 'vitest'
import { createSearchEngine, normalizeSearchRecords, searchRecordsInEngine } from './engine.ts'

function engineFor(body: string, title = '人物分析') {
  return createSearchEngine(normalizeSearchRecords([{ path: '/article/', title, body }]))
}

describe('search query contracts', () => {
  const body = `久美子${'无'.repeat(300)}丽奈`

  it.each(['久美子 丽奈', '丽奈 久美子', 'body:久美子 body:丽奈'])(
    'matches distant body terms before creating the excerpt: %s',
    (query) => {
      expect(searchRecordsInEngine(engineFor(body), query).map(record => record.url)).toEqual(['/article/'])
    },
  )

  it('excludes a negative term outside the displayed excerpt', () => {
    expect(searchRecordsInEngine(engineFor(body), '久美子 NOT 丽奈')).toEqual([])
  })

  it('still displays a bounded excerpt around the body match', () => {
    const result = searchRecordsInEngine(engineFor(body), '丽奈')[0]
    expect(result.body).toContain('丽奈')
    expect(result.body.length).toBeLessThan(200)
    expect(result.bodyMatchExcerpt).toBe(true)
  })

  it('requires every word of an unspaced query across searchable fields', () => {
    const engine = createSearchEngine(normalizeSearchRecords([
      { path: '/both/', title: '京都的作品', description: '动画研究' },
      { path: '/one/', title: '京都的作品', description: '音乐研究' },
    ]))
    expect(searchRecordsInEngine(engine, '京都动画').map(record => record.url)).toEqual(['/both/'])
  })

  it('keeps quoted phrases contiguous', () => {
    expect(searchRecordsInEngine(engineFor('', '京都的动画作品'), '"京都动画"')).toEqual([])
    expect(searchRecordsInEngine(engineFor('', '京都动画作品'), '"京都动画"')).toHaveLength(1)
  })

  it('does not join separate fields into a phrase match', () => {
    const engine = createSearchEngine(normalizeSearchRecords([
      { path: '/article/', title: '京都', description: '动画' },
    ]))
    expect(searchRecordsInEngine(engine, '"京都动画"')).toEqual([])
    expect(searchRecordsInEngine(engine, '京都 动画')).toHaveLength(1)
  })

  it('ranks quoted title matches before body-only matches', () => {
    const engine = createSearchEngine(normalizeSearchRecords([
      { path: '/body/', title: '人物分析', body: '京都动画' },
      { path: '/title/', title: '京都动画研究' },
    ]))
    expect(searchRecordsInEngine(engine, '"京都动画"').map(record => record.url)).toEqual([
      '/title/',
      '/body/',
    ])
  })

  it.each(['title:京都动画', '标题：京都动画', 'title:"京都 动画"'])(
    'keeps field queries literal: %s',
    (query) => {
      expect(searchRecordsInEngine(engineFor('', '京都动画作品'), query)).toHaveLength(1)
      expect(searchRecordsInEngine(engineFor('', '京都的动画作品'), query)).toEqual([])
    },
  )

  it('supports explicit OR and excludes negative field matches', () => {
    expect(searchRecordsInEngine(engineFor('', '京都动画'), '京都 OR 丽奈')).toHaveLength(1)
    expect(searchRecordsInEngine(engineFor('', '京都动画'), '京都 NOT title:动画')).toEqual([])
  })

  it('ranks literal title matches before scattered query words', () => {
    const engine = createSearchEngine(normalizeSearchRecords([
      { path: '/scattered/', title: '京都的动画研究' },
      { path: '/literal/', title: '京都动画研究' },
    ]))
    expect(searchRecordsInEngine(engine, '京都动画')[0].url).toBe('/literal/')
  })

  it('keeps AND result ranking independent of clause order', () => {
    const engine = createSearchEngine(normalizeSearchRecords([
      { path: '/a/', title: '京都', description: '动画作品分析' },
      { path: '/b/', title: '动画', description: '京都的作品' },
    ]))
    const urls = (query: string) => searchRecordsInEngine(engine, query).map(record => record.url)
    expect(urls('京都 动画')).toEqual(urls('动画 京都'))
  })
})
