import type { RuntimeConfig } from './types.ts'
import { catchError } from '../result.ts'

const RUNTIME_CONFIG_ID = 'hibikilogy-runtime-config'
const defaults: RuntimeConfig = {
  baseUrl: 'http://localhost',
  searchIndexUrl: 'search_index.zh.json',
  searchWorkerUrl: '/js/search/worker.js',
  searchArticlesDataUrl: 'search-articles/',
  searchTagsDataUrl: 'search-tags/',
}

let cached: RuntimeConfig | null = null

export function getRuntimeConfig(
  root: ParentNode | undefined = typeof document !== 'undefined' ? document : undefined,
): RuntimeConfig {
  if (cached)
    return cached

  if (!root)
    return defaults

  const element = root.querySelector<HTMLScriptElement>(`#${RUNTIME_CONFIG_ID}`)
  if (!element?.textContent)
    return defaults

  const [config] = catchError(() => {
    const value = JSON.parse(element.textContent) as Partial<RuntimeConfig>
    return {
      baseUrl: value.baseUrl || defaults.baseUrl,
      searchIndexUrl: value.searchIndexUrl || defaults.searchIndexUrl,
      searchWorkerUrl: value.searchWorkerUrl || defaults.searchWorkerUrl,
      searchArticlesDataUrl: value.searchArticlesDataUrl || defaults.searchArticlesDataUrl,
      searchTagsDataUrl: value.searchTagsDataUrl || defaults.searchTagsDataUrl,
    }
  })
  cached = config ?? defaults

  return cached
}

export function resetRuntimeConfig(): void {
  cached = null
}
