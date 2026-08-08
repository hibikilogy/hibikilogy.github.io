import type { Visit as SwupVisit } from 'swup'
import {
  markOverlaySettling,
  settleTransitionState,
  shouldKeepNativeTransition,
} from 'ui/page-transition/index.ts'

export interface VisitSession {
  start: (visit: SwupVisit) => void
  rendered: () => void
  finish: (visit: SwupVisit) => void
  abort: (visit: SwupVisit) => void
}

/**
 * 访问期簿记：上次访问是否被中断、本次访问是否已渲染；
 * 同时拥有结束期兜底（过渡状态收尾、滚动复位）。
 */
export function createVisitSession(): VisitSession {
  let interrupted = false
  let contentReplaced = false

  const finish = (visit: SwupVisit): void => {
    // 无论标题过渡是否接管都收尾，防止 `data-search-overlay` 残留。
    settleTransitionState()
    // swup 滚动复位偶发失效；popstate 保留插件恢复的滚动，abort 的访问（未渲染）不滚动。
    if (!visit.history.popstate && contentReplaced)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    contentReplaced = false
  }

  return {
    start(visit) {
      if (!shouldKeepNativeTransition(visit.from.url, visit.to.url, interrupted))
        visit.animation.native = false
      interrupted = false
    },
    rendered() {
      markOverlaySettling()
      contentReplaced = true
    },
    finish,
    abort(visit) {
      interrupted = true
      finish(visit)
    },
  }
}
