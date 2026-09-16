import type { FuseSearchResult } from '../types.ts'
import { normalizeSiteUrl } from '../utils.ts'

export function dedupeSearchResults(results: FuseSearchResult[]): FuseSearchResult[] {
  const deduped: FuseSearchResult[] = []
  const seenUrlIndexes = new Map<string, number>()

  for (const result of results) {
    const url = normalizeSiteUrl(result.item.url || result.item.path)
    if (url === '#')
      continue

    const existingIndex = seenUrlIndexes.get(url)
    if (existingIndex !== undefined) {
      deduped[existingIndex] = mergeSearchResult(deduped[existingIndex], result)
      continue
    }

    seenUrlIndexes.set(url, deduped.length)
    deduped.push(result)
  }

  return deduped
}

function mergeSearchResult(currentResult: FuseSearchResult, nextResult: FuseSearchResult): FuseSearchResult {
  const currentScore = currentResult.score ?? 1
  const nextScore = nextResult.score ?? 1
  const betterRankedResult = nextScore < currentScore ? nextResult : currentResult
  const bodyExcerptResult = nextResult.item.bodyMatchExcerpt
    ? nextResult
    : currentResult.item.bodyMatchExcerpt
      ? currentResult
      : null

  if (!bodyExcerptResult)
    return betterRankedResult

  return {
    ...betterRankedResult,
    item: {
      ...betterRankedResult.item,
      body: bodyExcerptResult.item.body,
      bodyMatchExcerpt: true,
    },
  }
}
