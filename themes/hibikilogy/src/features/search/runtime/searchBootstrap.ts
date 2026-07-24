import type { RuntimeConfig } from 'infra/runtime-config/index.ts'
import type {
  SearchArticleMetadataIndex,
  SearchEngineBootstrapData,
  SearchTagIndexItem,
} from '../types.ts'
import {
  searchArticleIndexInlineId,
  searchTagIndexInlineId,
} from '../config.ts'
import { isSearchDebugEnabled } from '../debug.ts'
import { readInlineJsonIndex } from './load.ts'

export function getSearchBootstrap(
  config: RuntimeConfig,
  root: ParentNode = document,
): SearchEngineBootstrapData {
  return {
    indexUrl: config.searchIndexUrl,
    articlesDataUrl: config.searchArticlesDataUrl,
    tagsDataUrl: config.searchTagsDataUrl,
    debug: isSearchDebugEnabled(),
    articleMetadataIndex: readInlineJsonIndex<SearchArticleMetadataIndex>(
      searchArticleIndexInlineId,
      root,
    ) || undefined,
    tagIndex: readInlineJsonIndex<SearchTagIndexItem[]>(
      searchTagIndexInlineId,
      root,
    ) || undefined,
  }
}
