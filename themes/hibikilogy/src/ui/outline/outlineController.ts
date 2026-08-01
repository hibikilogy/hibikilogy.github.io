import type { HeaderItem, OutlineOptions } from './types.ts'
import { onScopeDispose } from '@vue/reactivity'
import { throttle } from 'lodash-es'
import { catchError } from 'shared/result.ts'
import { safeDecodeURIComponent } from 'shared/url.ts'
import { useEventListener } from 'shared/useEventListener.ts'
import { outlineDom } from './config.ts'

interface OutlineState {
  /** Level-filtered headings, in document order, for active-link tracking. */
  anchors: Array<Pick<HeaderItem, 'element' | 'link'>>
  activeHash: { value: string | null }
}

// Marker geometry: 8px below the active link; parked at 40px when no link is
// active (top is set from JS; CSS only styles the visuals).
const MARKER_ACTIVE_OFFSET = 8
const MARKER_HIDDEN_TOP = 40

function getHeaders(range: number | [number, number] | 'deep' | false): OutlineState['anchors'] {
  const headers = [...document.querySelectorAll<HTMLElement>(outlineDom.headings)]
    .filter(el => el.id && el.hasChildNodes())
    .map(el => ({
      element: el,
      title: serializeHeader(el),
      link: `#${el.id}`,
      level: Number(el.tagName[1]),
    }))

  return filterHeadersByLevel(headers, range)
    .map(({ element, link }) => ({ element, link }))
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

function filterHeadersByLevel(headers: HeaderItem[], range: number | [number, number] | 'deep' | false): HeaderItem[] {
  if (range === false)
    return []

  const levelsRange = range || 2
  const [high, low] = typeof levelsRange === 'number'
    ? [levelsRange, levelsRange]
    : levelsRange === 'deep'
      ? [2, 6]
      : levelsRange

  return headers.filter(header => header.level >= high && header.level <= low)
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

function useActiveAnchor(marker: HTMLElement, options: OutlineOptions, state: OutlineState): void {
  let pendingNavigationHash: string | null = null
  let settleTimer: number | null = null
  let previousActiveLink: Element | null = null
  let scrollFrame = 0
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

  scrollFrame = requestAnimationFrame(setActiveLink)
  useEventListener(window, 'scroll', onScroll, { passive: true })
  useEventListener(window, 'scrollend', finishNavigation)
  onScopeDispose(() => {
    onScroll.cancel()
    cancelAnimationFrame(scrollFrame)
    if (settleTimer !== null)
      window.clearTimeout(settleTimer)
  })

  function setActiveLink(): void {
    const scrollY = window.scrollY
    const innerHeight = window.innerHeight
    const offsetHeight = document.body.offsetHeight
    const isBottom = Math.abs(scrollY + innerHeight - offsetHeight) < 1
    const headers = state.anchors
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
      marker.style.top = `${previousActiveLink.offsetTop + MARKER_ACTIVE_OFFSET}px`
      marker.style.opacity = '1'
    }
    else {
      marker.style.top = `${MARKER_HIDDEN_TOP}px`
      marker.style.opacity = '0'
    }

    // Sync URL hash with current active heading (without triggering scroll)
    if (!pendingNavigationHash && hash !== state.activeHash.value) {
      state.activeHash.value = hash
      options.replaceHash(hash)
    }
  }

  function beginNavigation(hash: string): void {
    pendingNavigationHash = hash
    state.activeHash.value = hash
    scheduleNavigationEnd()
  }

  const outline = marker.closest(outlineDom.root)
  const handleClick = (event: Event): void => {
    const el = event.target
    if (el instanceof HTMLAnchorElement && el.matches(outlineDom.link)) {
      const id = el.hash.slice(1)
      const heading = document.getElementById(safeDecodeURIComponent(id))
      beginNavigation(el.hash)
      heading?.focus({ preventScroll: true })
    }
  }
  outline?.addEventListener('click', handleClick)
  onScopeDispose(() => outline?.removeEventListener('click', handleClick))
}

export function setupOutline(options: OutlineOptions): void {
  const marker = document.querySelector<HTMLElement>(outlineDom.marker)
  if (!marker)
    return

  const anchors = getHeaders([1, 2])
  const state: OutlineState = { anchors, activeHash: { value: null } }
  useActiveAnchor(marker, options, state)

  const hash = safeDecodeURIComponent(location.hash)
  if (hash) {
    state.activeHash.value = hash
    const heading = anchors.find(anchor => anchor.link === hash)?.element
    heading?.scrollIntoView()
  }
}
