import type {
  FuseLogicalQuery,
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
} from './types.ts'
import Fuse from 'fuse.js'
import { buildExactBodySearchResults } from './body-match.ts'
import {
  defaultFuseSearchKeys,
  defaultPrimarySearchKeys,
  extendedFuseSearchKeys,
  extendedPrimarySearchKeys,
  fuseSearchOptions,
  searchFieldDefinitions,
  secondarySearchScoreThreshold,
} from './config.ts'
import {
  getFuseQueryText,
  getPositiveQueryText,
  hasExplicitFieldSearch,
  parseSearchQuery,
} from './query.ts'
import { dedupeSearchResults } from './results.ts'
import {
  getPathSlug,
  normalizeSearchText,
  normalizeSearchUrl,
  normalizeSiteUrl,
  sanitizeSearchBody,
  segmentSearchText,
  tokenizeForFuse,
} from './utils.ts'

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

      return {
        url,
        path: entry.path || '',
        title,
        description,
        body,
        date: entry.date || metadata.dv || '',
        slug,
        authorName,
        authorHref: String(metadata.ah || ''),
        tags,
        titleSearch: segmentSearchText(title),
        descriptionSearch: segmentSearchText(description),
        slugSearch: segmentSearchText(slug),
        bodySearch: segmentSearchText(body),
        authorSearch: segmentSearchText(authorName),
        tagSearch: segmentSearchText(tags.map(tag => tag.name).join(' ')),
        metadataSearch: segmentSearchText([
          authorName,
          ...tags.map(tag => tag.name),
        ].join(' ')),
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
    tokenize: tokenizeForFuse,
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
  const explicitFieldSearch = hasExplicitFieldSearch(query)
  const primaryKeys = explicitFieldSearch ? extendedPrimarySearchKeys : defaultPrimarySearchKeys
  const fuseResults = runParsedSearch(engine, query)
  const useFullCorpusCandidates = shouldUseFullCorpusCandidates(query)
  const bodyFallbackTerm = getBodyFallbackTerm(query)
  const exactBodyResults = bodyFallbackTerm
    ? buildExactBodySearchResults(engine.records, bodyFallbackTerm)
    : []
  const filtered = dedupeSearchResults([
    ...(useFullCorpusCandidates ? fuseResults : fuseResults.filter(result => shouldKeepSearchResult(result, primaryKeys))),
    ...exactBodyResults,
  ])

  return filtered
    .filter(result => matchesParsedQuery(result.item, query))
    .map((result, index) => ({
      ...result.item,
      searchRank: index,
      searchScore: result.score ?? 1,
    }))
}

function runParsedSearch(engine: SearchEngine, query: ReturnType<typeof parseSearchQuery>): FuseSearchResult[] {
  const positiveText = getPositiveQueryText(query)
  if (!positiveText || shouldUseFullCorpusCandidates(query)) {
    return buildRecordCandidates(engine.records)
  }

  if (shouldUsePositiveClauseUnion(query)) {
    return dedupeSearchResults(query.clauses
      .filter((clause): clause is Exclude<SearchClause, { type: 'not' }> => clause.type !== 'not')
      .flatMap(clause => runClauseSearch(engine, clause)))
  }

  const fuse = hasExplicitFieldSearch(query) ? engine.extendedFuse : engine.defaultFuse

  if (query.mode === 'or') {
    return dedupeSearchResults(query.clauses
      .filter(clause => clause.type !== 'not')
      .flatMap(clause => runClauseSearch(engine, clause)))
  }

  const logicalQuery = toFuseLogicalFieldQuery(query)
  if (logicalQuery)
    return fuse.search(logicalQuery)

  return fuse.search(getFuseQueryText(positiveText))
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
    return engine.extendedFuse.search({ [key]: `'${segmentSearchText(clause.value)}` })
  }

  const value = clause.phrase ? `'${clause.value}` : getFuseQueryText(clause.value)
  return engine.defaultFuse.search(value)
}

function toFuseLogicalFieldQuery(query: ReturnType<typeof parseSearchQuery>): FuseLogicalQuery | null {
  const clauses = query.clauses
    .filter(clause => clause.type !== 'not')
  if (!clauses.length || clauses.some(clause => clause.type !== 'field'))
    return null

  const fieldClauses = clauses.map((clause) => {
    if (clause.type !== 'field')
      throw new Error('Expected field search clause')
    return { [fieldSearchKeys[clause.field]]: `'${segmentSearchText(clause.value)}` }
  })

  if (fieldClauses.length === 1)
    return fieldClauses[0]
  return { $and: fieldClauses }
}

function shouldKeepSearchResult(result: FuseSearchResult, primarySearchKeys: Set<keyof SearchRecord>): boolean {
  const matchedKeys = new Set((result.matches || []).map(match => match.key))
  for (const key of matchedKeys) {
    if (primarySearchKeys.has(String(key) as keyof SearchRecord)) {
      return true
    }
  }

  if (matchedKeys.has('bodySearch')) {
    return false
  }

  return (result.score ?? 1) <= secondarySearchScoreThreshold
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

  return searchTextIncludes(getRecordCorpus(record), clause.value)
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

function getRecordCorpus(record: SearchRecord): string {
  return [
    record.title,
    record.description,
    record.slug,
    record.body,
  ].join(' ')
}

function getBodyFallbackTerm(query: ReturnType<typeof parseSearchQuery>): string {
  const positiveText = getPositiveQueryText(query)
  if (!positiveText)
    return ''

  if (!hasExplicitFieldSearch(query))
    return positiveText

  const hasPositiveBodyField = query.clauses.some((clause) => {
    return clause.type === 'field' && clause.field === 'body'
  })
  return hasPositiveBodyField ? positiveText : ''
}

function shouldUseFullCorpusCandidates(query: ReturnType<typeof parseSearchQuery>): boolean {
  const hasPositiveClause = query.clauses.some(clause => clause.type !== 'not')
  if (!hasPositiveClause)
    return true

  if (query.mode === 'or' && query.clauses.some(clause => clause.type === 'not'))
    return true

  return query.clauses.some((clause) => {
    return clause.type === 'field' && clause.field === 'body' && /\s/.test(clause.value)
  })
}

function shouldUsePositiveClauseUnion(query: ReturnType<typeof parseSearchQuery>): boolean {
  if (query.mode === 'or')
    return false

  const positiveClauses = query.clauses.filter(clause => clause.type !== 'not')
  const hasFieldClause = positiveClauses.some(clause => clause.type === 'field')
  const hasTermClause = positiveClauses.some(clause => clause.type === 'term')
  return hasFieldClause && hasTermClause
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

function buildTagsByUrl(tagIndex: SearchTagIndexItem[]): Map<string, Array<{ name: string, href: string }>> {
  const tagsByUrl = new Map<string, Array<{ name: string, href: string }>>()

  for (const tag of tagIndex || []) {
    if (!tag?.name)
      continue

    for (const pageUrl of tag.pages || []) {
      const url = normalizeSearchUrl(pageUrl)
      const tags = tagsByUrl.get(url) || []
      tags.push({
        name: tag.name,
        href: tag.href || '#',
      })
      tagsByUrl.set(url, tags)
    }
  }

  return tagsByUrl
}
