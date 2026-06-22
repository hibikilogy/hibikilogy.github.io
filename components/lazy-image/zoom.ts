const openHandlers = new WeakMap<HTMLImageElement, EventListener>()
const attachedImages = new Set<HTMLImageElement>()
const originalVisibility = new WeakMap<HTMLImageElement, string>()
const ANIMATION_MS = 220
const VIEWPORT_PADDING = 24

interface ZoomSession {
  source: HTMLImageElement
  overlay: HTMLDivElement
  zoomed: HTMLImageElement
  keydownHandler: (event: KeyboardEvent) => void
  resizeHandler: () => void
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

export function attachAllToZoom(images: Iterable<HTMLImageElement> | ArrayLike<HTMLImageElement>): void {
  for (const image of Array.from(images))
    attachToZoom(image)
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

export function detachAllFromZoom(): void {
  for (const image of attachedImages) {
    const openHandler = openHandlers.get(image)
    if (openHandler)
      image.removeEventListener('click', openHandler)
  }
  attachedImages.clear()
  closeZoom()
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
  overlay.className = 'medium-zoom-overlay'
  applyOverlayStyle(overlay)

  const zoomed = source.cloneNode(false) as HTMLImageElement
  zoomed.className = `${source.className} medium-zoom-image--opened`
  zoomed.removeAttribute('srcset')
  zoomed.removeAttribute('sizes')
  zoomed.src = source.currentSrc || source.src
  applyZoomedImageStyle(zoomed, sourceRect)

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

  const session: ZoomSession = {
    source,
    overlay,
    zoomed,
    keydownHandler,
    resizeHandler,
    closing: false,
  }

  activeSession = session
  document.body.append(overlay, zoomed)
  hideSourceImage(source)
  document.body.classList.add('medium-zoom--opened')

  overlay.addEventListener('click', () => closeSession(session))
  zoomed.addEventListener('click', () => closeSession(session))
  window.addEventListener('keydown', keydownHandler)
  window.addEventListener('resize', resizeHandler)

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
  }, ANIMATION_MS)
}

function destroySession(session: ZoomSession): void {
  window.removeEventListener('keydown', session.keydownHandler)
  window.removeEventListener('resize', session.resizeHandler)

  if (session.cleanupTimer !== undefined)
    window.clearTimeout(session.cleanupTimer)

  restoreSourceImage(session.source)
  session.overlay.remove()
  session.zoomed.remove()

  if (activeSession === session) {
    activeSession = undefined
    document.body.classList.remove('medium-zoom--opened')
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
  image.classList.add('medium-zoom-image--hidden')
  image.style.visibility = 'hidden'
}

function restoreSourceImage(image: HTMLImageElement): void {
  image.classList.remove('medium-zoom-image--hidden')
  image.style.visibility = originalVisibility.get(image) ?? ''
  originalVisibility.delete(image)
}

function applyOverlayStyle(overlay: HTMLDivElement): void {
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    opacity: '0',
    background: 'rgba(255, 255, 255, 0.88)',
    transition: `opacity ${ANIMATION_MS}ms ease`,
    cursor: 'zoom-out',
    zIndex: '999',
  })
}

function applyZoomedImageStyle(image: HTMLImageElement, rect: DOMRect): void {
  Object.assign(image.style, {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    opacity: '1',
    transform: 'none',
    transition: `top ${ANIMATION_MS}ms ease, left ${ANIMATION_MS}ms ease, width ${ANIMATION_MS}ms ease, height ${ANIMATION_MS}ms ease, opacity ${ANIMATION_MS}ms ease`,
    cursor: 'zoom-out',
    zIndex: '1000',
    objectFit: 'contain',
  })
}

function applyRect(image: HTMLImageElement, rect: DOMRect): void {
  image.style.top = `${rect.top}px`
  image.style.left = `${rect.left}px`
  image.style.width = `${rect.width}px`
  image.style.height = `${rect.height}px`
}
