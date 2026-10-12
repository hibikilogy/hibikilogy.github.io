import type { SearchService } from './types.ts'
import { supportsIdleCallback } from 'shared/capabilities.ts'
import { preloadSearchPage } from './searchPage.ts'

export function preloadSearchAssets(service: SearchService): void {
  void Promise.all([
    preloadSearchPage(),
    service.preload(),
  ]).catch(() => {})
}

export function scheduleIdleSearchPreload(service: SearchService): void {
  if (supportsIdleCallback())
    requestIdleCallback(() => preloadSearchAssets(service))
  else
    preloadSearchAssets(service)
}
