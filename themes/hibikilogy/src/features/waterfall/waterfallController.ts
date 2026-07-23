import type { WaterfallController } from './types.ts'
import { catchError } from '../../shared/result.ts'

const defaultChildSelector = ':scope > .Section, :scope > .FrontPage'
const belowFrontpageClass = 'is-below-frontpage'
const leftColumnClass = 'is-waterfall-left-column'
const rightColumnClass = 'is-waterfall-right-column'
const leftBorderClass = 'is-waterfall-left-border-owner'
const rightBorderClass = 'is-waterfall-right-border-owner'

function supportsGridLanes(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('display', 'grid-lanes')
}

function queryChildren(container: Element, childSelector: string): HTMLElement[] {
  const [children] = catchError(() => (
    [...container.querySelectorAll<HTMLElement>(childSelector)]
  ))
  return children ?? [...container.querySelectorAll<HTMLElement>('.Section, .FrontPage')]
}

export function createWaterfallController(
  journal: HTMLElement,
  childSelector = defaultChildSelector,
  nativeLayout = supportsGridLanes(),
): WaterfallController {
  let animationFrame = 0
  let disposed = false
  let lastSignature = ''
  let lastItems: HTMLElement[] = []
  let pendingLayout: Promise<void> | null = null
  let resolvePending: (() => void) | null = null

  const observedImages = new WeakSet<HTMLImageElement>()
  const observedItems = new WeakSet<Element>()
  const resizeObserver = window.ResizeObserver
    ? new ResizeObserver(() => {
        void scheduleLayout()
      })
    : null
  const mutationObserver = window.MutationObserver
    ? new MutationObserver(() => {
        void scheduleLayout()
      })
    : null

  function scheduleLayout(): Promise<void> {
    if (disposed)
      return Promise.resolve()
    if (pendingLayout)
      return pendingLayout

    pendingLayout = new Promise((resolve) => {
      resolvePending = resolve
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0
        try {
          applyLayout()
        }
        finally {
          pendingLayout = null
          resolvePending = null
          resolve()
        }
      })
    })

    return pendingLayout
  }

  function observeDynamicContent(items: Element[]): void {
    items.forEach((item) => {
      if (!resizeObserver || observedItems.has(item))
        return
      resizeObserver.observe(item)
      observedItems.add(item)
    })

    journal.querySelectorAll('img').forEach((img) => {
      if (observedImages.has(img))
        return

      observedImages.add(img)
      if (!img.complete) {
        img.addEventListener('load', scheduleLayout, { once: true })
        img.addEventListener('error', scheduleLayout, { once: true })
      }
    })
  }

  function applyLayout(): void {
    const items = queryChildren(journal, childSelector)
    observeDynamicContent(items)

    const signature = [
      journal.clientWidth,
      items.length,
      ...items.map(item => item.offsetHeight),
    ].join(':')
    const hasSameItems = items.length === lastItems.length
      && items.every((item, index) => item === lastItems[index])
    if (signature === lastSignature && hasSameItems)
      return
    lastSignature = signature
    lastItems = items

    if (!items.length) {
      resetLayoutClasses(items)
      journal.style.opacity = '1'
      return
    }

    if (!isWaterfallLayout(items)) {
      resetLayoutClasses(items)
      journal.style.opacity = '1'
      return
    }

    resetBorderOwner()

    if (nativeLayout) {
      journal.style.opacity = '1'
      updateColumnClasses(items)
      return
    }

    const styles = window.getComputedStyle(journal)
    const rowHeight = Number.parseFloat(styles.getPropertyValue('grid-auto-rows')) || 1
    const rowGap = Number.parseFloat(styles.getPropertyValue('row-gap')) || 0

    journal.style.display = 'block'
    journal.style.opacity = '0'
    items.forEach((item) => {
      const rowSpan = Math.ceil((item.offsetHeight + rowGap) / (rowHeight + rowGap))
      item.style.gridRow = `span ${rowSpan}`
    })
    journal.style.display = 'grid'
    updateColumnClasses(items)
    updateFrontPageNeighbor(items)
    journal.style.opacity = '1'
  }

  function isWaterfallLayout(items: HTMLElement[]): boolean {
    const article = items.find(item => item.classList.contains('Section'))
    return Boolean(article && journal.clientWidth >= article.offsetWidth * 2)
  }

  function resetLayoutClasses(items: HTMLElement[]): void {
    items.forEach((item) => {
      item.classList.remove(
        belowFrontpageClass,
        leftColumnClass,
        rightColumnClass,
      )
      item.style.removeProperty('grid-row')
    })
    resetBorderOwner()
  }

  function resetBorderOwner(): void {
    journal.classList.remove(leftBorderClass, rightBorderClass)
  }

  function updateColumnClasses(items: HTMLElement[]): void {
    if (!items.length) {
      resetBorderOwner()
      return
    }

    resetBorderOwner()
    const offsets = items.map(item => Math.round(item.offsetLeft))
    const minOffsetLeft = Math.min(...offsets)
    const maxOffsetLeft = Math.max(...offsets)

    if (minOffsetLeft === maxOffsetLeft) {
      items.forEach((item) => {
        item.classList.remove(leftColumnClass, rightColumnClass)
      })
      return
    }

    items.forEach((item) => {
      const offsetLeft = Math.round(item.offsetLeft)
      item.classList.toggle(leftColumnClass, offsetLeft <= minOffsetLeft)
      item.classList.toggle(rightColumnClass, offsetLeft >= maxOffsetLeft)
    })

    let leftColumnBottom = Number.NEGATIVE_INFINITY
    let rightColumnBottom = Number.NEGATIVE_INFINITY
    items.forEach((item) => {
      const bottom = Math.round(item.offsetTop + item.offsetHeight)
      if (item.classList.contains(leftColumnClass))
        leftColumnBottom = Math.max(leftColumnBottom, bottom)
      if (item.classList.contains(rightColumnClass))
        rightColumnBottom = Math.max(rightColumnBottom, bottom)
    })

    const leftOwnsMiddleBorder = leftColumnBottom > rightColumnBottom
    journal.classList.toggle(leftBorderClass, leftOwnsMiddleBorder)
    journal.classList.toggle(rightBorderClass, !leftOwnsMiddleBorder)
  }

  function updateFrontPageNeighbor(items: HTMLElement[]): void {
    const frontPage = items.find(item => item.classList.contains('FrontPage'))
    if (!frontPage)
      return

    const bottom = Math.round(frontPage.offsetTop + frontPage.offsetHeight)
    const left = Math.round(frontPage.offsetLeft)
    items.forEach(item => item.classList.remove(belowFrontpageClass))

    const neighbor = items.find(item => (
      item.classList.contains('Article')
      && Math.round(item.offsetTop) >= bottom
      && Math.round(item.offsetLeft) === left
    ))
    neighbor?.classList.add(belowFrontpageClass)
  }

  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('load', scheduleLayout, { once: true })
  resizeObserver?.observe(journal)
  mutationObserver?.observe(journal, {
    childList: true,
    subtree: true,
  })

  if (document.fonts)
    void document.fonts.ready.then(scheduleLayout)

  void scheduleLayout()

  return {
    dispose() {
      disposed = true
      if (animationFrame)
        cancelAnimationFrame(animationFrame)
      animationFrame = 0
      resolvePending?.()
      resolvePending = null
      pendingLayout = null
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', scheduleLayout)
      window.removeEventListener('load', scheduleLayout)
    },
  }
}
