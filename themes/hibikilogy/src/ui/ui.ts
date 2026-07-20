import type { PostTitleTransitionPreparation } from './lib/post-title-transition.ts'
import { createNavbar } from './lib/navbar.ts'
import { createSearchNavigation, removeTrailingSlash } from './lib/navigation.ts'
import {
  disposePageModules,
  initializePageModules,
  listenForPaginationNavigation,
} from './lib/page-lifecycle.ts'
import {
  beginPostTitleTransition,
  playPostTitleExitAnimation,
  renderPostTitleTransitionTarget,
  resolvePostTitleTransitionTarget,
} from './lib/post-title-transition.ts'
import { createSwup } from './lib/swup.ts'
import { clearTransitionState, setTransitionState } from './lib/transition-state.ts'
import 'virtual:uno.css'

const swup = createSwup()
const postTitlePreparations = new Map<number, PostTitleTransitionPreparation>()
let activePostTitleVisitId: number | null = null
const navigate = (url: string) => swup.navigate(url)

const searchNavigation = createSearchNavigation({
  navigate,
  isVisitInProgress: () => swup.visit.to.url !== '' && !swup.visit.done,
})

const navbar = createNavbar({
  navigate,
  isSearchPage: searchNavigation.isSearchPage,
  leaveSearchPage: searchNavigation.leaveSearchPage,
})

function initializePage(): void {
  navbar.mount()
  initializePageModules()
  removeTrailingSlash()
  renderPostTitleTransitionTarget()
}

swup.hooks.on('visit:start', (visit) => {
  navbar.close()
  setTransitionState(visit.from.url, visit.to.url)
  const preparation = beginPostTitleTransition({
    trigger: visit.trigger.el,
  })
  postTitlePreparations.set(visit.id, preparation)
  activePostTitleVisitId = visit.id
  if (preparation.waitForTarget)
    visit.animation.wait = true
  disposePageModules()
})

swup.hooks.before('visit:transition', async (visit) => {
  const preparation = postTitlePreparations.get(visit.id)
  if (!preparation || !(await preparation.ready) || postTitlePreparations.get(visit.id) !== preparation)
    return

  resolvePostTitleTransitionTarget(visit.to.document)
  await playPostTitleExitAnimation()
})
swup.hooks.before('content:replace', async (visit) => {
  const preparation = postTitlePreparations.get(visit.id)
  if (!preparation || !(await preparation.ready) || postTitlePreparations.get(visit.id) !== preparation)
    return

  resolvePostTitleTransitionTarget(visit.to.document)
})
swup.hooks.on('content:replace', initializePage)
swup.hooks.on('visit:end', finishPostTitleVisit)
swup.hooks.on('visit:abort', finishPostTitleVisit)

window.navigateToSearch = searchNavigation.navigateToSearch
listenForPaginationNavigation(navigate)
initializePage()

function finishPostTitleVisit(visit: { id: number }): void {
  const preparation = postTitlePreparations.get(visit.id)
  if (!preparation)
    return

  preparation.cancel()
  postTitlePreparations.delete(visit.id)
  if (activePostTitleVisitId !== visit.id)
    return

  activePostTitleVisitId = null
  clearTransitionState()
}
