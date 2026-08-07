/* eslint-disable ts/naming-convention -- 测试构造的是 TOML 键名，保持 snake_case */
import type { TomlObject } from './index.ts'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateModule, prepareRoot, resolveTranslations } from './index.ts'

const THEME_I18N = 'search_placeholder = "搜索"\nsearch_found = "共找到 {0} 条"\n'

function makeRootDir(): string {
  return mkdtempSync(join(tmpdir(), 'hibikilogy-config-'))
}

function writeThemeI18n(rootDir: string, lang: string, toml: string): void {
  const dir = join(rootDir, 'themes', 'hibikilogy', 'i18n')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${lang}.toml`), toml, 'utf8')
}

describe('prepareRoot', () => {
  it('剥离各语言的 translations，默认语言的供烘焙、其余语言的丢弃', () => {
    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      languages: {
        zh: { title: '中文', translations: { search_placeholder: 'a' } },
        en: { translations: { search_placeholder: 'b' } },
      },
    }

    const { root, siteTranslations } = prepareRoot(parsed)

    expect(siteTranslations).toEqual({ search_placeholder: 'a' })
    const zh = (root.languages as TomlObject).zh as TomlObject
    const en = (root.languages as TomlObject).en as TomlObject
    expect(zh).toEqual({ title: '中文' })
    expect(en).toEqual({})
  })
})

describe('resolveTranslations', () => {
  let rootDir: string

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('仅主题翻译', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = { theme: 'hibikilogy', default_language: 'zh' }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations.searchPlaceholder).toBe('搜索')
    expect(translations.searchFound).toBe('共找到 {0} 条')
  })

  it('顶层 [translations] 覆盖主题', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      translations: { search_placeholder: '自定义搜索' },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations.searchPlaceholder).toBe('自定义搜索')
    // 未覆盖键保留主题基线
    expect(translations.searchFound).toBe('共找到 {0} 条')
  })

  it('[languages.zh.translations] 覆盖主题', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      languages: {
        zh: { translations: { search_placeholder: '语言级搜索' } },
      },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations.searchPlaceholder).toBe('语言级搜索')
    expect(translations.searchFound).toBe('共找到 {0} 条')
  })

  it('两种默认语言翻译同时存在时抛错', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      translations: { search_placeholder: 'a' },
      languages: { zh: { translations: { search_placeholder: 'b' } } },
    }

    expect(() => resolveTranslations(prepareRoot(parsed), rootDir)).toThrow(
      'translations for the default language are specified twice',
    )
  })

  it('[extra].translations 不再生效', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      extra: { translations: { search_placeholder: 'extra 值' } },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    // 主题基线值，不被废弃的 extra.translations 覆盖
    expect(translations.searchPlaceholder).toBe('搜索')
  })

  it('未设置 default_language 时使用 en', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'en', 'search_placeholder = "Search"\n')

    const parsed: TomlObject = { theme: 'hibikilogy' }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations.searchPlaceholder).toBe('Search')
  })

  it('非默认语言的 translations 不参与烘焙', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      languages: {
        en: { translations: { search_placeholder: 'Search' } },
      },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations.searchPlaceholder).toBe('搜索')
  })

  it('主题 i18n 文件不存在时仅返回站点翻译', () => {
    rootDir = makeRootDir()

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      translations: { search_placeholder: '自定义搜索' },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations).toEqual({ searchPlaceholder: '自定义搜索' })
  })

  it('无 theme 配置时仅烘焙站点翻译', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      default_language: 'zh',
      translations: { search_placeholder: '自定义搜索' },
    }
    const translations = resolveTranslations(prepareRoot(parsed), rootDir)

    expect(translations).toEqual({ searchPlaceholder: '自定义搜索' })
  })

  it('非字符串翻译值抛错', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)

    const parsed: TomlObject = {
      theme: 'hibikilogy',
      default_language: 'zh',
      translations: { search_page_size: 12 },
    }

    expect(() => resolveTranslations(prepareRoot(parsed), rootDir)).toThrow(
      'must be a string',
    )
  })

  it('snake_case 转 camelCase 冲突抛错', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', 'foo_bar = "a"\nfoo-bar = "b"\n')

    const parsed: TomlObject = { theme: 'hibikilogy', default_language: 'zh' }

    expect(() => resolveTranslations(prepareRoot(parsed), rootDir)).toThrow(
      'Duplicate property',
    )
  })
})

describe('generateModule', () => {
  let rootDir: string

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('展平 config 不含语言翻译污染键，翻译含站点覆盖值', () => {
    rootDir = makeRootDir()
    writeThemeI18n(rootDir, 'zh', THEME_I18N)
    writeFileSync(
      join(rootDir, 'zola.toml'),
      [
        'base_url = "https://example.com/"',
        'default_language = "zh"',
        'theme = "hibikilogy"',
        '[languages.zh]',
        'title = "中文站"',
        '[languages.zh.translations]',
        'search_placeholder = "语言级搜索"',
      ].join('\n'),
      'utf8',
    )

    const module = generateModule(join(rootDir, 'zola.toml'), rootDir)

    expect(module).toContain('export const HIBIKILOGY_CONFIG')
    expect(module).toContain('export const HIBIKILOGY_TRANSLATIONS')
    // 翻译键不混入 config 展平
    expect(module).not.toContain('languagesZhTranslationsSearchPlaceholder')
    // 站点翻译覆盖主题基线
    expect(module).toContain('"searchPlaceholder": "语言级搜索"')
    // 语言选项标量仍正常展平
    expect(module).toContain('"languagesZhTitle": "中文站"')
  })
})
