import { onScopeDispose } from '@vue/reactivity'
import { pageDom } from 'shared/selectors.ts'
import { createWaterfallController } from './waterfallController.ts'

const CONTAINER_SELECTOR = `${pageDom.journal} > .container`

export function setupWaterfalls(root: ParentNode): void {
  const controllers = [...root.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR)]
    .map(container => createWaterfallController(container))

  onScopeDispose(() => controllers.forEach(controller => controller.dispose()))
}
