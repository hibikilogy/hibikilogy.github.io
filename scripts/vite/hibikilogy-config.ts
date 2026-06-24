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

function generateModule(tomlPath: string): string {
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

      return generateModule(tomlPath)
    },

    async handleHotUpdate({ file, server }) {
      if (normalizePath(file) !== normalizedTomlPath)
        return

      const module = server.moduleGraph.getModuleById(RESOLVED_ID)

      if (!module)
        return []

      await server.reloadModule(module)
      return []
    },
  }
}
