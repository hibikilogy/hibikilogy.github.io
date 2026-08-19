import type { Ref } from '@vue/reactivity'
import type { ScrollModel } from './types.ts'
import { computed, effectScope, ref } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNavbarScroll } from './useNavbarScroll.ts'

function createScrollModel(): {
  directions: { down: boolean }
  model: ScrollModel
  scrollY: Ref<number>
} {
  const scrollY = ref(0)
  const directions = { down: false }
  return {
    directions,
    model: {
      y: scrollY,
      atTop: computed(() => scrollY.value === 0),
      directions,
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

    scroll.directions.down = true
    scroll.scrollY.value = 20
    expect(navbarScroll.scrollingDown.value).toBe(true)
    scroll.directions.down = false
    scroll.scrollY.value = 10
    expect(navbarScroll.scrollingDown.value).toBe(false)

    scope.stop()
  })

  it('tracks the post Hero latch and background fallback', async () => {
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

    // 初始同步推迟两帧（等 swup 滚动复位），推进后再断言。
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

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
