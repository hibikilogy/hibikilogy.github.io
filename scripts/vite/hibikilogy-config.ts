import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { camelCase, isPlainObject } from 'lodash-es'
import { parse } from 'smol-toml'
import { normalizePath } from 'vite'

type Scalar = string | number | boolean
type TomlObject = Record<string, unknown>

const VIRTUAL_ID = 'virtual:hibikilogy-config'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

function isTomlObject(value: unknown): value is TomlObject {
  return isPlainObject(value)
}

function flattenScalars(
  object: TomlObject,
  path: string[] = [],
  result: Record<string, Scalar> = {},
): Record<string, Scalar> {
  for (const [key, value] of Object.entries(object)) {
    const currentPath = [...path, key]

    if (
      typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      const property = camelCase(currentPath.join(' '))

      if (property in result) {
        throw new Error(
          `[hibikilogy-config] Duplicate property: ${property}`,
        )
      }

      result[property] = value
    }
    else if (isTomlObject(value)) {
      flattenScalars(value, currentPath, result)
    }
  }

  return result
}

function generateModule(tomlPath: string, rootDir: string): string {
  const parsed = parse(
    readFileSync(tomlPath, 'utf8'),
  ) as TomlObject

  const root = { ...parsed }

  const extra = isTomlObject(root.extra)
    ? { ...root.extra }
    : {}

  const rootTranslations = isTomlObject(root.translations)
    ? root.translations
    : {}

  const extraTranslations = isTomlObject(extra.translations)
    ? extra.translations
    : {}

  delete root.extra
  delete root.translations
  delete extra.translations

  /*
   * 分别展开根配置和 [extra]，使同名属性能够触发重复检测，
   * 而不是在对象展开阶段被静默覆盖。
   */
  const config = flattenScalars(root)
  flattenScalars(extra, [], config)

  const translations = flattenScalars(rootTranslations)
  flattenScalars(extraTranslations, [], translations)

  // Load theme i18n file (site config.toml [translations] take priority via merge order above)
  const themeName = root.theme as string | undefined
  const lang = (root.default_language as string) || 'zh'
  if (themeName && Object.keys(translations).length === 0) {
    const i18nPath = resolve(rootDir, 'themes', themeName, 'i18n', `${lang}.toml`)
    try {
      const i18nParsed = parse(readFileSync(i18nPath, 'utf8')) as TomlObject
      flattenScalars(i18nParsed, [], translations)
    }
    catch {
      // i18n file not found or unparseable — use site translations only
    }
  }

  return [
    '// Generated from config.toml.',
    '// DO NOT EDIT.',
    '',
    `export const HIBIKILOGY_CONFIG = ${JSON.stringify(config, null, 2)}`,
    '',
    `export const HIBIKILOGY_TRANSLATIONS = ${JSON.stringify(translations, null, 2)}`,
    '',
  ].join('\n')
}

export function hibikilogyConfigPlugin(rootDir: string): Plugin {
  const tomlPath = resolve(rootDir, 'config.toml')
  const normalizedTomlPath = normalizePath(tomlPath)

  return {
    name: 'hibikilogy-config',

    resolveId(id) {
      return id === VIRTUAL_ID
        ? RESOLVED_ID
        : null
    },

    load(id) {
      if (id !== RESOLVED_ID)
        return null

      this.addWatchFile(tomlPath)

      // Also watch the theme i18n file for HMR
      const i18nPath = resolve(rootDir, 'themes', 'hibikilogy', 'i18n', 'zh.toml')
      this.addWatchFile(i18nPath)

      return generateModule(tomlPath, rootDir)
    },

    async handleHotUpdate({ file, server }) {
      const normalizedFile = normalizePath(file)
      const i18nPath = normalizePath(resolve(rootDir, 'themes', 'hibikilogy', 'i18n', 'zh.toml'))
      if (normalizedFile !== normalizedTomlPath && normalizedFile !== i18nPath)
        return

      const module = server.moduleGraph.getModuleById(RESOLVED_ID)

      if (!module)
        return []

      await server.reloadModule(module)
      return []
    },
  }
}
