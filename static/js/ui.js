import { createApp, reactive } from 'https://unpkg.com/petite-vue?module'

const store = reactive({
  navScreenIsOpen: false,
  sortType: 'date',
  scrollY: 0,
  toggleNavScreen() {
    this.navScreenIsOpen = !this.navScreenIsOpen
  }
})

window.addEventListener('scroll', () => {
  store.scrollY = window.scrollY || document.documentElement.scrollTop;
});

const navScreenHandleClick = () => {
  if (event.target.tagName.toLowerCase() !== 'a') store.toggleNavScreen()
}

const sortingHandleSelect = () => {
  window.location.href = `/${store.sortType}`
}

document.addEventListener('keydown', (event) => {
  if (window.location.pathname.includes('/search')) return;
  const isCtrlOrCmdPressed = event.ctrlKey || event.metaKey;
  const isKPressed = event.key.toLowerCase() === 'k';

  if (isCtrlOrCmdPressed && isKPressed) {
    event.preventDefault();
    window.location.href = `/search`
  }
});

createApp({
  store,
  navScreenHandleClick,
  sortingHandleSelect,
  get NavScreenClasses() {
    return {
      'open': store.navScreenIsOpen,
      'top': store.scrollY === 0
    }
  },
  get systemClasses() {
    return {
      'mac': /Mac|iPhone|iPod|iPad/i.test(navigator.platform)
    }
  }
}).mount()
