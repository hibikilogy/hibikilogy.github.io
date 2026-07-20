/**
 * Check whether an element is rendered and intersects the current viewport.
 *
 * `checkVisibility` covers CSS/rendering state, while IntersectionObserver
 * covers viewport intersection without duplicating browser geometry rules.
 */
export async function isElementVisibleInViewport(
  element: Element,
  signal?: AbortSignal,
): Promise<boolean> {
  if (
    signal?.aborted
    || !element.isConnected
    || !element.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    })
  ) {
    return false
  }

  return new Promise((resolve) => {
    let settled = false
    let observer: IntersectionObserver | undefined
    const settle = (visible: boolean): void => {
      if (settled)
        return

      settled = true
      observer?.disconnect()
      resolve(visible)
    }
    const handleAbort = (): void => settle(false)
    observer = new IntersectionObserver(([entry]) => {
      settle(Boolean(
        entry?.isIntersecting
        && entry.intersectionRect.width > 0
        && entry.intersectionRect.height > 0,
      ))
    })
    signal?.addEventListener('abort', handleAbort, { once: true })
    observer.observe(element)

    if (signal?.aborted)
      handleAbort()
  })
}
