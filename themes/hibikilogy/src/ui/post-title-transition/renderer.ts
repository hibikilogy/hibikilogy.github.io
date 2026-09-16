import { wait, waitForAnimationFrame } from 'shared/animation.ts'
import {
  postTitleDom,
  SVG_NAMESPACE,
  TITLE_FONT_WAIT_LIMIT,
  TITLE_LAYOUT_STABILITY_FRAME_LIMIT,
  TITLE_LAYOUT_WARM_DURATION,
} from './config.ts'
import { roundCoordinate } from './utils.ts'

export interface GlyphPosition {
  text: string
  x: number
  y: number
  width: number
  height: number
}

export interface RenderedTitle {
  element: HTMLElement
  glyphs: HTMLElement[]
  positions: GlyphPosition[]
}

interface RenderTitleOptions {
  finalViewTransitionName?: string
  preserveTextShadow?: boolean
}

interface StableTitleLayout {
  rect: DOMRect
  timestamp: number
}

const stableTitleLayouts = new WeakMap<HTMLElement, StableTitleLayout>()
const pendingTitleLayouts = new WeakMap<HTMLElement, Promise<void>>()

export function findSourceTitle(trigger?: Element): HTMLElement | null {
  const triggeredTitle = trigger?.matches(postTitleDom.titleSelector)
    ? trigger
    : trigger?.closest('a')?.querySelector(postTitleDom.titleSelector)

  if (triggeredTitle instanceof HTMLElement)
    return triggeredTitle

  return document.querySelector<HTMLElement>(
    `${postTitleDom.heroSelector} ${postTitleDom.titleSelector}`,
  )
}

export function findTitleByKey(
  key: string,
  root: ParentNode = document,
): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>(postTitleDom.titleSelector)]
    .find(title => title.dataset.postTitleKey === key) || null
}

export function isHeroTitle(element: Element): boolean {
  return Boolean(element.closest(postTitleDom.heroSelector))
}

export function getNormalizedTitleText(element: Element): string {
  return element.querySelector(postTitleDom.titleTextSelector)
    ?.textContent
    ?.replace(/\s+/g, ' ')
    .trim() || ''
}

export function countTitleGlyphs(element: Element): number {
  const text = element.querySelector(postTitleDom.titleTextSelector)?.textContent || ''
  return getVisibleGraphemes(text).length
}

export function getTitleTextNode(element: Element): Text | null {
  const textElement = getTitleTextElement(element)
  if (!textElement)
    return null

  return [...textElement.childNodes].find(
    (node): node is Text => node instanceof Text && Boolean(node.data.trim()),
  ) || null
}

export async function waitForStableTitleLayout(element: HTMLElement): Promise<void> {
  const currentRect = element.getBoundingClientRect()
  const stable = stableTitleLayouts.get(element)
  if (
    stable
    && Date.now() - stable.timestamp <= TITLE_LAYOUT_WARM_DURATION
    && haveEqualGeometry(stable.rect, currentRect)
  ) {
    return
  }

  const pending = pendingTitleLayouts.get(element)
  if (pending)
    return pending

  const preparation = stabilizeTitleLayout(element)
  pendingTitleLayouts.set(element, preparation)
  try {
    await preparation
  }
  finally {
    if (pendingTitleLayouts.get(element) === preparation)
      pendingTitleLayouts.delete(element)
  }
}

async function stabilizeTitleLayout(element: HTMLElement): Promise<void> {
  const textElement = getTitleTextElement(element)
  const text = textElement?.textContent
  if (!textElement || !text)
    return

  const computed = window.getComputedStyle(textElement)
  const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
  if (!document.fonts.check(font, text)) {
    await Promise.race([
      document.fonts.load(font, text).catch(() => []),
      wait(TITLE_FONT_WAIT_LIMIT),
    ])
  }

  let previousRect = textElement.getBoundingClientRect()
  for (let frame = 0; frame < TITLE_LAYOUT_STABILITY_FRAME_LIMIT; frame++) {
    await waitForAnimationFrame()
    const currentRect = textElement.getBoundingClientRect()
    if (haveEqualGeometry(previousRect, currentRect)) {
      stableTitleLayouts.set(element, {
        rect: element.getBoundingClientRect(),
        timestamp: Date.now(),
      })
      return
    }
    previousRect = currentRect
  }

  stableTitleLayouts.set(element, {
    rect: element.getBoundingClientRect(),
    timestamp: Date.now(),
  })
}

