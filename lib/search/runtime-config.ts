/**
 * Centralized access to **dynamic** runtime configuration.
 *
 * Dynamic values come from server-injected `window.__HIBIKILOGY_*` variables
 * (set by `templates/base.html`). Static values from `config.toml` are
 * injected at build time by Vite via the `virtual:hibikilogy-config` module.
 */

export interface RuntimeConfig {
  /** Canonical base URL of the site. */
  readonly baseUrl: string
  /** Full URL to the search index JSON file. */
  readonly searchIndexUrl: string
  /** Full URL to the search worker script. */
  readonly searchWorkerUrl: string
}

const DEFAULTS: RuntimeConfig = {
  baseUrl: 'http://localhost',
  searchIndexUrl: 'search_index.zh.json',
  searchWorkerUrl: '/js/search/worker.js',
}

let cached: RuntimeConfig | null = null

function resolve(): RuntimeConfig {
  if (typeof window === 'undefined')
    return DEFAULTS

  return {
    baseUrl: window.__HIBIKILOGY_BASE_URL || DEFAULTS.baseUrl,
    searchIndexUrl: window.__HIBIKILOGY_SEARCH_INDEX_URL || DEFAULTS.searchIndexUrl,
    searchWorkerUrl: window.__HIBIKILOGY_SEARCH_WORKER_URL || DEFAULTS.searchWorkerUrl,
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  return cached ??= resolve()
}

export function resetRuntimeConfig(): void {
  cached = null
}
