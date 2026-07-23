import type { PageModule } from './types.ts'
import { useWaterfalls } from '../../features/waterfall/index.ts'

export const mountJournalPage: PageModule = ({ page }) => {
  useWaterfalls(page.root)
}
