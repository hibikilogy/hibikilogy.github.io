import type { PageModule } from './types.ts'
import { serializeUrl } from 'shared/url.ts'
import {
  mountAccordions,
  setupArticlePage,
  setupOutline,
} from '../../ui/index.ts'

export const mountArticlePage: PageModule = ({ app, page }) => {
  mountAccordions(page.root)

  setupOutline({
    replaceHash: (hash) => {
      const url = new URL(app.route.current.value.href)
      url.hash = hash ?? ''
      app.route.replace(serializeUrl(url))
    },
  })
  setupArticlePage()
}
