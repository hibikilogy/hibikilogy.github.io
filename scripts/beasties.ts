import { Buffer } from 'node:buffer'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib'
import Beasties from 'beasties'

const root = resolve(import.meta.dirname, '..')
const publicDir = resolve(root, 'public')

const { glob } = await import('tinyglobby')
const files = await glob('public/**/*.html', { cwd: root })

if (!files.length)
  throw new Error('No HTML files found under public; run the Zola build first')

const processors = new Map<string, Beasties>()
const stylesheetSizes = new Map<string, Promise<number | 'external' | 'missing'>>()
const blockingLocalStylesheets = new Set<string>()
let totalBefore = 0
let totalAfter = 0
let totalGzipBefore = 0
let totalGzipAfter = 0
let totalBrotliBefore = 0
let totalBrotliAfter = 0
let criticalCssBytes = 0
let pagesWithCriticalCss = 0
let processedPages = 0
let asyncStylesheets = 0
let blockingStylesheets = 0
let pagesWithBlockingStylesheets = 0
let blockingLocalCssBytes = 0
let blockingLocalCssUniqueBytes = 0
let blockingExternalStylesheets = 0
let blockingMissingStylesheets = 0
for (const file of files) {
  const html = await readFile(file, 'utf-8')
  const htmlBytes = Buffer.byteLength(html, 'utf-8')
  totalBefore += htmlBytes
  const beasties = getProcessor(html)
  if (!beasties) {
    totalAfter += htmlBytes
    await recordStylesheetStats(html)
    continue
  }
  processedPages++
  totalGzipBefore += gzipSync(html).byteLength
  totalBrotliBefore += getBrotliSize(html)
  const result = await beasties.process(html)
  totalAfter += Buffer.byteLength(result, 'utf-8')
  totalGzipAfter += gzipSync(result).byteLength
  totalBrotliAfter += getBrotliSize(result)
  const addedCssBytes = Math.max(0, getInlineCssBytes(result) - getInlineCssBytes(html))
  criticalCssBytes += addedCssBytes
  if (addedCssBytes > 0)
    pagesWithCriticalCss++
  await recordStylesheetStats(result)
  await writeFile(file, result)
}

async function recordStylesheetStats(html: string): Promise<void> {
  const stylesheetStats = getStylesheetStats(html)
  asyncStylesheets += stylesheetStats.async
  blockingStylesheets += stylesheetStats.blockingHrefs.length
  if (stylesheetStats.blockingHrefs.length > 0)
    pagesWithBlockingStylesheets++
  for (const href of stylesheetStats.blockingHrefs) {
    const size = await getLocalStylesheetSize(href)
    if (size === 'external') {
      blockingExternalStylesheets++
    }
    else if (size === 'missing') {
      blockingMissingStylesheets++
    }
    else {
      blockingLocalCssBytes += size
      if (!blockingLocalStylesheets.has(href)) {
        blockingLocalStylesheets.add(href)
        blockingLocalCssUniqueBytes += size
      }
    }
  }
}

if (!pagesWithCriticalCss) {
  throw new Error(
    'Beasties did not inline any critical CSS; verify the generated stylesheet URLs',
  )
}

console.table({
  pages: { value: files.length },
  pagesWithCriticalCss: { value: pagesWithCriticalCss },
  processedPages: { value: processedPages },
  skippedPages: { value: files.length - processedPages },
  htmlBefore: { value: formatBytes(totalBefore) },
  htmlAfter: { value: formatBytes(totalAfter) },
  htmlDelta: { value: formatDelta(totalAfter - totalBefore) },
  gzipDelta: { value: formatDelta(totalGzipAfter - totalGzipBefore) },
  brotliQ5Delta: { value: formatDelta(totalBrotliAfter - totalBrotliBefore) },
  cssInlined: { value: formatBytes(criticalCssBytes) },
  avgPerProcessedPage: { value: `${(criticalCssBytes / pagesWithCriticalCss).toFixed(0)} B` },
  asyncStylesheets: { value: asyncStylesheets },
  pagesWithBlockingStylesheets: { value: pagesWithBlockingStylesheets },
  blockingStylesheets: { value: blockingStylesheets },
  blockingLocalCssReferenced: { value: formatBytes(blockingLocalCssBytes) },
  blockingLocalCssUnique: { value: formatBytes(blockingLocalCssUniqueBytes) },
  blockingExternalStylesheets: { value: blockingExternalStylesheets },
  blockingMissingStylesheets: { value: blockingMissingStylesheets },
})

