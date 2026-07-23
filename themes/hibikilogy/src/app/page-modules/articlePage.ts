import type { PageModule } from './types.ts'
import { onScopeDispose } from '@vue/reactivity'
import {
  disposeArticlePage,
  disposeOutline,
  initArticlePage,
  initOutline,
  mountAccordions,
} from '../../ui/index.ts'

export const mountArticlePage: PageModule = ({ app, page }) => {
  const disposeAccordions = mountAccordions(page.root)

  initOutline({
    replaceHash: (hash) => {
      const url = new URL(app.route.current.value.href)
      url.hash = hash ?? ''
      app.route.replace(url.pathname + url.search + url.hash)
    },
  })
  initArticlePage()

  onScopeDispose(() => {
    disposeAccordions()
    disposeOutline()
    disposeArticlePage()
  })
}
