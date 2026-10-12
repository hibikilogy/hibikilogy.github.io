import type { AppContext, PageContext } from '../types.ts'

export interface PageModuleContext {
  readonly app: AppContext
  readonly page: PageContext
}

export type PageModule = (
  context: PageModuleContext,
) => void | Promise<void>
