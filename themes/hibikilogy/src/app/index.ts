import { scheduleIdleSearchPreload } from '../features/search/hooks/useSearchNavigation.ts'
import { createSwup } from '../infrastructure/swup/index.ts'
import { onFinalPageHide } from '../shared/pageLifecycle.ts'
import { createAppContext } from './appContext.ts'
import { setupAppNavigation } from './navigation/appNavigation.ts'

export function startApp(): void {
  const swup = createSwup()
  const app = createAppContext(swup)
  app.scope.run(() => setupAppNavigation(swup, app))

  onFinalPageHide(() => {
    app.dispose()
  })

  scheduleIdleSearchPreload(app.searchService)
}
