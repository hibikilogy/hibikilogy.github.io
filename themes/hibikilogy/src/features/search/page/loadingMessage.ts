import type { SearchIndexBuildStatus } from '../types.ts'

interface SearchLoadingMessages {
  indexLoading: string
  cacheReading: string
  indexBuilding: string
}

interface ResolveSearchLoadingMessageOptions {
  status: SearchIndexBuildStatus
  hasSearchTerm: boolean
  messages: SearchLoadingMessages
}

export function resolveSearchLoadingMessage(
  options: ResolveSearchLoadingMessageOptions,
): string {
  if (!options.hasSearchTerm)
    return options.messages.indexLoading

  if (options.status === 'cache-read' || options.status === 'cache-hit')
    return options.messages.cacheReading

  return options.messages.indexBuilding
}
