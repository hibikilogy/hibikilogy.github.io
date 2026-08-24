import { createHash } from 'node:crypto'
import { parse } from 'smol-toml'

export const RENDERER_VERSION = '4'

export interface ManifestRecord {
  digest: string
  output: string
}

export interface OgManifest {
  version: number
  records: Record<string, ManifestRecord>
}

export interface ArticleMeta {
  route: string
  title: string
  description: string
  cover: string
  coverAlt: string
}

export interface ArticleFront {
  title?: string
  description?: string
  path?: string
  slug?: string
  extra?: Record<string, unknown>
}

export function parseArticleFrontMatter(markdown: string): ArticleFront {
  const match = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/.exec(markdown)
  if (!match)
    throw new Error('missing TOML front matter')
  return parse(match[1]) as ArticleFront
}

/** 复刻 Zola 的文章路由推导：front path > slug > 日期前缀剥离后的文件名，统一小写连字符 */
export function resolveRoute(fileName: string, front: ArticleFront): string {
  if (front.path)
    return normalizeRoute(front.path)
  if (front.slug)
    return slugify(front.slug)
  const stem = fileName.replace(/\.md$/i, '')
  const match = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(stem)
  return slugify(match ? match[1] : stem)
}

export function normalizeRoute(route: string): string {
  return route.replace(/^\/+|\/+$|\.html$/g, '')
}

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function describeArticle(
  fileName: string,
  front: ArticleFront,
): ArticleMeta {
  const extra = front.extra ?? {}
  const route = resolveRoute(fileName, front)
  const title = front.title?.trim() || fileName.replace(/\.md$/i, '')
  const description = front.description?.trim() || (extra.abstract as string | undefined)?.trim() || ''
  const cover = (extra.cover as string | undefined) ?? ''
  const coverAlt = (extra.cover_alt as string | undefined)?.trim() || title
  return { route, title, description, cover, coverAlt }
}

export function computeDigest(
  meta: ArticleMeta,
  coverByteDigest: string | null,
): string {
  return createHash('sha256')
    .update(RENDERER_VERSION)
    .update('\0')
    .update(meta.title)
    .update('\0')
    .update(meta.description)
    .update('\0')
    .update(meta.cover)
    .update('\0')
    .update(coverByteDigest ?? '')
    .digest('hex')
}

export interface RenderDecision {
  render: boolean
  digest: string
  output: string
}

/** 合并空白、把连续破折号折叠为两字长破折号 ⸺（U+2E3A，Source Han 的 uni2E3A 字形），并去除首尾空白 */
export function cleanCardText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\u2014{2,}/g, '\u2E3A')
    .trim()
}

export function clipCardText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function decideRender(
  meta: ArticleMeta,
  coverByteDigest: string | null,
  manifest: OgManifest,
  output: string,
): RenderDecision {
  const digest = computeDigest(meta, coverByteDigest)
  const record = manifest.records[meta.route]
  const cached = record?.digest === digest && record.output === output
  return { render: !cached, digest, output }
}
