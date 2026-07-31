import type { RawSearchIndexEntry, SearchArticleMetadataIndex, SearchResultRecord, SearchTagIndexItem } from '../themes/hibikilogy/src/features/search/types.ts'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { createServer } from 'vite'
import { hibikilogyConfigPlugin } from './vite/hibikilogy-config.ts'

interface SearchEngineModule {
  createSearchEngine: (records: unknown[]) => unknown
  normalizeSearchRecords: (
    rawIndex: RawSearchIndexEntry[],
    articleMetadata?: SearchArticleMetadataIndex,
    tagIndex?: SearchTagIndexItem[],
  ) => unknown[]
  searchRecordsInEngine: (engine: unknown, term: string) => SearchResultRecord[]
}

interface QueryBenchmark {
  query: string
  resultCount: number
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
  topTitles?: string
}

const root = resolve(import.meta.dirname, '..')
const iterations = readPositiveIntegerOption('--iterations', 30)
const topResultCount = readPositiveIntegerOption('--top', 0)
const customQueries = process.argv.slice(2).filter(argument => !argument.startsWith('--'))
const queries = customQueries.length
  ? customQueries
  : ['京吹', '北宇治', '全国金', 'title:京吹', 'body:全国金', '京吹 OR 北宇治', '京吹 NOT 久美子', '__no_search_result__']

const server = await createServer({
  root,
  configFile: false,
  publicDir: false,
  plugins: [hibikilogyConfigPlugin(root)],
  resolve: { tsconfigPaths: true },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, watch: null },
})

try {
  const engineModule = await server.ssrLoadModule('/themes/hibikilogy/src/features/search/core/engine.ts') as SearchEngineModule
  const rawIndex = JSON.parse(
    await readFile(resolve(root, 'public/search_index.zh.json'), 'utf8'),
  ) as RawSearchIndexEntry[]
  const articleMetadata = JSON.parse(
    await readFile(resolve(root, 'public/search-articles/index.html'), 'utf8'),
  ) as SearchArticleMetadataIndex
  const tagIndex = JSON.parse(
    await readFile(resolve(root, 'public/search-tags/index.html'), 'utf8'),
  ) as SearchTagIndexItem[]

  const normalizeStart = performance.now()
  const records = engineModule.normalizeSearchRecords(rawIndex, articleMetadata, tagIndex)
  const normalizeMs = performance.now() - normalizeStart

  const buildStart = performance.now()
  const engine = engineModule.createSearchEngine(records)
  const buildMs = performance.now() - buildStart

  const results = queries.map(query => benchmarkQuery(engineModule, engine, query, iterations, topResultCount))

  console.info(`Search benchmark: ${records.length} records, ${iterations} iterations/query`)
  console.table([{
    phase: 'normalize records',
    ms: round(normalizeMs),
  }, {
    phase: 'build Fuse indexes',
    ms: round(buildMs),
  }])
  console.table(results)
}
finally {
  await server.close()
}

function benchmarkQuery(
  engineModule: SearchEngineModule,
  engine: unknown,
  query: string,
  runCount: number,
  topCount: number,
): QueryBenchmark {
  engineModule.searchRecordsInEngine(engine, query)

  const samples: number[] = []
  let resultCount = 0
  let topTitles = ''
  for (let index = 0; index < runCount; index += 1) {
    const start = performance.now()
    const results = engineModule.searchRecordsInEngine(engine, query)
    samples.push(performance.now() - start)
    resultCount = results.length
    if (!topTitles && topCount > 0) {
      topTitles = results
        .slice(0, topCount)
        .map(result => result.title || result.slug || result.url)
        .join(' | ')
    }
  }

  samples.sort((left, right) => left - right)
  return {
    query,
    resultCount,
    medianMs: round(percentile(samples, 0.5)),
    p95Ms: round(percentile(samples, 0.95)),
    minMs: round(samples[0] || 0),
    maxMs: round(samples.at(-1) || 0),
    ...(topTitles ? { topTitles } : {}),
  }
}

function readPositiveIntegerOption(name: string, fallback: number): number {
  const prefix = `${name}=`
  const value = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function percentile(sortedSamples: number[], ratio: number): number {
  if (!sortedSamples.length)
    return 0
  return sortedSamples[Math.min(Math.ceil(sortedSamples.length * ratio) - 1, sortedSamples.length - 1)]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
