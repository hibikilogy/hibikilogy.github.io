import { normalizePathname, parseUrl } from 'shared/url.ts'

/**
 * 计数键为 `host + path`：服务端同样会剥掉协议，两侧保持同一个存储键。
 * 用生产域名而非当前域名，使预览站与本地开发共用正式站的一份计数。
 */
export function resolvePageViewKey(pathname: string, identityBase: string): string | null {
  const base = parseUrl(identityBase, identityBase)
  if (!base?.host)
    return null

  return `${base.host}${normalizePathname(pathname)}`
}

/** 接口返回 `{ data: { reaction: { viewCount } } }`；结构不符或非有限数视为无数据。 */
export function readViewCount(payload: unknown): number | null {
  const count = (payload as PageViewResponse | null)?.data?.reaction?.viewCount
  return typeof count === 'number' && Number.isFinite(count) ? count : null
}

interface PageViewResponse {
  data?: { reaction?: { viewCount?: unknown } }
}
