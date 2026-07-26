import type { ScrollModel } from './types.ts'
import { computed, effectScope, ref } from '@vue/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOutlineScroll } from './useOutlineScroll.ts'

describe('useOutlineScroll', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('shrinks the outline when its boundary enters the viewport', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <section class="Content">
        <aside class="Aside">
          <div class="aside-container"></div>
        </aside>
      </section>
    `
    document.body.append(root)

    const boundary = root.querySelector<HTMLElement>('.Content')!
    vi.spyOn(boundary, 'getBoundingClientRect').mockReturnValue({
      bottom: 560,
    } as DOMRect)
    const scrollY = ref(0)
    const scroll: ScrollModel = {
      x: ref(0),
      y: scrollY,
      atTop: computed(() => scrollY.value === 0),
      directions: {
        left: false,
        right: false,
        top: false,
        bottom: false,
      },
      measure: () => {},
    }

    const scope = effectScope()
    scope.run(() => useOutlineScroll(root, scroll))

    const outline = root.querySelector<HTMLElement>('.aside-container')
    const bottomInset = outline?.style.getPropertyValue('--joh-outline-bottom-inset')
    expect(bottomInset).toBe(`${window.innerHeight - 560}px`)

    scope.stop()
  })
})
