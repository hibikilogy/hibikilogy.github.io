import type { PageModule } from './types.ts'
import { setupWaterfalls } from '../../features/waterfall/index.ts'

export const mountJournalPage: PageModule = ({ page }) => {
  setupWaterfalls(page.root)
}
