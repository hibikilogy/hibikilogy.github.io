const instances = new WeakMap<Element, WaterFallInstance>()
const defaultContainerSelector = '.Journal > .container'
const defaultChildSelector = ':scope > .Section, :scope > .FrontPage'

interface WaterFallInstance {
  dispose: () => void
  refresh: () => Promise<void>
  setChildSelector: (selector: string) => void
}

export type WaterFallTarget = string | Element | NodeListOf<Element> | Element[] | null | undefined

function resolveContainers(container: WaterFallTarget): Element[] {
  if (typeof container === 'string') {
    return [...document.querySelectorAll(container)]
  }

  if (container instanceof Element) {
    return [container]
  }

  if (container instanceof NodeList || Array.isArray(container)) {
    return [...container].filter((node): node is Element => node instanceof Element)
  }

  return []
}

function queryChildren(container: Element, childSelector: string): HTMLElement[] {
  try {
    return [...container.querySelectorAll<HTMLElement>(childSelector)]
  }
  catch {
    return [...container.querySelectorAll<HTMLElement>('.Section, .FrontPage')]
  }
}

export function initWaterFall(container: WaterFallTarget = defaultContainerSelector, child = defaultChildSelector): void {
  const containers = resolveContainers(container)

  containers.forEach((journal) => {
    const existing = instances.get(journal)

    if (existing) {
      existing.setChildSelector(child)
      void existing.refresh()
      return
    }

    instances.set(journal, createWaterFall(journal as HTMLElement, child))
  })
}

export function refreshWaterFalls(): Promise<void[]> {
  return Promise.all([...document.querySelectorAll(defaultContainerSelector)].map((journal) => {
    initWaterFall(journal)
    return instances.get(journal)?.refresh?.() || Promise.resolve()
  }))
}

