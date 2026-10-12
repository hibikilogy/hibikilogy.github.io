import type { RuntimeConfig } from 'shared/runtime-config/index.ts'
import type {
  SearchEngineBootstrapData,
} from '../types.ts'
import { isSearchDebugEnabled } from '../debug.ts'

export function getSearchBootstrap(config: RuntimeConfig): SearchEngineBootstrapData {
  return {
    indexUrl: config.searchIndexUrl,
    articlesDataUrl: config.searchArticlesDataUrl,
    tagsDataUrl: config.searchTagsDataUrl,
    debug: isSearchDebugEnabled(),
  }
}