function getProcessor(html: string): Beasties | null {
  const publicPath = getStylesheetPublicPath(html)
  if (!publicPath)
    return null

  const existing = processors.get(publicPath)
  if (existing)
    return existing

  const beasties = new Beasties({
    preload: 'media',
    inlineThreshold: 0,
    compress: true,
    keyframes: 'critical',
    fonts: false,
    path: publicDir,
    publicPath,
    logLevel: 'warn',
  })
  processors.set(publicPath, beasties)
  return beasties
}

function getStylesheetPublicPath(html: string): string | null {
  const stylesheetUrl = html.match(/https?:\/\/[^"'\s>]+\/styles\/[^"'\s>]+/i)?.[0]

  if (!stylesheetUrl)
    return null

  const url = new URL(stylesheetUrl)
  const stylesOffset = url.pathname.indexOf('/styles/')
  if (stylesOffset < 0)
    throw new Error(`Could not derive the stylesheet public path from ${stylesheetUrl}`)

  return `${url.origin}${url.pathname.slice(0, stylesOffset + 1)}`
}

function getInlineCssBytes(html: string): number {
  let bytes = 0
  for (const match of html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi))
    bytes += Buffer.byteLength(match[1] ?? '', 'utf-8')
  return bytes
}

function getStylesheetStats(html: string): { async: number, blockingHrefs: string[] } {
  const document = html.replace(/<noscript(?:\s[^>]*)?>[\s\S]*?<\/noscript>/gi, '')
  const blockingHrefs: string[] = []
  let async = 0

  for (const match of document.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = getAttribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? []
    if (!rel.includes('stylesheet'))
      continue

    const media = getAttribute(tag, 'media')?.trim().toLowerCase()
    const onload = getAttribute(tag, 'onload')
    if (media === 'print' && onload?.includes('.media=')) {
      async++
      continue
    }
    if (media === 'print')
      continue

    const href = getAttribute(tag, 'href')
    if (href)
      blockingHrefs.push(href)
  }

  return { async, blockingHrefs }
}

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ))
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function getLocalStylesheetSize(href: string): Promise<number | 'external' | 'missing'> {
  const existing = stylesheetSizes.get(href)
  if (existing)
    return existing

  const size = readLocalStylesheetSize(href)
  stylesheetSizes.set(href, size)
  return size
}

async function readLocalStylesheetSize(href: string): Promise<number | 'external' | 'missing'> {
  const url = new URL(href, 'https://local.invalid')
  const stylesOffset = url.pathname.indexOf('/styles/')
  if (stylesOffset < 0)
    return 'external'

  const relativePath = decodeURIComponent(url.pathname.slice(stylesOffset + 1))
  const stylesheetPath = resolve(publicDir, relativePath)
  const pathFromPublic = relative(publicDir, stylesheetPath)
  if (pathFromPublic.startsWith('..') || isAbsolute(pathFromPublic))
    throw new Error(`Stylesheet path escapes the public directory: ${href}`)

  try {
    return (await stat(stylesheetPath)).size
  }
  catch {
    return 'missing'
  }
}

function formatDelta(bytes: number): string {
  const sign = bytes > 0 ? '+' : ''
  return `${sign}${formatBytes(bytes)}`
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

function getBrotliSize(content: string): number {
  return brotliCompressSync(content, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
    },
  }).byteLength
}