function createWaterFall(journal: HTMLElement, childSelector: string): WaterFallInstance {
  let animationFrame = 0
  let isDisposed = false
  let pendingResolve: (() => void) | null = null
  let currentChildSelector = childSelector

  const C_BELOW_FRONTPAGE = 'is-below-frontpage'
  const C_LEFT_COLUMN = 'is-waterfall-left-column'
  const C_RIGHT_COLUMN = 'is-waterfall-right-column'
  const C_LEFT_BORDER = 'is-waterfall-left-border-owner'
  const C_RIGHT_BORDER = 'is-waterfall-right-border-owner'
  const C_FRONTPAGE = 'FrontPage'
  const C_ARTICLE = 'Article'

  function resetBorderOwner(): void {
    journal.classList.remove(C_LEFT_BORDER, C_RIGHT_BORDER)
  }

  const observedImages = new WeakSet<HTMLImageElement>()
  const observedItems = new WeakSet<Element>()
  const resizeObserver = window.ResizeObserver
    ? new ResizeObserver(scheduleProgramming)
    : null

  const mutationObserver = window.MutationObserver
    ? new MutationObserver(scheduleProgramming)
    : null

  function setChildSelector(nextChildSelector: string): void {
    currentChildSelector = nextChildSelector || defaultChildSelector
  }

  function refresh(): Promise<void> {
    return scheduleProgramming()
  }

  function observeDynamicContent(items: Element[]): void {
    items.forEach((item) => {
      if (resizeObserver && !observedItems.has(item)) {
        resizeObserver.observe(item)
        observedItems.add(item)
      }
    })

    journal.querySelectorAll('img').forEach((img) => {
      if (observedImages.has(img))
        return

      observedImages.add(img)
      if (!img.complete) {
        img.addEventListener('load', scheduleProgramming, { once: true })
        img.addEventListener('error', scheduleProgramming, { once: true })
      }
    })
  }

  function scheduleProgramming(): Promise<void> {
    if (isDisposed)
      return Promise.resolve()

    if (animationFrame) {
      cancelAnimationFrame(animationFrame)
    }

    return new Promise((resolve) => {
      if (pendingResolve)
        pendingResolve()

      pendingResolve = resolve
      animationFrame = requestAnimationFrame(() => {
        programming()
        pendingResolve = null
        resolve()
      })
    })
  }

  function updateColumnClasses(items: HTMLElement[]): void {
    if (!items.length) {
      journal.classList.remove(C_LEFT_BORDER, C_RIGHT_BORDER)
      return
    }

    resetBorderOwner()

    const offsets = items.map(item => Math.round(item.offsetLeft))
    const minOffsetLeft = Math.min(...offsets)
    const maxOffsetLeft = Math.max(...offsets)

    if (minOffsetLeft === maxOffsetLeft) {
      items.forEach((item) => {
        item.classList.remove(C_LEFT_COLUMN, C_RIGHT_COLUMN)
      })
      journal.classList.remove(C_LEFT_BORDER, C_RIGHT_BORDER)
      return
    }

    items.forEach((item) => {
      const offsetLeft = Math.round(item.offsetLeft)
      item.classList.toggle(C_LEFT_COLUMN, offsetLeft <= minOffsetLeft)
      item.classList.toggle(C_RIGHT_COLUMN, offsetLeft >= maxOffsetLeft)
    })

    let leftColumnBottom = Number.NEGATIVE_INFINITY
    let rightColumnBottom = Number.NEGATIVE_INFINITY

    items.forEach((item) => {
      const bottom = Math.round(item.offsetTop + item.offsetHeight)
      if (item.classList.contains(C_LEFT_COLUMN))
        leftColumnBottom = Math.max(leftColumnBottom, bottom)
      if (item.classList.contains(C_RIGHT_COLUMN))
        rightColumnBottom = Math.max(rightColumnBottom, bottom)
    })

    const leftOwnsMiddleBorder = leftColumnBottom > rightColumnBottom
    journal.classList.toggle(C_LEFT_BORDER, leftOwnsMiddleBorder)
    journal.classList.toggle(C_RIGHT_BORDER, !leftOwnsMiddleBorder)
  }

  function isWaterfallLayout(): boolean {
    const item = journal.querySelector('.Section') as HTMLElement | null
    if (!item)
      return false
    return journal.clientWidth >= item.offsetWidth * 2
  }

  function updateFrontPageNeighbor(items: HTMLElement[]): void {
    const frontPage = items.find(item => item.classList.contains(C_FRONTPAGE))
    if (!frontPage)
      return

    const bottom = Math.round(frontPage.offsetTop + frontPage.offsetHeight)
    const left = Math.round(frontPage.offsetLeft)

    items.forEach(item => item.classList.remove(C_BELOW_FRONTPAGE))

    for (const item of items) {
      if (!item.classList.contains(C_ARTICLE))
        continue
      if (Math.round(item.offsetTop) < bottom)
        continue
      if (Math.round(item.offsetLeft) !== left)
        continue

      item.classList.add(C_BELOW_FRONTPAGE)
      break
    }
  }

  function programming(): void {
    animationFrame = 0
    const allArticles = queryChildren(journal, currentChildSelector)

    if (!allArticles.length) {
      journal.style.opacity = '1'
      return
    }

    if (!isWaterfallLayout()) {
      journal.style.opacity = '1'
      allArticles.forEach(item => item.classList.remove(
        C_BELOW_FRONTPAGE,
        C_LEFT_COLUMN,
        C_RIGHT_COLUMN,
      ))
      journal.classList.remove(C_LEFT_BORDER, C_RIGHT_BORDER)
      return
    }

    resetBorderOwner()

    observeDynamicContent(allArticles)

    const styles = window.getComputedStyle(journal)
    const rowHeight = Number.parseFloat(styles.getPropertyValue('grid-auto-rows')) || 1
    const rowGap = Number.parseFloat(styles.getPropertyValue('row-gap')) || 0

    journal.style.display = 'block'
    journal.style.opacity = '0'
    allArticles.forEach((article) => {
      article.style.gridRow = `span ${Math.ceil((article.offsetHeight + rowGap) / (rowHeight + rowGap))}`
    })
    journal.style.display = 'grid'
    updateColumnClasses(allArticles)
    updateFrontPageNeighbor(allArticles)
    journal.style.opacity = '1'
  }

  window.addEventListener('resize', scheduleProgramming)
  window.addEventListener('load', scheduleProgramming, { once: true })

  if (document.fonts) {
    void document.fonts.ready.then(scheduleProgramming)
  }

  mutationObserver?.observe(journal, {
    childList: true,
    subtree: true,
  })

  void scheduleProgramming()

  return {
    dispose() {
      isDisposed = true
      if (animationFrame)
        cancelAnimationFrame(animationFrame)
      pendingResolve?.()
      pendingResolve = null
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', scheduleProgramming)
      window.removeEventListener('load', scheduleProgramming)
    },
    refresh,
    setChildSelector,
  }
}

window.initWaterFall = initWaterFall
window.refreshWaterFalls = refreshWaterFalls

let pageObserver: MutationObserver | null = null

export function bootWaterFalls(): void {
  initWaterFall(document.querySelectorAll('.Journal > .container'))

  if (window.MutationObserver) {
    pageObserver?.disconnect()
    pageObserver = new MutationObserver(() => {
      document.querySelectorAll('.Journal > .container').forEach((journal) => {
        initWaterFall(journal)
      })
    })

    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }
}

export function disposeWaterFalls(): void {
  pageObserver?.disconnect()
  pageObserver = null

  document.querySelectorAll(defaultContainerSelector).forEach((journal) => {
    instances.get(journal)?.dispose()
    instances.delete(journal)
  })
}

declare global {
  interface Window {
    initWaterFall?: (container?: WaterFallTarget, child?: string) => void
    refreshWaterFalls?: () => Promise<void[]>
  }
}
