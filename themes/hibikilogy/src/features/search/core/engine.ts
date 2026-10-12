import type {
  FuseSearchResult,
  RawSearchIndexEntry,
  SearchArticleMetadataIndex,
  SearchClause,
  SearchEngine,
  SearchField,
  SearchFuseIndexJson,
  SearchRecord,
  SearchResultRecord,
  SearchTagIndexItem,
} from '../types.ts'
import Fuse from 'fuse.js'
import {
  defaultFuseSearchKeys,
  extendedFuseSearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
} from '../config.ts'
import {
  createExcerpt,
  getPathSlug,
  normalizeAssetUrl,
  normalizeSearchText,
  normalizeSearchUrl,
  normalizeSiteUrl,
  sanitizeSearchBody,
  tokenizeForFuse,
} from '../utils.ts'
import { buildExactBodySearchResults, createBodyMatchExcerpt } from './bodyMatch.ts'
import { parseSearchQuery } from './query.ts'
import { dedupeSearchResults } from './results.ts'
import { buildTagsByUrl } from './tags.ts'

const fieldSearchKeys = Object.fromEntries(
  searchFieldDefinitions.map(definition => [definition.field, definition.searchKey]),
) as Record<SearchField, keyof SearchRecord>

export function normalizeSearchRecords(
  rawIndex: RawSearchIndexEntry[],
  articleMetadata: SearchArticleMetadataIndex = {},
  tagIndex: SearchTagIndexItem[] = [],
): SearchRecord[] {
  if (!Array.isArray(rawIndex))
    return []

  const tagsByUrl = buildTagsByUrl(tagIndex)

  return rawIndex
    .map((entry) => {
      const url = normalizeSiteUrl(entry.path || entry.url)
      const metadata = articleMetadata[url] || articleMetadata[normalizeSearchUrl(url)] || {}
      const title = entry.title || ''
      const description = entry.description || metadata.s || ''
      const slug = getPathSlug(url)
      const body = sanitizeSearchBody(entry.body || '')
      const tags = tagsByUrl.get(url) || []
      const authorName = String(metadata.an || '')
      const coverSrc = normalizeCoverSrc(metadata.cs || '')

      return {
        url,
        path: entry.path || '',
        title,
        description,
        subtitle: String(metadata.s || description),
        coverSrc,
        coverAlt: String(metadata.ca || title),
        coverWidth: normalizePositiveNumber(metadata.cw),
        coverHeight: normalizePositiveNumber(metadata.ch),
        coverThumbhash: normalizeOptionalString(metadata.ct),
        publishDateValue: String(metadata.dv || entry.date || ''),
        body,
        date: entry.date || metadata.dv || '',
        slug,
        authorName,
        authorHref: String(metadata.ah || ''),
        tags,
        titleSearch: normalizeSearchText(title),
        descriptionSearch: normalizeSearchText(description),
        slugSearch: normalizeSearchText(slug),
        authorSearch: normalizeSearchText(authorName),
        tagSearch: normalizeSearchText(tags.map(tag => tag.name).join(' ')),
      }
    })
    .filter(entry => (
      entry.url !== '#'
      && entry.url !== '/'
      && entry.path !== '/search/'
      && (entry.title || entry.description || entry.body || entry.authorName || entry.tags.length)
    ))
}

interface SearchEngineIndexJson {
  defaultFuseIndexJson?: SearchFuseIndexJson
  extendedFuseIndexJson?: SearchFuseIndexJson
}

export function createSearchEngine(records: SearchRecord[], indexJson: SearchEngineIndexJson = {}): SearchEngine {
  const defaultIndex = indexJson.defaultFuseIndexJson
    ? parseFuseIndex(indexJson.defaultFuseIndexJson)
    : undefined
  const extendedIndex = indexJson.extendedFuseIndexJson
    ? parseFuseIndex(indexJson.extendedFuseIndexJson)
    : undefined

  const defaultFuse = new Fuse<SearchRecord>(records, {
    ...fuseSearchOptions,
    tokenize: tokenizeForFuse,
    keys: defaultFuseSearchKeys,
  }, defaultIndex)

  const extendedFuse = new Fuse<SearchRecord>(records, {
    ...fuseSearchOptions,
    useTokenSearch: false,
    useExtendedSearch: true,
    keys: extendedFuseSearchKeys,
  }, extendedIndex)

  return { defaultFuse, extendedFuse, records }
}

