import type { AutoSizesOptions, TriggerLoadOptions } from './types'
import { debounce } from 'lodash-es'
import { createPngDataUri as createPngDataUriFromThumbHash } from './thumbhash'

export function autoSizes(
  element: HTMLImageElement | HTMLSourceElement,
  { updateOnResize = false }: AutoSizesOptions = {},
): () => void {
  const targets = collectAutoSizeTargets(element)
  for (const target of targets)
    updateSizesAttribute(target)

  if (!updateOnResize || !targets.some(hasAutoSizes) || typeof ResizeObserver === 'undefined')
    return noop

  const observedImage = element instanceof HTMLImageElement
    ? element
    : (element.parentElement?.getElementsByTagName('img')[0] ?? null)
  if (!observedImage)
    return noop

  const update = debounce(() => {
    for (const target of collectAutoSizeTargets(element))
      updateSizesAttribute(target)
  }, 300)
  const observer = new ResizeObserver(update)
  observer.observe(observedImage)

  return () => observer.disconnect()
}

export function triggerLoad(
  image: HTMLImageElement,
  { onImageLoad, onImageError }: TriggerLoadOptions = {},
): () => void {
  const cleanups: Array<() => void> = []
  let isActive = true
  const cleanup = () => {
    isActive = false
    for (const fn of cleanups) fn()
    cleanups.length = 0
  }

  const { srcset: dataSrcset, src: dataSrc, sizes: dataSizes } = image.dataset
  if (!dataSrcset && !dataSrc)
    return cleanup

  let isSettled = false
  const resolveLoad = () => {
    if (!isActive || isSettled)
      return

    isSettled = true
    onImageLoad?.(image)
  }
  const resolveError = (event: Event) => {
    if (!isActive || isSettled)
      return

    isSettled = true
    onImageError?.(image, event)
  }

  if (onImageLoad) {
    const handler = () => resolveLoad()
    image.addEventListener('load', handler, { once: true })
    cleanups.push(() => image.removeEventListener('load', handler))
  }
  if (onImageError) {
    const handler = (event: Event) => resolveError(event)
    image.addEventListener('error', handler, { once: true })
    cleanups.push(() => image.removeEventListener('error', handler))
  }

  if (isDescendantOfPicture(image))
    swapPictureSources(image)

  if (dataSizes === 'auto') {
    const width = getOffsetWidth(image)
    if (width)
      image.sizes = `${width}px`
  }

  swapDataAttribute(image, 'srcset')
  swapDataAttribute(image, 'src')

  if (image.complete && image.naturalWidth > 0 && onImageLoad)
    queueMicrotask(resolveLoad)

  return cleanup
}

export function createPlaceholderFromThumbHash(hash?: string): string | undefined {
  if (!hash)
    return undefined

  try {
    return createPngDataUriFromThumbHash(hash)
  }
  catch {
    return undefined
  }
}

function hasAutoSizes(element: HTMLImageElement | HTMLSourceElement): boolean {
  return element.dataset.sizes === 'auto'
}

function collectAutoSizeTargets(
  element: HTMLImageElement | HTMLSourceElement,
): Array<HTMLImageElement | HTMLSourceElement> {
  const targets: Array<HTMLImageElement | HTMLSourceElement> = [element]
  if (
    element instanceof HTMLImageElement
    && element.parentElement?.tagName.toLowerCase() === 'picture'
  ) {
    for (const source of element.parentElement.querySelectorAll<HTMLSourceElement>('source[data-sizes="auto"]'))
      targets.push(source)
  }

  return targets
}

function updateSizesAttribute(element: HTMLImageElement | HTMLSourceElement): void {
  if (element.dataset.sizes !== 'auto')
    return

  const width = getOffsetWidth(element)
  if (!width)
    return

  const next = `${width}px`
  if (element.sizes !== next)
    element.sizes = next
}

function swapDataAttribute(
  element: HTMLImageElement | HTMLSourceElement,
  attr: 'src' | 'srcset',
): void {
  const value = element.dataset[attr]
  if (!value)
    return

  element[attr] = value
  element.removeAttribute(`data-${attr}`)
}

function swapPictureSources(image: HTMLImageElement): void {
  const picture = image.parentElement
  if (picture?.tagName.toLowerCase() !== 'picture')
    return

  for (const source of picture.querySelectorAll<HTMLSourceElement>('source[data-srcset]')) {
    updateSizesAttribute(source)
    swapDataAttribute(source, 'srcset')
  }
}

function getOffsetWidth(element: HTMLElement | HTMLSourceElement): number | undefined {
  return element instanceof HTMLSourceElement
    ? element.parentElement?.getElementsByTagName('img')[0]?.offsetWidth
    : element.offsetWidth
}

function isDescendantOfPicture(
  element: HTMLElement,
): element is HTMLElement & { parentElement: HTMLPictureElement } {
  return element.parentElement?.tagName.toLowerCase() === 'picture'
}

function noop(): void {}
