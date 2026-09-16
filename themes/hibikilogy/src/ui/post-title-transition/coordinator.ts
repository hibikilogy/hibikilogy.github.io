import type { Visit } from 'swup'
import type { PostTitleTransitionPreparation } from './types.ts'
import { onScopeDispose } from '@vue/reactivity'
import { isSearchUrl } from 'shared/url.ts'
import {
  beginPostTitleTransition,
  resolvePostTitleTransitionTarget,
} from './postTitleTransition.ts'

export interface TitleTransitionCoordinator {
  /** Prepares the title transition for a visit and marks it as active. */
  begin: (visit: Visit) => void
  /** Waits for the preparation and resolves the incoming target; false when there is none. */
  awaitIncoming: (visit: Visit) => Promise<boolean>
  /** Cancels the visit's preparation; true when it was the active visit. */
  finish: (visit: Visit) => boolean
}

/**
 * Tracks the post-title transition preparation per swup visit and the active
 * visit id, so a stale preparation never resolves after a newer visit started
 * and only the active visit settles the transition state. Registered inside
 * the app scope, stale preparations are cancelled with the app.
 */
export function setupTitleTransitionCoordinator(): TitleTransitionCoordinator {
  const preparations = new Map<number, PostTitleTransitionPreparation>()
  let activeVisitId: number | null = null

  onScopeDispose(() => {
    for (const preparation of preparations.values())
      preparation.cancel()
    preparations.clear()
  })

  return {
    begin(visit) {
      // finish() clears each visit on end/abort; drop stale ones defensively.
      for (const [id, stale] of preparations) {
        stale.cancel()
        preparations.delete(id)
      }

      const preparation = beginPostTitleTransition({
        trigger: visit.trigger.el,
      })
      preparations.set(visit.id, preparation)
      activeVisitId = visit.id
      if (preparation.waitForTarget)
        visit.animation.wait = true
    },

    async awaitIncoming(visit) {
      const preparation = preparations.get(visit.id)
      if (
        !preparation
        || !(await preparation.ready)
        || preparations.get(visit.id) !== preparation
      ) {
        return false
      }

      resolvePostTitleTransitionTarget(visit.to.document, {
        suppressScatter: isSearchUrl(visit.to.url),
      })
      return true
    },

    finish(visit) {
      const preparation = preparations.get(visit.id)
      if (!preparation)
        return false

      preparation.cancel()
      preparations.delete(visit.id)
      if (activeVisitId !== visit.id)
        return false

      activeVisitId = null
      return true
    },
  }
}
