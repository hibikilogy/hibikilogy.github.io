import type { ReactElement } from 'react'
import type { ArticleMeta, OgManifest } from './meta.ts'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { ImageResponse } from '@vercel/og'
import { openSync } from 'fontkit'
import sharp from 'sharp'
import { cleanCardText, clipCardText, decideRender, describeArticle, parseArticleFrontMatter } from './meta.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const CONTENT_DIR = resolve(ROOT, 'content/articles')
const STATIC_DIR = resolve(ROOT, 'static')
const OUTPUT_DIR = resolve(STATIC_DIR, 'og/articles')
const MANIFEST_PATH = resolve(STATIC_DIR, '_cache/og-render-manifest.json')
const ASSET_DIR = resolve(import.meta.dirname, 'assets')
const FONT_DIR = resolve(import.meta.dirname, 'fonts')

const SERIF_FAMILY = 'Noto Serif SC'
const SANS_FAMILY = 'Noto Sans SC'

interface SatoriElement {
  type: string
  key: null
  props: Record<string, unknown> & { children?: unknown }
}

function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: (SatoriElement | string | null | false | undefined)[]
): SatoriElement {
  const kids = children.filter(
    child => child !== null && child !== false && child !== undefined,
  )
  return {
    type,
    key: null,
    props: {
      ...(props ?? {}),
      children: kids.length === 0 ? undefined : kids.length === 1 ? kids[0] : kids,
    },
  }
}

function titleFontSize(length: number): number {
  if (length <= 14)
    return 84
  if (length <= 30)
    return 68
  return 56
}

interface Assets {
  wordmarkDark: string
  wordmarkWhite: string
  tagsCloud: string
}

interface FontSet {
  serif: Buffer
  sans: Buffer
}

const SERIF_PATH = resolve(FONT_DIR, 'serif-700.ttf')
const SANS_PATH = resolve(FONT_DIR, 'sans-400.ttf')

async function loadFonts(): Promise<FontSet> {
  return {
    serif: await readFile(SERIF_PATH),
    sans: await readFile(SANS_PATH),
  }
}

async function loadAssets(): Promise<Assets> {
  const [wordmarkDark, wordmarkWhite, tagsCloud] = await Promise.all([
    readFile(resolve(ASSET_DIR, 'logo-wordmark-dark.png')),
    readFile(resolve(ASSET_DIR, 'logo-wordmark.png')),
    readFile(resolve(ASSET_DIR, 'tags-cloud.png')),
  ])
  return {
    wordmarkDark: `data:image/png;base64,${wordmarkDark.toString('base64')}`,
    wordmarkWhite: `data:image/png;base64,${wordmarkWhite.toString('base64')}`,
    tagsCloud: `data:image/png;base64,${tagsCloud.toString('base64')}`,
  }
}

interface CoverData {
  dataUri: string
  byteDigest: string
}

async function resolveCover(cover: string): Promise<CoverData | null> {
  if (!cover)
    return null
  let data: Buffer
  if (/^https?:\/\//.test(cover)) {
    const response = await fetch(cover)
    if (!response.ok) {
      console.warn(`og-render: cover fetch failed (${response.status}): ${cover}`)
      return null
    }
    data = Buffer.from(await response.arrayBuffer())
  }
  else if (cover.startsWith('/')) {
    try {
      data = await readFile(resolve(STATIC_DIR, cover.slice(1)))
    }
    catch {
      console.warn(`og-render: cover not found: ${cover}`)
      return null
    }
  }
  else {
    return null
  }
  // 等比缩放 + 居中裁剪到卡片尺寸（cover 填充），避免 satori 硬拉伸失真
  const normalized = await sharp(data)
    .rotate()
    .resize(1200, 630, { fit: 'cover' })
    .png()
    .toBuffer()
    .catch((error: unknown) => {
      console.warn(`og-render: cover decode failed: ${cover}`, error)
      return null
    })
  if (normalized === null)
    return null
  const byteDigest = createHash('sha256').update(data).digest('hex')
  return { dataUri: `data:image/png;base64,${normalized.toString('base64')}`, byteDigest }
}

