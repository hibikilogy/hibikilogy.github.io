/* eslint-disable no-console */
import type {
  SearchBuildReport,
  SearchEngineBootstrapData,
  SearchRuntimeReport,
  SearchTimingPhase,
} from './types.ts'
import { catchError } from '../../shared/result.ts'

export const searchDebugStorageKey = 'hibikilogy:search-debug'

export function isSearchDebugEnabled(): boolean {
  const [enabled] = catchError(() => globalThis.localStorage?.getItem(searchDebugStorageKey) === '1')
  return enabled ?? false
}

export function getSearchDebugFlag(bootstrap: SearchEngineBootstrapData): boolean {
  return Boolean(bootstrap.debug || isSearchDebugEnabled())
}

export function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

export function getDurationMs(start: number): number {
  return Math.round((nowMs() - start) * 10) / 10
}

export async function measureSearchPhase<T>(
  phases: SearchTimingPhase[],
  label: string,
  operation: () => Promise<T> | T,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const start = nowMs()
  try {
    return await operation()
  }
  finally {
    phases.push({ label, durationMs: getDurationMs(start), metadata })
  }
}

export function logSearchRuntimeReport(isEnabled: boolean, report: SearchRuntimeReport): void {
  if (!isEnabled)
    return

  console.groupCollapsed(`[search] Query ${report.status}: ${report.totalDurationMs}ms`)
  console.info({
    status: report.status,
    totalDurationMs: report.totalDurationMs,
    termLength: report.termLength,
    queryMode: report.queryMode,
    clauseCount: report.clauseCount,
    fieldClauseCount: report.fieldClauseCount,
    negativeClauseCount: report.negativeClauseCount,
    resultCount: report.resultCount,
    page: report.page,
  })
  console.table(report.phases.map(phase => ({
    phase: phase.label,
    ms: phase.durationMs,
    metadata: phase.metadata ? JSON.stringify(phase.metadata) : '',
  })))
  console.groupEnd()
}

export function logSearchBuildReport(isEnabled: boolean, report: SearchBuildReport): void {
  if (!isEnabled)
    return

  const totalMs = report.phases.reduce((total, phase) => total + phase.durationMs, 0)
  console.groupCollapsed(
    `[search] Search engine build: ${report.cacheHit ? 'cache hit' : 'rebuilt'} (${Math.round(totalMs * 10) / 10}ms)`,
  )
  console.info({
    cacheHit: report.cacheHit,
    cacheStatus: report.cacheStatus,
    cacheKey: report.cacheKey,
    indexUrl: report.indexUrl,
    indexVersion: report.indexVersion,
    recordCount: report.recordCount,
    rawEntryCount: report.rawEntryCount,
    defaultFuseIndexRecordCount: report.defaultFuseIndexRecordCount,
    extendedFuseIndexRecordCount: report.extendedFuseIndexRecordCount,
  })
  console.table(report.phases.map(phase => ({
    phase: phase.label,
    ms: phase.durationMs,
    metadata: phase.metadata ? JSON.stringify(phase.metadata) : '',
  })))
  console.debug('[search] detailed build report', report)
  console.groupEnd()
}
