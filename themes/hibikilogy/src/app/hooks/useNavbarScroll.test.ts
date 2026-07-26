import type { Ref } from '@vue/reactivity'
import type { ScrollModel } from './types.ts'
import { computed, effectScope, ref } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNavbarScroll } from './useNavbarScroll.ts'

function createScrollModel(): {
  directions: { left: boolean, right: boolean, top: boolean, bottom: boolean }
  model: ScrollModel
  scrollY: Ref<number>
} {
  const scrollY = ref(0)
  const directions = {
    left: false,
    right: false,
    top: false,
    bottom: false,
  }
  return {
    directions,
    model: {
      x: ref(0),
      y: scrollY,
      atTop: computed(() => scrollY.value === 0),
      directions,
      measure: vi.fn(),
    },
    scrollY,
  }
}

describe('useNavbarScroll', () => {
  afterEach(() => {
    document.body.className = ''
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('tracks fallback direction', () => {
    vi.stubGlobal('CSS', { supports: () => false })
    const root = document.createElement('main')
    root.innerHTML = '<header class="NavBar"></header>'
    document.body.append(root)
    const scroll = createScrollModel()

    const scope = effectScope()
    const navbarScroll = scope.run(() => useNavbarScroll(root, scroll.model))!

    scroll.directions.bottom = true
    scroll.scrollY.value = 20
    expect(navbarScroll.scrollingDown.value).toBe(true)
    scroll.directions.bottom = false
    scroll.directions.top = true
    scroll.scrollY.value = 10
    expect(navbarScroll.scrollingDown.value).toBe(false)

    scope.stop()
  })

  it('tracks the post Hero latch and background fallback', () => {
    vi.stubGlobal('CSS', { supports: () => false })
    vi.stubGlobal('IntersectionObserver', undefined)
    document.body.classList.add('post')
    const root = document.createElement('main')
    root.innerHTML = `
      <header class="NavBar"></header>
      <section class="Hero"></section>
    `
    document.body.append(root)

    const hero = root.querySelector<HTMLElement>('.Hero')!
    let heroTop = -300
    vi.spyOn(hero, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: heroTop + 600,
      height: 600,
      top: heroTop,
    } as DOMRect))
    const scroll = createScrollModel()

    const scope = effectScope()
    const navbarScroll = scope.run(() => useNavbarScroll(root, scroll.model))!
    const navbar = root.querySelector<HTMLElement>('.NavBar')!

    expect(navbarScroll.postHeroPassed.value).toBe(false)
    expect(navbar.style.getPropertyValue('--post-navbar-background-opacity')).toBe('50%')

    heroTop = -601
    scroll.scrollY.value = 601
    expect(navbarScroll.postHeroPassed.value).toBe(true)
    heroTop = 0
    scroll.scrollY.value = 0
    expect(navbarScroll.postHeroPassed.value).toBe(false)

    scope.stop()
  })
})