export function renderTitle(
  element: HTMLElement,
  options: RenderTitleOptions = {},
): RenderedTitle | null {
  const textElement = getTitleTextElement(element)
  const textNode = getTitleTextNode(element)
  if (!textElement || !textNode)
    return null

  const elementRect = element.getBoundingClientRect()
  if (elementRect.width <= 0 || elementRect.height <= 0)
    return null

  const positions = measureGlyphs(textNode, elementRect)
  if (!positions.length)
    return null

  const computed = window.getComputedStyle(textElement)
  const overlay = document.createElement('span')
  overlay.classList.add(postTitleDom.overlayClass)
  overlay.setAttribute('aria-hidden', 'true')

  const glyphs = positions.map(position => createGlyphLayer(
    position,
    computed,
    options.preserveTextShadow === true,
  ))
  overlay.append(...glyphs)
  element.append(overlay)

  if (options.finalViewTransitionName) {
    element.classList.add(postTitleDom.finalTargetClass)
    textElement.style.setProperty('view-transition-name', options.finalViewTransitionName)
  }
  element.classList.add(postTitleDom.activeClass)
  return { element, glyphs, positions }
}

export function clearRenderedTitleShadow(rendered: RenderedTitle): void {
  rendered.glyphs.forEach((glyph) => {
    glyph.querySelector<SVGTextElement>('text')?.style.setProperty('text-shadow', 'none')
  })
}

export function discardRenderedTitleGlyphs(rendered: RenderedTitle): void {
  rendered.glyphs.forEach(glyph => glyph.style.removeProperty('view-transition-name'))
  rendered.element.querySelector(`:scope > .${postTitleDom.overlayClass}`)?.remove()
}

export function disposeRenderedTitle(rendered: RenderedTitle): void {
  const { element } = rendered
  element.classList.remove(postTitleDom.activeClass, postTitleDom.finalTargetClass)
  getTitleTextElement(element)?.style.removeProperty('view-transition-name')
  element.querySelector(`:scope > .${postTitleDom.overlayClass}`)?.remove()
}

function getTitleTextElement(element: Element): HTMLElement | null {
  return element.querySelector<HTMLElement>(`:scope > ${postTitleDom.titleTextSelector}`)
}

function getVisibleGraphemes(text: string): Intl.SegmentData[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return [...segmenter.segment(text)].filter(segment => segment.segment.trim())
}

function measureGlyphs(textNode: Text, elementRect: DOMRect): GlyphPosition[] {
  const range = document.createRange()
  const positions = getVisibleGraphemes(textNode.data).flatMap((segment) => {
    range.setStart(textNode, segment.index)
    range.setEnd(textNode, segment.index + segment.segment.length)
    const rect = range.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0)
      return []

    return [{
      text: segment.segment,
      x: roundCoordinate(rect.left - elementRect.left),
      y: roundCoordinate(rect.top - elementRect.top),
      width: roundCoordinate(rect.width),
      height: roundCoordinate(rect.height),
    }]
  })
  range.detach()
  return positions
}

function createGlyphLayer(
  position: GlyphPosition,
  computed: CSSStyleDeclaration,
  preserveTextShadow: boolean,
): HTMLElement {
  const layer = document.createElement('span')
  layer.classList.add(postTitleDom.glyphClass)
  layer.style.left = `${position.x}px`
  layer.style.top = `${position.y}px`
  layer.style.width = `${position.width}px`
  layer.style.height = `${position.height}px`

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.classList.add(postTitleDom.svgClass)
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('viewBox', `0 0 ${position.width} ${position.height}`)
  svg.setAttribute('preserveAspectRatio', 'none')

  const glyph = document.createElementNS(SVG_NAMESPACE, 'text')
  glyph.textContent = position.text
  glyph.setAttribute('x', '0')
  glyph.setAttribute('y', '0')
  glyph.setAttribute('dominant-baseline', 'text-before-edge')
  copyTextStyles(glyph, computed, preserveTextShadow)
  svg.append(glyph)
  layer.append(svg)
  return layer
}

function copyTextStyles(
  glyph: SVGTextElement,
  computed: CSSStyleDeclaration,
  preserveTextShadow: boolean,
): void {
  glyph.style.fill = computed.color
  glyph.style.fontFamily = computed.fontFamily
  glyph.style.fontSize = computed.fontSize
  glyph.style.fontStyle = computed.fontStyle
  glyph.style.fontStretch = computed.fontStretch
  glyph.style.fontWeight = computed.fontWeight
  glyph.style.fontKerning = computed.fontKerning
  glyph.style.fontFeatureSettings = computed.fontFeatureSettings
  glyph.style.fontVariationSettings = computed.fontVariationSettings
  glyph.style.letterSpacing = computed.letterSpacing
  glyph.style.textRendering = computed.textRendering
  glyph.style.textShadow = preserveTextShadow ? computed.textShadow : 'none'
}

function haveEqualGeometry(first: DOMRect, second: DOMRect): boolean {
  return first.x === second.x
    && first.y === second.y
    && first.width === second.width
    && first.height === second.height
}
