import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Beasties from 'beasties'

const root = resolve(import.meta.dirname, '..')
const publicDir = resolve(root, 'public')

const { glob } = await import('tinyglobby')
const files = await glob('public/**/*.html', { cwd: root })

if (!files.length)
  throw new Error('No HTML files found under public; run the Zola build first')

const processors = new Map<string, Beasties>()
let totalBefore = 0
let totalAfter = 0
let criticalCssBytes = 0
let pagesWithCriticalCss = 0
let processedPages = 0

for (const file of files) {
  const html = await readFile(file, 'utf-8')
  const htmlBytes = Buffer.byteLength(html, 'utf-8')
  totalBefore += htmlBytes
  const beasties = getProcessor(html)
  if (!beasties) {
    totalAfter += htmlBytes
    continue
  }
  processedPages++
  const result = await beasties.process(html)
  totalAfter += Buffer.byteLength(result, 'utf-8')
  const addedCssBytes = Math.max(0, getInlineCssBytes(result) - getInlineCssBytes(html))
  criticalCssBytes += addedCssBytes
  if (addedCssBytes > 0)
    pagesWithCriticalCss++
  await writeFile(file, result)
}

if (!pagesWithCriticalCss) {
  throw new Error(
    'Beasties did not inline any critical CSS; verify the generated stylesheet URLs',
  )
}

console.table({
  summary: {
    pages: files.length,
    pagesWithCriticalCss,
    processedPages,
    skippedPages: files.length - processedPages,
    htmlBefore: `${(totalBefore / 1024).toFixed(0)} KB`,
    htmlAfter: `${(totalAfter / 1024).toFixed(0)} KB`,
    cssInlined: `${(criticalCssBytes / 1024).toFixed(0)} KB`,
    avgPerProcessedPage: `${(criticalCssBytes / pagesWithCriticalCss).toFixed(0)} B`,
  },
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
    inlineThreshold: 8192,
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
