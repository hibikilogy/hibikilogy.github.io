import type { ScrollModel } from './types.ts'
import { onScopeDispose, watch } from '@vue/reactivity'
import { useEventListener } from '../../shared/hooks/index.ts'

export function useOutlineScroll(root: ParentNode, scroll: ScrollModel): void {
  const outline = root.querySelector<HTMLElement>('.Aside .aside-container')
  const boundary = outline?.closest<HTMLElement>('.Content') ?? null
  let bottomInset = -1

  const syncBottomInset = (): void => {
    if (!outline || !boundary)
      return

    const nextInset = Math.max(
      window.innerHeight - boundary.getBoundingClientRect().bottom,
      0,
    )
    if (Math.abs(nextInset - bottomInset) < 0.5)
      return

    bottomInset = nextInset
    outline.style.setProperty('--joh-outline-bottom-inset', `${nextInset}px`)
  }

  syncBottomInset()
  const stopScrollSync = watch(scroll.y, syncBottomInset)
  onScopeDispose(stopScrollSync)
  useEventListener(window, 'resize', syncBottomInset, { passive: true })
}
