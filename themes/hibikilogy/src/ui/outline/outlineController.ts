import type { HeaderItem, OutlineOptions } from './types.ts'
import { throttle } from 'lodash-es'
import { catchError } from '../../shared/result.ts'
import { outlineDom } from './config.ts'

const resolvedHeaders: Array<Pick<HeaderItem, 'element' | 'link'>> = []
let cleanupOutline: (() => void) | null = null
let currentActiveHash: string | null = null

function getHeaders(range: number | [number, number] | 'deep' | false): HeaderItem[] {
  const headers = [...document.querySelectorAll<HTMLElement>(outlineDom.headings)]
    .filter(el => el.id && el.hasChildNodes())
    .map(el => ({
      element: el,
      title: serializeHeader(el),
      link: `#${el.id}`,
      level: Number(el.tagName[1]),
    }))

  return resolveHeaders(headers, range)
}

function serializeHeader(header: HTMLElement): string {
  let text = ''
  for (const node of header.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    }
  }
  return text.trim()
}

function resolveHeaders(headers: HeaderItem[], range: number | [number, number] | 'deep' | false): HeaderItem[] {
  if (range === false)
    return []

  const levelsRange = range || 2
  const [high, low] = typeof levelsRange === 'number'
    ? [levelsRange, levelsRange]
    : levelsRange === 'deep'
      ? [2, 6]
      : levelsRange

  const filteredHeaders = headers.filter(header => header.level >= high && header.level <= low)
  resolvedHeaders.length = 0
  for (const { element, link } of filteredHeaders) {
    resolvedHeaders.push({ element, link })
  }

  const tree: HeaderItem[] = []
  for (let index = 0; index < filteredHeaders.length; index += 1) {
    const current = filteredHeaders[index]
    if (index === 0) {
      tree.push(current)
      continue
    }

    appendToParentOrRoot(current, filteredHeaders, index, tree)
  }

  return tree
}

function appendToParentOrRoot(
  current: HeaderItem,
  headers: HeaderItem[],
  currentIndex: number,
  tree: HeaderItem[],
): void {
  for (let prevIndex = currentIndex - 1; prevIndex >= 0; prevIndex -= 1) {
    const previous = headers[prevIndex]
    if (previous.level < current.level) {
      const children = previous.children ??= []
      children.push(current)
      return
    }
  }

  tree.push(current)
}

function findOutlineLink(hash: string): Element | null {
  // location.hash may contain malformed percent escapes (e.g. `#%`), and the
  // interpolated selector may still be invalid — treat both as "no active link"
  const [decodedHash] = catchError(() => decodeURIComponent(hash))
  const [link] = catchError(() =>
    document.querySelector(`${outlineDom.link}[href$="${decodedHash ?? hash}"]`),
  )
  return link ?? null
}

interface ActiveAnchorController {
  beginNavigation: (hash: string) => void
  dispose: () => void
}

function useActiveAnchor(marker: HTMLElement, options: OutlineOptions): ActiveAnchorController {
  let pendingNavigationHash: string | null = null
  let settleTimer: number | null = null
  let previousActiveLink: Element | null = null
  const onScroll = throttle(() => {
    setActiveLink()
    if (pendingNavigationHash)
      scheduleNavigationEnd()
  }, 100)

  function finishNavigation(): void {
    if (settleTimer !== null)
      window.clearTimeout(settleTimer)
    settleTimer = null
    pendingNavigationHash = null
    setActiveLink()
  }

  function scheduleNavigationEnd(): void {
    if (settleTimer !== null)
      window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(finishNavigation, 180)
  }

  requestAnimationFrame(setActiveLink)
  window.addEventListener('scroll', onScroll)
  window.addEventListener('scrollend', finishNavigation)

  function setActiveLink(): void {
    const scrollY = window.scrollY
    const innerHeight = window.innerHeight
    const offsetHeight = document.body.offsetHeight
    const isBottom = Math.abs(scrollY + innerHeight - offsetHeight) < 1
    const headers = resolvedHeaders
      .map(({ element, link }) => ({
        element,
        link,
      }))
      .filter(({ element }) => !Number.isNaN(element.getBoundingClientRect().top))

    if (!headers.length || scrollY < 1) {
      activateLink(null)
      return
    }

    if (isBottom) {
      activateLink(headers[headers.length - 1].link)
      return
    }

    // Read the actual scroll-margin-top from the first heading to stay in sync with CSS
    const scrollMargin = Number.parseFloat(getComputedStyle(headers[0].element).scrollMarginTop) || 0
    const threshold = scrollMargin + 4
    let activeLink: string | null = null
    for (const { link, element } of headers) {
      if (element.getBoundingClientRect().top > threshold)
        break
      activeLink = link
    }
    activateLink(activeLink)
  }

  function activateLink(hash: string | null): void {
    previousActiveLink?.classList.remove('active')

    previousActiveLink = hash == null ? null : findOutlineLink(hash)

    if (previousActiveLink instanceof HTMLElement) {
      previousActiveLink.classList.add('active')
      marker.style.top = `${previousActiveLink.offsetTop + 8}px`
      marker.style.opacity = '1'
    }
    else {
      marker.style.top = '40px'
      marker.style.opacity = '0'
    }

    // Sync URL hash with current active heading (without triggering scroll)
    if (!pendingNavigationHash && hash !== currentActiveHash) {
      currentActiveHash = hash
      options.replaceHash(hash)
    }
  }

  return {
    beginNavigation: (hash) => {
      pendingNavigationHash = hash
      currentActiveHash = hash
      scheduleNavigationEnd()
    },
    dispose: () => {
      onScroll.cancel()
      if (settleTimer !== null)
        window.clearTimeout(settleTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('scrollend', finishNavigation)
    },
  }
}

export function initOutline(options: OutlineOptions): void {
  disposeOutline()

  const marker = document.querySelector<HTMLElement>(outlineDom.marker)
  if (!marker)
    return

  getHeaders([1, 2])

  const activeAnchor = useActiveAnchor(marker, options)
  const outline = marker.closest(outlineDom.root)
  // Delegated click handler on outline: focus the target heading for accessibility
  const handleClick = (event: Event): void => {
    const el = event.target
    if (el instanceof HTMLAnchorElement && el.matches(outlineDom.link)) {
      const id = el.hash.slice(1)
      const heading = document.getElementById(decodeURIComponent(id))
      activeAnchor.beginNavigation(el.hash)
      heading?.focus({ preventScroll: true })
    }
  }
  outline?.addEventListener('click', handleClick)

  cleanupOutline = () => {
    activeAnchor.dispose()
    outline?.removeEventListener('click', handleClick)
    cleanupOutline = null
  }

  // Scroll to heading if page was loaded with a hash
  const [decodedLocationHash] = catchError(() => decodeURIComponent(location.hash))
  const hash = decodedLocationHash ?? location.hash
  if (hash) {
    currentActiveHash = hash
    const heading = resolvedHeaders.find(h => h.link === hash)?.element
    heading?.scrollIntoView()
  }
}

export function disposeOutline(): void {
  cleanupOutline?.()
  resolvedHeaders.length = 0
  currentActiveHash = null
}
