import type { ParsedSearchQuery, SearchClause, SearchField } from './types.ts'
import { searchFieldDefinitions } from './config.ts'
import {
  normalizeSearchText,
  tokenizeForFuse,
} from './utils.ts'

const fieldAliases = new Map<string, SearchField>()

for (const definition of searchFieldDefinitions) {
  for (const alias of definition.aliases) {
    fieldAliases.set(normalizeSearchText(alias), definition.field)
  }
}

export function tokenizeSearchQuery(value: string): string[] {
  const normalized = normalizeSearchText(value)
  if (!normalized)
    return []

  return tokenizeForFuse(normalized).filter(token => (
    normalized.length <= 1 || token.length > 1
  ))
}

export function parseSearchQuery(value: string): ParsedSearchQuery {
  const rawTokens = splitQueryTokens(value)
  const mode = rawTokens.some(token => token.toUpperCase() === 'OR') ? 'or' : 'and'
  const clauses = rawTokens
    .filter(token => !isBooleanOperator(token))
    .map(parseClauseToken)
    .filter((clause): clause is SearchClause => Boolean(clause))

  return { mode, clauses }
}

export function hasExplicitFieldSearch(query: ParsedSearchQuery): boolean {
  return query.clauses.some(clause => (
    clause.type === 'field'
    || (clause.type === 'not' && clause.clause.type === 'field')
  ))
}

export function getPositiveQueryText(query: ParsedSearchQuery): string {
  return query.clauses
    .filter((clause): clause is Exclude<SearchClause, { type: 'not' }> => clause.type !== 'not')
    .map(clause => clause.value)
    .join(' ')
}

export function getFuseQueryText(value: string): string {
  const tokens = tokenizeSearchQuery(value)
  return tokens.join(' ') || normalizeSearchText(value)
}

function parseClauseToken(token: string): SearchClause | null {
  const isNegative = token.startsWith('-') || token.toUpperCase().startsWith('NOT ')
  const raw = isNegative
    ? token.replace(/^-/, '').replace(/^NOT\s+/i, '')
    : token
  const unquoted = stripQuotes(raw)
  const fieldMatch = unquoted.match(/^([^:：]+)[:：](.+)$/)
  const clause = fieldMatch
    ? parseFieldClause(fieldMatch[1], fieldMatch[2])
    : {
        type: 'term' as const,
        value: normalizeSearchText(unquoted),
        phrase: isQuoted(raw),
      }

  if (!clause || !hasClauseValue(clause))
    return null
  return isNegative ? { type: 'not', clause } : clause
}

function parseFieldClause(field: string, value: string): SearchClause | null {
  const normalizedField = fieldAliases.get(normalizeSearchText(field))
  if (!normalizedField)
    return null

  return {
    type: 'field',
    field: normalizedField,
    value: normalizeSearchText(stripQuotes(value)),
  }
}

function splitQueryTokens(value: string): string[] {
  const tokens: string[] = []
  const text = String(value || '')
  let buffer = ''
  let quoted = false

  for (const char of text) {
    if (char === '"') {
      quoted = !quoted
      buffer += char
      continue
    }

    if (/\s/.test(char) && !quoted) {
      pushToken(tokens, buffer)
      buffer = ''
      continue
    }

    buffer += char
  }

  pushToken(tokens, buffer)
  return tokens
}

function pushToken(tokens: string[], value: string): void {
  const token = value.trim()
  if (token)
    tokens.push(token)
}

function isBooleanOperator(token: string): boolean {
  return token.toUpperCase() === 'AND' || token.toUpperCase() === 'OR'
}

function isQuoted(value: string): boolean {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2
}

function stripQuotes(value: string): string {
  return isQuoted(value) ? value.slice(1, -1) : value
}

function hasClauseValue(clause: SearchClause): clause is Exclude<SearchClause, { type: 'not' }> {
  return clause.type !== 'not' && Boolean(clause.value)
}
