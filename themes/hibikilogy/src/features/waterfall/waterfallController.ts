import type { WaterfallController } from './types.ts'
import { supportsGridLanes } from 'shared/capabilities.ts'
import { catchError } from 'shared/result.ts'

const SECTION_SELECTOR = '.Section, .FrontPage'
const DEFAULT_CHILD_SELECTOR = `:scope > ${SECTION_SELECTOR}`

function queryChildren(container: Element, childSelector: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(childSelector)]
}

export function createWaterfallController(
  journal: HTMLElement,
  childSelector = DEFAULT_CHILD_SELECTOR,
  nativeLayout = supportsGridLanes(),
): WaterfallController {
  let animationFrame = 0
  let disposed = false
  let lastSignature = ''
  let lastItems: HTMLElement[] = []

  const observedItems = new WeakSet<Element>()
  const resizeObserver = window.ResizeObserver
    ? new ResizeObserver(() => {
        scheduleLayout()
      })
    : null
  const mutationObserver = window.MutationObserver
    ? new MutationObserver(() => {
        scheduleLayout()
      })
    : null

  function scheduleLayout(): void {
    if (disposed || animationFrame)
      return

    animationFrame = requestAnimationFrame(() => {
      animationFrame = 0
      applyLayout()
    })
  }

  function observeDynamicContent(items: Element[]): void {
    items.forEach((item) => {
      if (!resizeObserver || observedItems.has(item))
        return
      resizeObserver.observe(item)
      observedItems.add(item)
    })
  }

  function applyLayout(): void {
    const items = queryChildren(journal, childSelector)
    observeDynamicContent(items)

    if (!items.length || !isWaterfallLayout(items)) {
      // Clear the signature: resetLayout strips spans, so a later identical
      // signature must not bail — the spans have to be written again.
      lastSignature = ''
      lastItems = []
      resetLayout(items)
      markLayoutReady()
      return
    }

    if (nativeLayout) {
      updateSeamOwner(items)
      markLayoutReady()
      return
    }

    const styles = window.getComputedStyle(journal)
    const rowHeight = Number.parseFloat(styles.getPropertyValue('grid-auto-rows')) || 1
    const rowGap = Number.parseFloat(styles.getPropertyValue('row-gap')) || 0

    // Measure unconstrained: a stale span pins the item's height to the
    // previous layout, which would poison both the signature and the spans.
    journal.style.display = 'block'
    journal.style.opacity = '0'
    const heights = items.map(item => item.offsetHeight)

    const signature = [journal.clientWidth, items.length, ...heights].join(':')
    const hasSameItems = items.length === lastItems.length
      && items.every((item, index) => item === lastItems[index])
    if (signature === lastSignature && hasSameItems) {
      journal.style.display = 'grid'
      markLayoutReady()
      return
    }
    lastSignature = signature
    lastItems = items

    items.forEach((item, index) => {
      const rowSpan = Math.ceil((heights[index] + rowGap) / (rowHeight + rowGap))
      item.style.gridRow = `span ${rowSpan}`
    })
    journal.style.display = 'grid'
    updateSeamOwner(items)
    markLayoutReady()
  }

  function markLayoutReady(): void {
    journal.style.opacity = '1'
    journal.setAttribute('data-layout-ready', '')
  }

  function isWaterfallLayout(items: HTMLElement[]): boolean {
    const article = items.find(item => item.classList.contains('Section'))
    return Boolean(article && journal.clientWidth >= article.offsetWidth * 2)
  }

  // The taller column owns the middle seam, leaving the space below the
  // shorter column unframed.
  function updateSeamOwner(items: HTMLElement[]): void {
    const columns = new Map<number, number>()
    items.forEach((item) => {
      const left = Math.round(item.offsetLeft)
      const bottom = Math.round(item.offsetTop + item.offsetHeight)
      columns.set(left, Math.max(columns.get(left) ?? 0, bottom))
    })
    if (columns.size < 2) {
      journal.removeAttribute('data-right-taller')
      return
    }

    const edges = [...columns.keys()].sort((a, b) => a - b)
    const leftBottom = columns.get(edges[0]) ?? 0
    const rightBottom = columns.get(edges[edges.length - 1]) ?? 0
    journal.toggleAttribute('data-right-taller', rightBottom > leftBottom)
  }

  function resetLayout(items: HTMLElement[]): void {
    items.forEach((item) => {
      item.style.removeProperty('grid-row')
    })
    journal.removeAttribute('data-right-taller')
  }

  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('load', scheduleLayout, { once: true })
  // <lazy-image> loads inside shadow DOM — invisible to img listeners and,
  // once a span pins the card, to the ResizeObserver. Its composed
  // image-load/image-error events are the only reliable growth signal.
  journal.addEventListener('image-load', scheduleLayout)
  journal.addEventListener('image-error', scheduleLayout)
  resizeObserver?.observe(journal)
  mutationObserver?.observe(journal, {
    childList: true,
    subtree: true,
    // lit patches reused result cards via text-node writes; a span-pinned card
    // keeps its height, so only characterData catches those swaps.
    characterData: true,
  })

  if (document.fonts)
    void document.fonts.ready.then(() => scheduleLayout())

  // Run the first layout synchronously so scroll restoration (which the
  // scroll plugin defers by one frame) measures the laid-out document.
  catchError(() => {
    applyLayout()
  })

  return {
    dispose() {
      disposed = true
      if (animationFrame)
        cancelAnimationFrame(animationFrame)
      animationFrame = 0
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      window.removeEventListener('load', scheduleLayout)
      journal.removeEventListener('image-load', scheduleLayout)
      journal.removeEventListener('image-error', scheduleLayout)
    },
  }
}
