import type { Plugin } from 'vite'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface ParsedTomlEntry {
  path: string[]
  jsExpr: string
}

function toSingleQuotedJsString(value: string): string {
  return `'${value
    .replaceAll('\\', '\\\\')
    .replaceAll('\'', '\\\'')
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')}'`
}

function stripTomlComment(raw: string): string {
  let quote: '"' | '\'' | null = null

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if ((char === '"' || char === '\'') && raw[index - 1] !== '\\') {
      if (!quote) {
        quote = char
      }
      else if (quote === char) {
        quote = null
      }
    }

    if (char === '#' && !quote)
      return raw.slice(0, index).trim()
  }

  return raw.trim()
}

function toCamelCase(value: string): string {
  return value.replaceAll(/[-_]+([a-z0-9])/gi, (_, char: string) => char.toUpperCase())
}

function toConfigProperty(path: string[]): string {
  return path
    .filter(Boolean)
    .map((segment, index) => {
      const normalized = toCamelCase(segment)
      if (index === 0)
        return normalized
      return normalized.slice(0, 1).toUpperCase() + normalized.slice(1)
    })
    .join('')
}

function tomlLiteralToJs(raw: string): string | null {
  if (raw.startsWith('"""') && raw.endsWith('"""'))
    return toSingleQuotedJsString(raw.slice(3, -3))
  if (raw.startsWith('\'\'\'') && raw.endsWith('\'\'\''))
    return toSingleQuotedJsString(raw.slice(3, -3))
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith('\'') && raw.endsWith('\'')))
    return toSingleQuotedJsString(raw.slice(1, -1))
  if (raw === 'true' || raw === 'false')
    return raw
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw))
    return raw
  if (raw.startsWith('[') || raw.startsWith('{'))
    return null
  return toSingleQuotedJsString(raw)
}

function loadTomlScalarEntries(path: string): ParsedTomlEntry[] {
  const toml = readFileSync(path, 'utf-8')
  const entries: ParsedTomlEntry[] = []
  let sectionPath: string[] = []

  for (const raw of toml.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#'))
      continue

    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      sectionPath = sectionMatch[1].split('.').map(segment => segment.trim())
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex <= 0)
      continue

    const key = line.slice(0, equalsIndex).trim()
    if (!/^[a-z0-9][\w-]*$/i.test(key))
      continue

    const rawValue = stripTomlComment(line.slice(equalsIndex + 1).trim())

    const jsExpr = tomlLiteralToJs(rawValue)
    if (!jsExpr)
      continue

    const normalizedPath = [...sectionPath, key]
    if (normalizedPath[0] === 'extra')
      normalizedPath.shift()

    entries.push({
      path: normalizedPath,
      jsExpr,
    })
  }

  return entries
}

function generateObjectLiteral(entries: ParsedTomlEntry[], trimRoot?: string): string {
  const lines: string[] = ['{']

  for (const entry of entries) {
    const path = trimRoot && entry.path[0] === trimRoot
      ? entry.path.slice(1)
      : entry.path
    const property = toConfigProperty(path)
    if (!property)
      continue
    lines.push(`  ${property}: ${entry.jsExpr},`)
  }

  lines.push('} as const')
  return lines.join('\n')
}

function generateEnvModule(entries: ParsedTomlEntry[]): string {
  const translations = entries.filter(entry => entry.path[0] === 'translations')
  const config = entries.filter(entry => entry.path[0] !== 'translations')

  return [
    '// Auto-generated from config.toml by hibikilogy-config Vite plugin.',
    '// DO NOT EDIT.',
    '',
    `export const HIBIKILOGY_CONFIG = ${generateObjectLiteral(config)}`,
    '',
    `export const HIBIKILOGY_TRANSLATIONS = ${generateObjectLiteral(translations, 'translations')}`,
    '',
  ].join('\n')
}

export function syncGeneratedConfig(rootDir: string): void {
  const tomlPath = resolve(rootDir, 'config.toml')
  const entries = loadTomlScalarEntries(tomlPath)

  try {
    rmSync(resolve(rootDir, 'lib/config-env.d.ts'), { force: true })
  }
  catch {}
  writeFileSync(
    resolve(rootDir, 'lib/config-env.generated.ts'),
    generateEnvModule(entries),
    'utf-8',
  )
}

export function hibikilogyConfigPlugin(rootDir: string): Plugin {
  const tomlPath = resolve(rootDir, 'config.toml')

  return {
    name: 'hibikilogy-config',
    config() {
      syncGeneratedConfig(rootDir)
    },
    buildStart() {
      this.addWatchFile(tomlPath)
      syncGeneratedConfig(rootDir)
    },
    handleHotUpdate(context) {
      if (context.file !== tomlPath)
        return

      syncGeneratedConfig(rootDir)
      context.server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
