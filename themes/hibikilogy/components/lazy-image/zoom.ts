import { resolveDurationMs } from 'shared/animation.ts'

const openHandlers = new WeakMap<HTMLImageElement, EventListener>()
const attachedImages = new Set<HTMLImageElement>()
const originalVisibility = new WeakMap<HTMLImageElement, string>()
const VIEWPORT_PADDING = 24

interface ZoomSession {
  source: HTMLImageElement
  overlay: HTMLDivElement
  zoomed: HTMLImageElement
  keydownHandler: (event: KeyboardEvent) => void
  resizeHandler: () => void
  scrollHandler: () => void
  wheelHandler: () => void
  touchMoveHandler: () => void
  cleanupTimer?: number
  closing: boolean
}

let activeSession: ZoomSession | undefined

export function attachToZoom(image: HTMLImageElement): void {
  if (openHandlers.has(image))
    return

  const openHandler: EventListener = (event) => {
    event.preventDefault()
    event.stopPropagation()
    openZoom(image)
  }

  image.addEventListener('click', openHandler)
  openHandlers.set(image, openHandler)
  attachedImages.add(image)
}

export function detachFromZoom(image: HTMLImageElement): void {
  const openHandler = openHandlers.get(image)
  if (openHandler) {
    image.removeEventListener('click', openHandler)
    openHandlers.delete(image)
  }

  attachedImages.delete(image)

  if (activeSession?.source === image)
    closeZoom()
}

export interface ZoomBinding {
  attachAll: (images: Iterable<HTMLImageElement> | ArrayLike<HTMLImageElement>) => void
  detachAll: () => void
  close: () => void
}

/**
 * Zoom state scoped to one owner (a page): attach a set of images and later
 * detach exactly those, leaving other owners' bindings untouched.
 */
export function createZoomBinding(): ZoomBinding {
  const bound = new Set<HTMLImageElement>()

  return {
    attachAll(images) {
      for (const image of Array.from(images)) {
        attachToZoom(image)
        bound.add(image)
      }
    },
    detachAll() {
      for (const image of bound)
        detachFromZoom(image)
      bound.clear()
    },
    close: () => closeZoom(),
  }
}

export function closeZoom(): void {
  if (!activeSession)
    return

  closeSession(activeSession)
}

function openZoom(source: HTMLImageElement): void {
  if (!document.body || !source.isConnected)
    return

  if (activeSession?.source === source) {
    closeSession(activeSession)
    return
  }

  if (activeSession)
    destroySession(activeSession)

  const sourceRect = source.getBoundingClientRect()
  if (sourceRect.width === 0 || sourceRect.height === 0)
    return

  const overlay = document.createElement('div')
  overlay.className = 'zoom-overlay'

  const zoomed = source.cloneNode(false) as HTMLImageElement
  zoomed.className = `${source.className} zoom-image--opened`
  zoomed.removeAttribute('srcset')
  zoomed.removeAttribute('sizes')
  zoomed.src = source.currentSrc || source.src
  applyRect(zoomed, sourceRect)

  const keydownHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape')
      closeZoom()
  }

  const resizeHandler = () => {
    if (!activeSession || activeSession.source !== source || activeSession.closing)
      return

    const targetRect = computeTargetRect(source)
    applyRect(activeSession.zoomed, targetRect)
  }

  const closeOnViewportMotion = () => {
    if (!activeSession || activeSession.source !== source || activeSession.closing)
      return

    closeSession(activeSession)
  }

  const scrollHandler = () => closeOnViewportMotion()
  const wheelHandler = () => closeOnViewportMotion()
  const touchMoveHandler = () => closeOnViewportMotion()

  const session: ZoomSession = {
    source,
    overlay,
    zoomed,
    keydownHandler,
    resizeHandler,
    scrollHandler,
    wheelHandler,
    touchMoveHandler,
    closing: false,
  }

  activeSession = session
  document.body.append(overlay, zoomed)
  hideSourceImage(source)
  document.body.classList.add('zoom--opened')

  overlay.addEventListener('click', () => closeSession(session))
  zoomed.addEventListener('click', () => closeSession(session))
  window.addEventListener('keydown', keydownHandler)
  window.addEventListener('resize', resizeHandler)
  window.addEventListener('scroll', scrollHandler, { passive: true })
  window.addEventListener('wheel', wheelHandler, { passive: true })
  window.addEventListener('touchmove', touchMoveHandler, { passive: true })

  requestAnimationFrame(() => {
    if (activeSession !== session || session.closing)
      return

    overlay.style.opacity = '1'
    applyRect(zoomed, computeTargetRect(source))
  })
}

function closeSession(session: ZoomSession): void {
  if (activeSession !== session || session.closing)
    return

  session.closing = true
  window.removeEventListener('keydown', session.keydownHandler)
  window.removeEventListener('resize', session.resizeHandler)
  window.removeEventListener('scroll', session.scrollHandler)
  window.removeEventListener('wheel', session.wheelHandler)
  window.removeEventListener('touchmove', session.touchMoveHandler)

  session.overlay.style.opacity = '0'
  const sourceRect = session.source.isConnected
    ? session.source.getBoundingClientRect()
    : null

  if (sourceRect && sourceRect.width > 0 && sourceRect.height > 0) {
    applyRect(session.zoomed, sourceRect)
  }
  else {
    session.zoomed.style.opacity = '0'
  }

  session.cleanupTimer = window.setTimeout(() => {
    if (activeSession === session)
      destroySession(session)
  }, resolveDurationMs('mediumZoom'))
}

function destroySession(session: ZoomSession): void {
  window.removeEventListener('keydown', session.keydownHandler)
  window.removeEventListener('resize', session.resizeHandler)
  window.removeEventListener('scroll', session.scrollHandler)
  window.removeEventListener('wheel', session.wheelHandler)
  window.removeEventListener('touchmove', session.touchMoveHandler)

  if (session.cleanupTimer !== undefined)
    window.clearTimeout(session.cleanupTimer)

  restoreSourceImage(session.source)
  session.overlay.remove()
  session.zoomed.remove()

  if (activeSession === session) {
    activeSession = undefined
    document.body.classList.remove('zoom--opened')
  }
}

function computeTargetRect(image: HTMLImageElement): DOMRect {
  const naturalWidth = image.naturalWidth || image.clientWidth || image.width || 1
  const naturalHeight = image.naturalHeight || image.clientHeight || image.height || 1
  const maxWidth = Math.max(window.innerWidth - VIEWPORT_PADDING * 2, 1)
  const maxHeight = Math.max(window.innerHeight - VIEWPORT_PADDING * 2, 1)
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  const left = (window.innerWidth - width) / 2
  const top = (window.innerHeight - height) / 2
  return new DOMRect(left, top, width, height)
}

function hideSourceImage(image: HTMLImageElement): void {
  originalVisibility.set(image, image.style.visibility)
  image.classList.add('zoom-image--hidden')
  image.style.visibility = 'hidden'
}

function restoreSourceImage(image: HTMLImageElement): void {
  image.classList.remove('zoom-image--hidden')
  image.style.visibility = originalVisibility.get(image) ?? ''
  originalVisibility.delete(image)
}

function applyRect(image: HTMLImageElement, rect: DOMRect): void {
  image.style.top = `${rect.top}px`
  image.style.left = `${rect.left}px`
  image.style.width = `${rect.width}px`
  image.style.height = `${rect.height}px`
}
