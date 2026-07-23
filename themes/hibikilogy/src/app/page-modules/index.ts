import type { PageKind } from '../hooks/index.ts'
import type { AppContext, PageContext } from '../types.ts'
import type { PageModule } from './types.ts'
import { mountSearchPage } from '../../features/search/index.ts'
import { mountArticlePage } from './articlePage.ts'
import { mountJournalPage } from './journalPage.ts'

const mountSearchPageModule: PageModule = ({ app, page }) => (
  mountSearchPage(app, page)
)

const modulesByPageKind = {
  article: [mountArticlePage],
  journal: [mountJournalPage],
  search: [mountJournalPage, mountSearchPageModule],
  default: [],
} satisfies Record<PageKind, readonly PageModule[]>

export function mountPageModules(app: AppContext, page: PageContext): void {
  const context = { app, page }
  for (const mount of modulesByPageKind[page.data.kind])
    void mount(context)
}
