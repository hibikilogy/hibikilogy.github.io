import { afterEach, describe, expect, it, vi } from 'vitest'
import { postTitleDom } from './config.ts'
import {
  clearRenderedTitleShadow,
  countTitleGlyphs,
  discardRenderedTitleGlyphs,
  disposeRenderedTitle,
  findSourceTitle,
  findTitleByKey,
  getNormalizedTitleText,
  getTitleTextNode,
  isHeroTitle,
  renderTitle,
} from './renderer.ts'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mountTitleDom(): HTMLElement {
  document.body.innerHTML = `
    <section class="Hero">
      <h1 class="PostTitleTransition" data-post-title-key="hero">
        <span class="PostTitleTransitionText">搜索结果</span>
      </h1>
    </section>
  `
  return document.querySelector<HTMLElement>('.PostTitleTransition')!
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('renderTitle', () => {
  it('renders one positioned glyph layer per grapheme', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(10, 20, 500, 60),
    })
    const rangeRects = [
      rect(100, 200, 12, 14),
      rect(114, 200, 12, 14),
      rect(128, 200, 12, 14),
      rect(142, 200, 12, 14),
    ]
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rangeRects.shift()!)

    const rendered = renderTitle(title)

    expect(rendered).not.toBeNull()
    expect(rendered!.positions).toEqual([
      { text: '搜', x: 90, y: 180, width: 12, height: 14 },
      { text: '索', x: 104, y: 180, width: 12, height: 14 },
      { text: '结', x: 118, y: 180, width: 12, height: 14 },
      { text: '果', x: 132, y: 180, width: 12, height: 14 },
    ])

    const overlay = title.querySelector<HTMLElement>(`:scope > .${postTitleDom.overlayClass}`)!
    expect(overlay.getAttribute('aria-hidden')).toBe('true')

    const glyphs = overlay.querySelectorAll<HTMLElement>(`.${postTitleDom.glyphClass}`)
    expect(glyphs).toHaveLength(4)
    expect(glyphs[0].style.left).toBe('90px')
    expect(glyphs[0].style.top).toBe('180px')
    expect(glyphs[0].style.width).toBe('12px')
    expect(glyphs[0].style.height).toBe('14px')

    const svg = glyphs[0].querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 12 14')
    expect(svg?.querySelector('text')?.textContent).toBe('搜')

    expect(title.classList.contains(postTitleDom.activeClass)).toBe(true)
  })

  it('applies the final view-transition name when requested', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rect(10, 20, 12, 14))

    renderTitle(title, { finalViewTransitionName: 'hero-title' })

    const textElement = title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!
    expect(textElement.style.getPropertyValue('view-transition-name')).toBe('hero-title')
    expect(title.classList.contains(postTitleDom.finalTargetClass)).toBe(true)
  })

  it('returns null for a zero-sized element', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 0, 0),
    })

    expect(renderTitle(title)).toBeNull()
    expect(title.querySelector(`:scope > .${postTitleDom.overlayClass}`)).toBeNull()
  })

  it('returns null when no visible text node exists', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!.replaceChildren('  ')

    expect(renderTitle(title)).toBeNull()
  })

  it('returns null when every glyph measures zero', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rect(0, 0, 0, 0))

    expect(renderTitle(title)).toBeNull()
  })
})

describe('rendered title teardown', () => {
  it('discards glyph layers and their transition names', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rect(10, 20, 12, 14))
    const rendered = renderTitle(title)!

    rendered.glyphs[0].style.setProperty('view-transition-name', 'glyph-0')
    discardRenderedTitleGlyphs(rendered)

    expect(rendered.glyphs[0].style.getPropertyValue('view-transition-name')).toBe('')
    expect(title.querySelector(`:scope > .${postTitleDom.overlayClass}`)).toBeNull()
  })

  it('dispose removes classes, the transition name and the overlay', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rect(10, 20, 12, 14))
    const rendered = renderTitle(title, { finalViewTransitionName: 'hero-title' })!

    disposeRenderedTitle(rendered)

    expect(title.classList.contains(postTitleDom.activeClass)).toBe(false)
    expect(title.classList.contains(postTitleDom.finalTargetClass)).toBe(false)
    const textElement = title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!
    expect(textElement.style.getPropertyValue('view-transition-name')).toBe('')
    expect(title.querySelector(`:scope > .${postTitleDom.overlayClass}`)).toBeNull()
  })

  it('clearRenderedTitleShadow drops the text shadow on every glyph', () => {
    const title = mountTitleDom()
    Object.defineProperty(title, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect(0, 0, 500, 60),
    })
    vi.spyOn(Range.prototype, 'getBoundingClientRect')
      .mockImplementation(() => rect(10, 20, 12, 14))
    const rendered = renderTitle(title)!
    rendered.glyphs.forEach((glyph) => {
      glyph.querySelector<SVGElement>('text')!.style.textShadow = 'red 1px 1px'
    })

    clearRenderedTitleShadow(rendered)

    rendered.glyphs.forEach((glyph) => {
      expect(glyph.querySelector<SVGElement>('text')!.style.textShadow).toBe('none')
    })
  })
})

describe('title lookup helpers', () => {
  it('findSourceTitle prefers the trigger, then its link, then the hero title', () => {
    const title = mountTitleDom()
    expect(findSourceTitle(title)).toBe(title)

    document.body.innerHTML = `
      <a href="/articles/x/">
        <span class="PostTitleTransition" data-post-title-key="card">卡片标题</span>
      </a>
    `
    const card = document.querySelector<HTMLElement>('.PostTitleTransition')!
    expect(findSourceTitle(card)).toBe(card)

    const link = document.querySelector<HTMLAnchorElement>('a')!
    expect(findSourceTitle(link)).toBe(card)
  })

  it('falls back to the hero title without a trigger', () => {
    const title = mountTitleDom()
    expect(findSourceTitle()).toBe(title)
  })

  it('findTitleByKey matches the dataset key and returns null when absent', () => {
    mountTitleDom()
    expect(findTitleByKey('hero')).not.toBeNull()
    expect(findTitleByKey('missing')).toBeNull()
  })

  it('isHeroTitle reports ancestry inside the hero', () => {
    const title = mountTitleDom()
    expect(isHeroTitle(title)).toBe(true)
    const textElement = title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!
    expect(isHeroTitle(textElement)).toBe(true)

    const outside = document.createElement('h1')
    document.body.append(outside)
    expect(isHeroTitle(outside)).toBe(false)
  })

  it('getNormalizedTitleText collapses whitespace', () => {
    const title = mountTitleDom()
    title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!.textContent = '\n  搜索  结果 \n'
    expect(getNormalizedTitleText(title)).toBe('搜索 结果')
  })

  it('countTitleGlyphs counts visible graphemes only', () => {
    const title = mountTitleDom()
    const textElement = title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!
    expect(countTitleGlyphs(title)).toBe(4)

    textElement.textContent = '  '
    expect(countTitleGlyphs(title)).toBe(0)
  })

  it('getTitleTextNode finds the first visible text node past Lit markers', () => {
    const title = mountTitleDom()
    const textElement = title.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)!
    textElement.replaceChildren(
      document.createComment('?lit$'),
      document.createTextNode('搜索结果'),
    )

    expect(getTitleTextNode(title)?.data).toBe('搜索结果')

    textElement.replaceChildren(document.createTextNode('  '))
    expect(getTitleTextNode(title)).toBeNull()
  })
})
