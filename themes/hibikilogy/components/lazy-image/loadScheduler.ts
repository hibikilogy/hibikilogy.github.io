export class FrameLoadScheduler {
  private frameHandle?: number
  private scheduleToken = 0
  private scheduled = false

  schedule(
    updateComplete: Promise<unknown>,
    isActive: () => boolean,
    callback: () => void,
  ): void {
    if (this.scheduled)
      return

    this.scheduled = true
    const token = ++this.scheduleToken

    void updateComplete.then(() => {
      if (!this.isCurrent(token) || !isActive())
        return

      this.frameHandle = window.requestAnimationFrame(() => {
        this.frameHandle = undefined
        if (!this.isCurrent(token) || !isActive()) {
          this.scheduled = false
          return
        }

        this.scheduled = false
        callback()
      })
    })
  }

  cancel(): void {
    this.scheduleToken += 1
    this.scheduled = false

    if (this.frameHandle === undefined)
      return

    window.cancelAnimationFrame(this.frameHandle)
    this.frameHandle = undefined
  }

  private isCurrent(token: number): boolean {
    return this.scheduled && token === this.scheduleToken
  }
}
