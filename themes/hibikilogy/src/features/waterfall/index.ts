import type { WaterfallController } from './types.ts'
import { onScopeDispose } from '@vue/reactivity'
import { pageDom } from '../../shared/dom.ts'
import { createWaterfallController } from './waterfallController.ts'

const containerSelector = `${pageDom.journal} > .container`

export function useWaterfalls(root: ParentNode): void {
  const controllers = [...root.querySelectorAll<HTMLElement>(containerSelector)]
    .map(container => createWaterfallController(container))

  onScopeDispose(() => controllers.forEach(controller => controller.dispose()))
}

export { createWaterfallController }
export type { WaterfallController }
