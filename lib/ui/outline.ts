import { throttleAndDebounce } from './utils.ts'

interface HeaderItem {
  element: HTMLElement
  title: string
  link: string
  level: number
  children?: HeaderItem[]
}

const resolvedHeaders: Array<Pick<HeaderItem, 'element' | 'link'>> = []
let cleanupActiveAnchor: (() => void) | null = null

function getHeaders(range: number | [number, number] | 'deep' | false): HeaderItem[] {
  const headers = [...document.querySelectorAll<HTMLElement>('.content-container :where(h1,h2,h3,h4,h5,h6)')]
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

function useActiveAnchor(marker: HTMLElement): void {
  const onScroll = throttleAndDebounce(setActiveLink, 100)
  let previousActiveLink: Element | null = null

  requestAnimationFrame(setActiveLink)
  window.addEventListener('scroll', onScroll)

  cleanupActiveAnchor = () => {
    window.removeEventListener('scroll', onScroll)
    cleanupActiveAnchor = null
  }

  function setActiveLink(): void {
    const scrollY = window.scrollY
    const innerHeight = window.innerHeight
    const offsetHeight = document.body.offsetHeight
    const isBottom = Math.abs(scrollY + innerHeight - offsetHeight) < 1
    const headers = resolvedHeaders
      .map(({ element, link }) => ({
        link,
        top: getAbsoluteTop(element),
      }))
      .filter(({ top }) => !Number.isNaN(top))
      .sort((a, b) => a.top - b.top)

    if (!headers.length || scrollY < 1) {
      activateLink(null)
      return
    }

    if (isBottom) {
      activateLink(headers[headers.length - 1].link)
      return
    }

    let activeLink: string | null = null
    for (const { link, top } of headers) {
      if (top > scrollY + 4)
        break
      activeLink = link
    }
    activateLink(activeLink)
  }

  function activateLink(hash: string | null): void {
    previousActiveLink?.classList.remove('active')

    previousActiveLink = hash == null
      ? null
      : document.querySelector(`a[href="${location.origin + location.pathname + decodeURIComponent(hash)}"]`)

    if (previousActiveLink instanceof HTMLElement) {
      previousActiveLink.classList.add('active')
      marker.style.top = `${previousActiveLink.offsetTop + 8}px`
      marker.style.opacity = '1'
    }
    else {
      marker.style.top = '40px'
      marker.style.opacity = '0'
    }
  }
}

function getAbsoluteTop(element: HTMLElement): number {
  return element.getBoundingClientRect().top + window.scrollY
}

export function initOutline(): void {
  cleanupActiveAnchor?.()

  const marker = document.querySelector<HTMLElement>('.outline-marker')
  if (!marker)
    return

  getHeaders([1, 2])
  useActiveAnchor(marker)
}
