import { createNavbar } from './navbar.ts'
import { createSearchNavigation, removeTrailingSlash } from './navigation.ts'
import {
  disposePageModules,
  initializePageModules,
  listenForPaginationNavigation,
} from './page-lifecycle.ts'
import { createSwup } from './swup.ts'
import { clearTransitionState, setTransitionState } from './transition-state.ts'

const swup = createSwup()
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
}

swup.hooks.on('visit:start', (visit) => {
  navbar.close()
  setTransitionState(visit.from.url, visit.to.url)
  disposePageModules()
})

swup.hooks.on('content:replace', initializePage)
swup.hooks.on('visit:end', clearTransitionState)
swup.hooks.on('visit:abort', clearTransitionState)

window.navigateToSearch = searchNavigation.navigateToSearch
listenForPaginationNavigation(navigate)
initializePage()