function parseFuseIndex(indexJson: SearchFuseIndexJson) {
  type FuseParseIndexInput = Parameters<typeof Fuse.parseIndex<SearchRecord>>[0]
  return Fuse.parseIndex<SearchRecord>(indexJson as FuseParseIndexInput)
}

export function searchRecordsInEngine(engine: SearchEngine, term: string): SearchResultRecord[] {
  const normalizedTerm = normalizeSearchText(term)
  if (!normalizedTerm)
    return []

  const query = parseSearchQuery(term)
  const fuseResults = runParsedSearch(engine, query)
  const exactBodyResults = getBodyFallbackTerms(query)
    .flatMap(({ minimumQueryLength, value }) => (
      buildExactBodySearchResults(engine.records, value, minimumQueryLength)
    ))
  const filtered = dedupeSearchResults([
    ...fuseResults,
    ...exactBodyResults,
  ])
  const matched = shouldRequireExactQueryMatch(query)
    ? filtered.filter(result => matchesParsedQuery(result.item, query))
    : filtered
  const singleClause = query.clauses.length === 1 ? query.clauses[0] : undefined
  const phrase = singleClause?.type === 'term' ? singleClause.value : undefined

  return matched
    .sort((left, right) => {
      const leftTitleMatch = phrase && left.item.titleSearch.includes(phrase) ? 1 : 0
      const rightTitleMatch = phrase && right.item.titleSearch.includes(phrase) ? 1 : 0
      return rightTitleMatch - leftTitleMatch
        || (left.score ?? 1) - (right.score ?? 1)
        || left.item.url.localeCompare(right.item.url)
    })
    .map((result, index) => toSearchResultRecord(result, index))
}

function shouldRequireExactQueryMatch(query: ReturnType<typeof parseSearchQuery>): boolean {
  return !getSimpleFuzzyClause(query)
}

function toSearchResultRecord(result: FuseSearchResult, searchRank: number): SearchResultRecord {
  const record = result.item

  return {
    url: record.url,
    path: record.path,
    title: record.title,
    description: record.description,
    subtitle: record.subtitle,
    coverSrc: record.coverSrc,
    coverAlt: record.coverAlt,
    coverWidth: record.coverWidth,
    coverHeight: record.coverHeight,
    coverThumbhash: record.coverThumbhash,
    publishDateValue: record.publishDateValue,
    body: result.bodyMatchTerm
      ? createBodyMatchExcerpt(record.body, result.bodyMatchTerm)
      : createExcerpt(record.body),
    date: record.date,
    slug: record.slug,
    authorName: record.authorName,
    authorHref: record.authorHref,
    tags: record.tags,
    bodyMatchExcerpt: Boolean(result.bodyMatchTerm),
    searchRank,
    searchScore: result.score ?? 1,
  }
}

function runParsedSearch(engine: SearchEngine, query: ReturnType<typeof parseSearchQuery>): FuseSearchResult[] {
  if (shouldUseFullCorpusCandidates(query)) {
    return buildRecordCandidates(engine.records)
  }

  // or 模式与多正向子句的 and 模式共用「逐子句检索后合并」策略。
  const positiveClauses = query.clauses.filter(
    (clause): clause is Exclude<SearchClause, { type: 'not' }> => clause.type !== 'not',
  )
  if (query.mode === 'or' || positiveClauses.length > 1) {
    return dedupeSearchResults(positiveClauses.flatMap(clause => runClauseSearch(engine, clause)))
  }

  return runClauseSearch(engine, positiveClauses[0])
}

function getSimpleFuzzyClause(
  query: ReturnType<typeof parseSearchQuery>,
): Extract<SearchClause, { type: 'term' }> | null {
  if (query.clauses.length !== 1)
    return null

  const clause = query.clauses[0]
  return clause.type === 'term'
    && !clause.phrase
    && /^[\p{L}\p{N}\s_-]+$/u.test(clause.value)
    ? clause
    : null
}

