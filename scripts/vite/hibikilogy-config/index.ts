import type { Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { camelCase, isPlainObject } from 'lodash-es'
import { parse } from 'smol-toml'
import { normalizePath } from 'vite'

type Scalar = string | number | boolean
export type TomlObject = Record<string, unknown>

const VIRTUAL_ID = 'virtual:hibikilogy-config'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

function isTomlObject(value: unknown): value is TomlObject {
  return isPlainObject(value)
}

function getThemeI18nPath(config: TomlObject, rootDir: string): string | null {
  const themeName = typeof config.theme === 'string'
    ? config.theme
    : undefined
  const lang = typeof config.default_language === 'string'
    ? config.default_language
    : 'en'

  return themeName
    ? resolve(rootDir, 'themes', themeName, 'i18n', `${lang}.toml`)
    : null
}

function getConfiguredThemeI18nPath(tomlPath: string, rootDir: string): string | null {
  const parsed = parse(readFileSync(tomlPath, 'utf8')) as TomlObject
  return getThemeI18nPath(parsed, rootDir)
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

interface PreparedRoot {
  /** 根配置，已剥离 translations / 各语言 translations / extra */
  root: TomlObject
  /** [extra]，已剥离废弃的 extra.translations */
  extra: TomlObject
  /** 站点翻译：顶层 [translations] 或 [languages.<default>.translations]，二选一 */
  siteTranslations: TomlObject
}

/**
 * 结构化提取站点翻译，使剩余部分可安全地扁平化进 HIBIKILOGY_CONFIG。
 *
 * 与 Zola 的 LanguageOptions::merge() 语义一致：默认语言的翻译只能通过
 * 顶层 [translations] 或 [languages.<default>.translations] 之一提供，
 * 二者同时非空会报错，而不是叠加覆盖。
 */
export function prepareRoot(parsed: TomlObject): PreparedRoot {
  const root = { ...parsed }

  const extra = isTomlObject(root.extra)
    ? { ...root.extra }
    : {}

  const languages = isTomlObject(root.languages)
    ? { ...root.languages }
    : {}

  const defaultLang = typeof root.default_language === 'string'
    ? root.default_language
    : 'en'

  // 剥离各语言的 translations：默认语言的用于 JS 烘焙，其余语言的丢弃，
  // 避免被 flattenScalars 展开成 languagesZhTranslationsSearchPlaceholder 之类的键
  let languageTranslations: TomlObject = {}
  for (const [langCode, langOptions] of Object.entries(languages)) {
    if (!isTomlObject(langOptions))
      continue
    const options = { ...langOptions }
    if (isTomlObject(options.translations)) {
      if (langCode === defaultLang) {
        languageTranslations = options.translations
      }
      delete options.translations
    }
    languages[langCode] = options
  }

  const rootTranslations = isTomlObject(root.translations)
    ? root.translations
    : {}

  if (Object.keys(rootTranslations).length > 0
    && Object.keys(languageTranslations).length > 0) {
    throw new Error(
      '[hibikilogy-config] translations for the default language are specified twice',
    )
  }

  const siteTranslations = Object.keys(rootTranslations).length > 0
    ? rootTranslations
    : languageTranslations

  delete root.extra
  delete root.translations
  root.languages = languages
  // [extra].translations 已废弃：不参与翻译合并，也不应混入 config 展平
  delete extra.translations

  return { root, extra, siteTranslations }
}

/**
 * 客户端翻译：站点默认语言翻译（顶层 [translations] 或
 * [languages.<default>.translations]，二选一）覆盖主题 i18n/<default>.toml。
 *
 * 只烘焙 default_language 的翻译；不提供按页面语言切换的客户端翻译。
 */
export function resolveTranslations(
  prepared: PreparedRoot,
  rootDir: string,
): Record<string, Scalar> {
  const { root, siteTranslations } = prepared

  const translations: Record<string, Scalar> = {}
  const themeI18nPath = getThemeI18nPath(root, rootDir)
  if (themeI18nPath && existsSync(themeI18nPath)) {
    const i18nParsed = parse(readFileSync(themeI18nPath, 'utf8')) as TomlObject
    flattenScalars(i18nParsed, [], translations)
  }

  const siteTranslationsFlattened = flattenScalars(siteTranslations)
  for (const [key, value] of Object.entries(siteTranslationsFlattened)) {
    if (typeof value !== 'string') {
      throw new TypeError(
        `[hibikilogy-config] Translation value for '${key}' must be a string`,
      )
    }
  }
  Object.assign(translations, siteTranslationsFlattened)

  return translations
}

export function generateModule(tomlPath: string, rootDir: string): string {
  const parsed = parse(
    readFileSync(tomlPath, 'utf8'),
  ) as TomlObject

  const prepared = prepareRoot(parsed)

  /*
   * 分别展开根配置和 [extra]，使同名属性能够触发重复检测，
   * 而不是在对象展开阶段被静默覆盖。
   */
  const config = flattenScalars(prepared.root)
  flattenScalars(prepared.extra, [], config)

  const translations = resolveTranslations(prepared, rootDir)

  return [
    '// Generated from zola.toml.',
    '// DO NOT EDIT.',
    '',
    `export const HIBIKILOGY_CONFIG = ${JSON.stringify(config, null, 2)}`,
    '',
    `export const HIBIKILOGY_TRANSLATIONS = ${JSON.stringify(translations, null, 2)}`,
    '',
  ].join('\n')
}

export function hibikilogyConfigPlugin(rootDir: string): Plugin {
  const tomlPath = resolve(rootDir, 'zola.toml')
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

      const i18nPath = getConfiguredThemeI18nPath(tomlPath, rootDir)
      if (i18nPath)
        this.addWatchFile(i18nPath)

      return generateModule(tomlPath, rootDir)
    },

    async handleHotUpdate({ file, server }) {
      const normalizedFile = normalizePath(file)
      const i18nPath = getConfiguredThemeI18nPath(tomlPath, rootDir)
      const normalizedI18nPath = i18nPath ? normalizePath(i18nPath) : ''
      if (normalizedFile !== normalizedTomlPath && normalizedFile !== normalizedI18nPath)
        return

      const module = server.moduleGraph.getModuleById(RESOLVED_ID)

      if (!module)
        return []

      await server.reloadModule(module)
      return []
    },
  }
}
