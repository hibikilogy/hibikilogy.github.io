export function normalizePageNumber(value: number | string | null): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function clampPage(page: number | string | null, totalPages: number): number {
  const total = normalizePageNumber(totalPages)
  const parsed = normalizePageNumber(page)
  if (total <= 1)
    return 1
  return Math.min(Math.max(parsed, 1), total)
}