function buildRecordCandidates(records: SearchRecord[]): FuseSearchResult[] {
  return records.map((record, index) => ({
    item: record,
    score: 1 + index / Math.max(records.length, 1),
    matches: [],
  }))
}

function runClauseSearch(engine: SearchEngine, clause: Exclude<SearchClause, { type: 'not' }>): FuseSearchResult[] {
  if (clause.type === 'field') {
    const key = fieldSearchKeys[clause.field]
    return engine.extendedFuse.search({ [key]: `'${normalizeSearchText(clause.value)}` })
  }

  return engine.defaultFuse.search(normalizeSearchText(clause.value))
}

function matchesParsedQuery(record: SearchRecord, query: ReturnType<typeof parseSearchQuery>): boolean {
  if (!query.clauses.length)
    return false

  const checks = query.clauses.map(clause => matchesClause(record, clause))
  return query.mode === 'or' ? checks.some(Boolean) : checks.every(Boolean)
}

function matchesClause(record: SearchRecord, clause: ReturnType<typeof parseSearchQuery>['clauses'][number]): boolean {
  if (clause.type === 'not')
    return !matchesClause(record, clause.clause)
  if (clause.type === 'field') {
    return searchTextIncludes(getFieldCorpus(record, clause.field), clause.value)
  }

  return [record.title, record.description, record.slug, record.body]
    .some(corpus => searchTextIncludes(corpus, clause.value))
}

function getFieldCorpus(record: SearchRecord, field: keyof typeof fieldSearchKeys): string {
  if (field === 'author')
    return record.authorName
  if (field === 'tag')
    return record.tags.map(tag => tag.name).join(' ')
  if (field === 'title')
    return record.title
  if (field === 'description')
    return record.description
  if (field === 'slug')
    return record.slug
  return record.body
}

interface BodyFallbackTerm {
  value: string
  minimumQueryLength: number
}

function getBodyFallbackTerms(query: ReturnType<typeof parseSearchQuery>): BodyFallbackTerm[] {
  const terms = query.clauses
    .filter((clause): clause is Exclude<SearchClause, { type: 'not' }> => clause.type !== 'not')
    .filter(clause => clause.type === 'term' || clause.field === 'body')
    .map(clause => ({
      value: normalizeSearchText(clause.value),
      minimumQueryLength: clause.type === 'field' ? 1 : 2,
    }))
    .filter(term => Boolean(term.value))

  const minimumLengths = new Map<string, number>()
  for (const term of terms) {
    minimumLengths.set(
      term.value,
      Math.min(minimumLengths.get(term.value) ?? term.minimumQueryLength, term.minimumQueryLength),
    )
  }

  return [...minimumLengths].map(([value, minimumQueryLength]) => ({ value, minimumQueryLength }))
}

function shouldUseFullCorpusCandidates(query: ReturnType<typeof parseSearchQuery>): boolean {
  const hasPositiveClause = query.clauses.some(clause => clause.type !== 'not')
  if (!hasPositiveClause)
    return true

  if (query.mode === 'or' && query.clauses.some(clause => clause.type === 'not'))
    return true

  return query.clauses.some((clause) => {
    const positive = clause.type === 'not' ? clause.clause : clause
    return (positive.type === 'term' && positive.phrase)
      || (positive.type === 'field' && /[\s"|]/.test(positive.value))
  })
}

function searchTextIncludes(corpus: string, needle: string): boolean {
  const normalizedCorpus = normalizeSearchText(corpus)
  const normalizedNeedle = normalizeSearchText(needle)
  if (!normalizedNeedle)
    return false
  if (normalizedCorpus.includes(normalizedNeedle))
    return true

  return normalizedCorpus.replace(/\s+/g, '').includes(normalizedNeedle.replace(/\s+/g, ''))
}
function normalizeCoverSrc(value: string): string {
  const normalized = normalizeSiteUrl(value)
  return normalized === '#' ? normalizeAssetUrl(value) : normalized
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function normalizeOptionalString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}
