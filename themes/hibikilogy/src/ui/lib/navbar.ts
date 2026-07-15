import { createApp, reactive } from 'petite-vue'

interface NavbarStore {
  navScreenIsOpen: boolean
  sortType: string
  scrollY: number
  toggleNavScreen: () => void
}

interface NavbarOptions {
  isSearchPage: () => boolean
  leaveSearchPage: () => void
  navigate: (url: string) => void
}

const store = reactive<NavbarStore>({
  navScreenIsOpen: false,
  sortType: 'date',
  scrollY: 0,
  toggleNavScreen() {
    this.navScreenIsOpen = !this.navScreenIsOpen
  },
})

let navbarApp: ReturnType<typeof createApp> | null = null

function navbarClasses(isOpen: boolean) {
  return {
    open: isOpen,
    top: store.scrollY === 0,
  }
}

export function createNavbar({ isSearchPage, leaveSearchPage, navigate }: NavbarOptions) {
  function handleHamburgerClick(): void {
    if (isSearchPage()) {
      leaveSearchPage()
      return
    }

    store.toggleNavScreen()
  }

  function navScreenHandleClick(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof Element) || target.tagName.toLowerCase() !== 'a')
      store.toggleNavScreen()
  }

  function mount(): void {
    navbarApp?.unmount()
    navbarApp = createApp({
      store,
      handleHamburgerClick,
      navScreenHandleClick,
      sortingHandleSelect: () => navigate(`/${store.sortType}`),
      get NavBarClasses() {
        return navbarClasses(store.navScreenIsOpen)
      },
      get NavHamburgerClasses() {
        return navbarClasses(store.navScreenIsOpen || isSearchPage())
      },
      get NavScreenStateClasses() {
        return navbarClasses(store.navScreenIsOpen)
      },
    })
    navbarApp.mount()
  }

  return {
    close: () => {
      store.navScreenIsOpen = false
    },
    mount,
  }
}

window.addEventListener('scroll', () => {
  store.scrollY = window.scrollY || document.documentElement.scrollTop
})
