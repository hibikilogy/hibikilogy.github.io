/* eslint-disable no-console */
import type {
  SearchBuildReport,
} from './types.ts'
import { catchError } from 'shared/result.ts'

export const SEARCH_DEBUG_STORAGE_KEY = 'hibikilogy:search-debug'

export function isSearchDebugEnabled(): boolean {
  const [enabled] = catchError(() => globalThis.localStorage?.getItem(SEARCH_DEBUG_STORAGE_KEY) === '1')
  return enabled ?? false
}

export function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

export function getDurationMs(start: number): number {
  return Math.round((nowMs() - start) * 10) / 10
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
