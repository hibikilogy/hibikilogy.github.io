import type { FuseSearchResult, SearchRecord } from '../types.ts'
import { normalizeSearchText } from '../utils.ts'

const minExactBodyQueryLength = 2
const bodyExcerptRadius = 90
const maxScoredBodyOccurrences = 4
const normalizedBodyCache = new WeakMap<object, string>()

export function hasExactSearchBodyMatch(record: Pick<SearchRecord, 'body'>, normalizedTerm: string): boolean {
  if (!shouldUseExactBodySearch(normalizedTerm))
    return false

  return normalizedTextIncludes(getNormalizedBody(record), normalizedTerm)
}

export function buildExactBodySearchResults(
  records: SearchRecord[],
  normalizedTerm: string,
  minimumQueryLength = minExactBodyQueryLength,
): FuseSearchResult[] {
  if (!Array.isArray(records) || normalizedTerm.length < minimumQueryLength)
    return []

  return records
    .map(record => buildExactBodySearchResult(record, normalizedTerm))
    .filter((result): result is FuseSearchResult => Boolean(result))
}

function buildExactBodySearchResult(record: SearchRecord, normalizedTerm: string): FuseSearchResult | null {
  const normalizedBody = getNormalizedBody(record)
  const matchIndex = findNormalizedMatchIndex(normalizedBody, normalizedTerm)
  if (matchIndex === -1)
    return null

  const occurrenceCount = countOccurrences(normalizedBody, normalizedTerm, maxScoredBodyOccurrences)
  const positionRatio = normalizedBody.length ? matchIndex / normalizedBody.length : 1

  return {
    item: {
      ...record,
      body: createBodyMatchExcerpt(record.body || '', normalizedTerm),
      bodyMatchExcerpt: true,
    },
    score: getExactBodyScore(occurrenceCount, positionRatio),
    matches: [
      {
        key: 'bodySearch',
        value: record.body || '',
      },
    ],
  } as FuseSearchResult
}

function shouldUseExactBodySearch(normalizedTerm: string): boolean {
  return normalizedTerm.length >= minExactBodyQueryLength
}

function countOccurrences(value: string, needle: string, limit = Number.POSITIVE_INFINITY): number {
  if (!needle)
    return 0

  const directMatch = value.includes(needle)
  const searchValue = directMatch ? value : value.replace(/\s+/g, '')
  const searchNeedle = directMatch ? needle : needle.replace(/\s+/g, '')
  let count = 0
  let index = searchValue.indexOf(searchNeedle)
  while (index !== -1 && count < limit) {
    count += 1
    index = searchValue.indexOf(searchNeedle, index + searchNeedle.length)
  }

  return count
}

function getExactBodyScore(occurrenceCount: number, positionRatio: number): number {
  const occurrenceBoost = Math.min(occurrenceCount, 4) * 0.01
  const positionPenalty = Math.min(Math.max(positionRatio, 0), 1) * 0.04
  return 0.24 - occurrenceBoost + positionPenalty
}

function createBodyMatchExcerpt(body: string, normalizedTerm: string): string {
  const text = String(body || '').replace(/\s+/g, ' ').trim()
  if (!text)
    return ''

  const matchIndex = findOriginalMatchIndex(text, normalizedTerm)
  const start = Math.max(0, matchIndex - bodyExcerptRadius)
  const end = Math.min(text.length, matchIndex + normalizedTerm.length + bodyExcerptRadius)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''

  return `${prefix}${text.slice(start, end)}${suffix}`
}

function findOriginalMatchIndex(text: string, normalizedTerm: string): number {
  const directIndex = text.indexOf(normalizedTerm)
  if (directIndex !== -1)
    return directIndex

  const mapped = normalizeTextWithIndexMap(text)
  const normalizedIndex = findNormalizedMatchIndex(mapped.value, normalizedTerm)
  if (normalizedIndex === -1)
    return 0

  return mapped.indexes[normalizedIndex] ?? 0
}

function getNormalizedBody(record: Pick<SearchRecord, 'body'>): string {
  const cached = normalizedBodyCache.get(record)
  if (cached !== undefined)
    return cached

  const normalized = normalizeSearchText(record.body || '')
  normalizedBodyCache.set(record, normalized)
  return normalized
}

function normalizedTextIncludes(value: string, needle: string): boolean {
  return findNormalizedMatchIndex(value, needle) !== -1
}

function findNormalizedMatchIndex(value: string, needle: string): number {
  const directIndex = value.indexOf(needle)
  if (directIndex !== -1)
    return directIndex

  const compactNeedle = needle.replace(/\s+/g, '')
  if (compactNeedle === needle)
    return -1

  return value.replace(/\s+/g, '').indexOf(compactNeedle)
}

function normalizeTextWithIndexMap(text: string): { value: string, indexes: number[] } {
  let value = ''
  const indexes: number[] = []

  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index)
    if (codePoint === undefined)
      break

    const char = String.fromCodePoint(codePoint)
    const normalized = normalizeSearchText(char)
    for (const normalizedChar of normalized) {
      value += normalizedChar
      indexes.push(index)
    }

    index += char.length
  }

  return { value, indexes }
}
