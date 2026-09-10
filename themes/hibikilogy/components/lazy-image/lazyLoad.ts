import type { TriggerLoadOptions } from './types'
import { createPngDataUri as createPngDataUriFromThumbHash } from './thumbhash'

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

  const dataSrc = image.dataset.src
  if (!dataSrc)
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

  image.src = dataSrc
  image.removeAttribute('data-src')

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
