import type { EffectScope } from '@vue/reactivity'
import type { SearchService } from '../features/search/index.ts'
import type { LayoutModel, PageData, RouteModel } from './hooks/index.ts'

export interface AppContext {
  readonly scope: EffectScope
  readonly route: RouteModel
  readonly searchService: SearchService
  dispose: () => void
}

export interface PageContext {
  readonly scope: EffectScope
  readonly root: HTMLElement
  readonly data: PageData
  readonly layout: LayoutModel
  run: <T>(callback: () => T) => T
  dispose: () => void
}
