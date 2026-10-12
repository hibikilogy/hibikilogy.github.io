import type { PageKind } from '../hooks/index.ts'
import type { AppContext, PageContext } from '../types.ts'
import type { PageModule } from './types.ts'
import { mountPageViews } from '../../features/page-views/index.ts'
import { mountSearchPage } from '../../features/search/index.ts'
import { mountArticlePage } from './articlePage.ts'
import { mountJournalPage } from './journalPage.ts'

const mountSearchPageModule: PageModule = ({ app, page }) => (
  mountSearchPage(app.route, app.searchService, {
    root: page.root,
    isActive: page.scope.active,
    run: callback => page.run(callback),
  })
)

// 页脚计数属于站点级 chrome，在所有 PageKind 上都挂载。
const siteModules: readonly PageModule[] = [
  ({ app, page }) => mountPageViews(app.pageViews, {
    root: page.root,
    pathname: app.route.current.value.pathname,
    isActive: () => page.scope.active,
  }),
]

const modulesByPageKind = {
  article: [mountArticlePage],
  journal: [mountJournalPage],
  search: [mountJournalPage, mountSearchPageModule],
  default: [],
} satisfies Record<PageKind, readonly PageModule[]>

export function mountPageModules(app: AppContext, page: PageContext): void {
  const context = { app, page }
  for (const mount of [...siteModules, ...modulesByPageKind[page.data.kind]])
    void mount(context)
}