function renderCard(meta: ArticleMeta, cover: string, assets: Assets, fonts: FontSet): Response {
  const title = clipCardText(cleanCardText(meta.title), 36)
  const desc = clipCardText(cleanCardText(meta.description), 60)

  const background = cover
    ? (
        h('div', {
          style: {
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          },
        }, h('img', { src: cover, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0 } }), h('div', {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage:
              'linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 18%, rgba(0, 0, 0, 0.32) 32%, rgba(0, 0, 0, 0.16) 45%, rgba(0, 0, 0, 0) 60%)',
          },
        }), h('div', {
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0) 26%)',
          },
        }))
      )
    : h('img', {
        src: assets.tagsCloud,
        width: 1200,
        height: 630,
        style: { position: 'absolute', top: 0, left: 0 },
      })

  return new ImageResponse(
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          position: 'relative',
          backgroundColor: '#bfbfbf',
          fontFamily: SERIF_FAMILY,
        },
      },
      background,
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '64px 72px',
          },
        },
        h('img', { src: cover ? assets.wordmarkWhite : assets.wordmarkDark, width: 156, height: 44 }),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', flexGrow: 1 } },
          h('div', { style: { display: 'flex', flexGrow: 1 } }),
          h('div', {
            style: {
              fontSize: titleFontSize(title.length),
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.3,
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5), 0 4px 15px rgba(0, 0, 0, 0.3)',
            },
          }, title),
          desc
            ? h('div', {
                style: {
                  fontSize: 26,
                  fontWeight: 400,
                  color: '#f0f0f0',
                  lineHeight: 1.5,
                  marginTop: 24,
                  fontFamily: SANS_FAMILY,
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25)',
                },
              }, desc)
            : null,
        ),
      ),
    ) as unknown as ReactElement,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: SERIF_FAMILY, data: fonts.serif, weight: 700, style: 'normal' },
        { name: SANS_FAMILY, data: fonts.sans, weight: 400, style: 'normal' },
      ],
    },
  )
}

async function loadManifest(): Promise<OgManifest> {
  try {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as OgManifest
    if (raw.version === 1 && typeof raw.records === 'object')
      return raw
  }
  catch {
    // first run or corrupted cache — start fresh
  }
  return { version: 1, records: {} }
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const files = (await readdir(CONTENT_DIR)).filter(
    file => file.endsWith('.md') && !file.startsWith('_'),
  )
  if (files.length === 0)
    throw new Error('no article sources found')

  const metas: ArticleMeta[] = []
  for (const fileName of files) {
    const front = parseArticleFrontMatter(await readFile(resolve(CONTENT_DIR, fileName), 'utf8'))
    const meta = describeArticle(fileName, front)
    if (metas.some(existing => existing.route === meta.route))
      throw new Error(`duplicate route: ${meta.route}`)
    metas.push(meta)
  }

  const [assets, fonts, manifest] = await Promise.all([loadAssets(), loadFonts(), loadManifest()])
  const serifChars = new Set(openSync(SERIF_PATH).characterSet)
  const sansChars = new Set(openSync(SANS_PATH).characterSet)
  const missing = new Map<string, Set<string>>()
  const nextManifest: OgManifest = { version: 1, records: {} }
  let rendered = 0
  let skipped = 0

  for (const meta of metas) {
    for (const char of new Set(`${meta.title}${meta.description}`)) {
      const code = char.codePointAt(0) ?? 0
      if (!serifChars.has(code) && !sansChars.has(code)) {
        const routes = missing.get(char) ?? new Set()
        routes.add(meta.route)
        missing.set(char, routes)
      }
    }
    const cover = await resolveCover(meta.cover)
    const output = `og/articles/${meta.route}.jpg`
    await rm(resolve(OUTPUT_DIR, `${meta.route}.png`), { force: true })
    const decision = decideRender(meta, cover?.byteDigest ?? null, manifest, output)
    if (decision.render) {
      const response = await renderCard(meta, cover?.dataUri ?? '', assets, fonts)
      const png = Buffer.from(await response.arrayBuffer())
      const jpeg = await sharp(png)
        .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' })
        .toBuffer()
      const outPath = resolve(OUTPUT_DIR, `${meta.route}.jpg`)
      await writeFile(outPath, jpeg)
      rendered += 1
      console.log(`og-render: ${meta.route} ${jpeg.length} bytes`)
    }
    else {
      skipped += 1
    }
    nextManifest.records[meta.route] = { digest: decision.digest, output }
  }

  const currentRoutes = new Set(metas.map(meta => meta.route))
  let removed = 0
  for (const route of Object.keys(manifest.records)) {
    if (currentRoutes.has(route))
      continue
    await rm(resolve(OUTPUT_DIR, `${route}.jpg`), { force: true })
    removed += 1
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
  if (missing.size > 0) {
    const sample = [...missing.entries()].slice(0, 8).map(([char, routes]) => `"${char}"(U+${char.codePointAt(0)?.toString(16).toUpperCase()}) → ${[...routes].slice(0, 3).join(',')}`).join('; ')
    console.warn(`og-render: 字体子集缺少 ${missing.size} 个字符: ${sample} — 按 docs/og-image-notes.md §4.6 重建 scripts/og-render/fonts/`)
  }
  console.log(`og-render: rendered ${rendered}, skipped ${skipped}, removed ${removed}, routes ${metas.length}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main()
