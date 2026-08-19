import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { camelCase } from 'lodash-es'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function collectFiles(
  dir: string,
  predicate: (file: string) => boolean,
  out: string[] = [],
): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, predicate, out)
    }
    else if (predicate(full)) {
      out.push(full)
    }
  }
  return out
}

/** 提取模板中 <i18n.t key="..."> 的字面量键 */
function extractTemplateKeys(templateFiles: string[]): string[] {
  const keys: string[] = []
  const pattern = /<i18n\.t[^>]*?key="([^"]+)"/g
  for (const file of templateFiles) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(pattern))
      keys.push(match[1])
  }
  return keys
}

/** 提取 JS 源码中 HIBIKILOGY_TRANSLATIONS.<key> 的引用 */
function extractJsTranslationRefs(jsFiles: string[]): string[] {
  const refs: string[] = []
  const pattern = /HIBIKILOGY_TRANSLATIONS\.(\w+)/g
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(pattern))
      refs.push(match[1])
  }
  return refs
}

interface CmsField {
  name: string
  defaultValue: string
}

/**
 * 按缩进提取 admin.yml 中 i18n collection 的字段。
 * 只匹配 4 空格缩进的顶层 `- name: i18n` 到下一个顶层 collection 之间的
 * fields 块（10 空格 `- name:` + 12 空格 `default:`），
 * 避免把 posts/docs 等其他 collection 的字段一并收进来。
 */
function extractCmsI18nFields(adminYml: string): CmsField[] {
  const fields: CmsField[] = []
  let inI18n = false
  let inFields = false
  let currentName: string | null = null

  for (const line of adminYml.split('\n')) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    const trimmed = line.trim()

    if (!inI18n) {
      if (indent === 4 && trimmed === '- name: i18n')
        inI18n = true
      continue
    }

    // 下一个顶层 collection 结束 i18n 段
    if (indent <= 4 && trimmed.startsWith('- name:'))
      break

    if (!inFields) {
      if (trimmed === 'fields:')
        inFields = true
      continue
    }

    // 离开 fields 块（缩进回退到 fields 声明级别或更浅）
    if (indent <= 6 && trimmed !== '') {
      inFields = false
      continue
    }

    const nameMatch = trimmed.match(/^- name: (\w+)$/)
    if (nameMatch) {
      currentName = nameMatch[1]
      continue
    }

    const defaultMatch = trimmed.match(/^default: (.*)$/)
    if (defaultMatch && currentName) {
      fields.push({ name: currentName, defaultValue: defaultMatch[1] })
      currentName = null
    }
  }

  return fields
}

function normalizeScalar(value: string): string {
  if ((value.startsWith('\'') && value.endsWith('\''))
    || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1)
  }
  return value
}

function unique(values: string[]): Set<string> {
  return new Set(values)
}

describe('i18n key consistency', () => {
  const templateFiles = collectFiles(
    join(ROOT, 'themes/hibikilogy/templates'),
    file => file.endsWith('.html'),
  )
  const jsFiles = collectFiles(
    join(ROOT, 'themes/hibikilogy/src'),
    file => (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.endsWith('.test.ts'),
  )

  const themeI18n = parse(
    readFileSync(join(ROOT, 'themes/hibikilogy/i18n/zh.toml'), 'utf8'),
  ) as Record<string, unknown>
  const tomlKeys = Object.keys(themeI18n)
  const tomlCamelKeys = unique(tomlKeys.map(camelCase))
  const templateKeys = unique(extractTemplateKeys(templateFiles))
  const jsRefs = unique(extractJsTranslationRefs(jsFiles))
  const cmsFields = extractCmsI18nFields(
    readFileSync(join(ROOT, 'static/admin/config.yml'), 'utf8'),
  )

  it('模板 <i18n.t key> 字面量键都在 zh.toml 中', () => {
    const missing = [...templateKeys].filter(key => !tomlKeys.includes(key))
    expect(missing).toEqual([])
  })

  it('js 引用键都在 camelCase(zh.toml) 中', () => {
    const missing = [...jsRefs].filter(key => !tomlCamelKeys.has(key))
    expect(missing).toEqual([])
  })

  it('zh.toml 键转 camelCase 无冲突', () => {
    expect(tomlCamelKeys.size).toBe(tomlKeys.length)
  })

  it('zh.toml 所有值必须是字符串', () => {
    const nonStrings = tomlKeys.filter(key => typeof themeI18n[key] !== 'string')
    expect(nonStrings).toEqual([])
  })

  it('zh.toml 键与 CMS i18n 字段名一致（无缺失、无孤儿）', () => {
    // 手写解析器在 config.yml 结构调整时会静默返回空列表，使本用例形同虚设。
    expect(cmsFields.length).toBeGreaterThan(0)
    const cmsNames = cmsFields.map(field => field.name)
    const missing = tomlKeys.filter(key => !cmsNames.includes(key))
    const orphaned = cmsNames.filter(name => !tomlKeys.includes(name))
    expect(missing).toEqual([])
    expect(orphaned).toEqual([])
  })

  it('atom.xml 的 theme_i18n 键都在 zh.toml 中', () => {
    const atomContent = readFileSync(
      join(ROOT, 'themes/hibikilogy/templates/atom.xml'),
      'utf8',
    )
    const atomKeys = [...atomContent.matchAll(/theme_i18n\["(\w+)"\]/g)]
      .map(match => match[1])
    expect(atomKeys.length).toBeGreaterThan(0)
    const missing = atomKeys.filter(key => !tomlKeys.includes(key))
    expect(missing).toEqual([])
  })

  it('cms i18n 字段名不重复', () => {
    const cmsNames = cmsFields.map(field => field.name)
    expect(new Set(cmsNames).size).toBe(cmsNames.length)
  })

  it('cms i18n 字段默认值与 zh.toml 值一致', () => {
    const mismatches = cmsFields
      .filter(field => normalizeScalar(field.defaultValue) !== themeI18n[field.name])
      .map(field => field.name)
    expect(mismatches).toEqual([])
  })

  it('占位符契约：{0} 键仅被 JS 消费，{page} 键仅被模板消费', () => {
    const numberedKeys = tomlKeys.filter(key => (themeI18n[key] as string).includes('{0}'))
    const pageKeys = tomlKeys.filter(key => (themeI18n[key] as string).includes('{page}'))

    const inTemplates = numberedKeys.filter(key => templateKeys.has(key))
    const inJs = pageKeys.filter(key => jsRefs.has(camelCase(key)))

    expect(inTemplates).toEqual([])
    expect(inJs).toEqual([])
  })
})
