export function scheduleAfterUpdate(
  updateComplete: Promise<unknown>,
  isActive: () => boolean,
  callback: () => void,
): () => void {
  let cancelled = false
  let frameHandle: number | undefined

  void updateComplete.then(() => {
    if (cancelled || !isActive())
      return

    frameHandle = window.requestAnimationFrame(() => {
      if (cancelled || !isActive())
        return

      callback()
    })
  })

  return () => {
    cancelled = true
    if (frameHandle !== undefined)
      window.cancelAnimationFrame(frameHandle)
  }
}
