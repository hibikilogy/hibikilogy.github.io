export interface SingleFlight<T> {
  run: () => Promise<T>
  peek: () => Promise<T> | null
  reset: () => void
}

/** Deduplicates concurrent async work; a rejected promise is discarded so the next `run` retries. */
export function createSingleFlight<T>(factory: () => Promise<T>): SingleFlight<T> {
  let pending: Promise<T> | null = null

  function run(): Promise<T> {
    if (!pending) {
      const promise = factory()
      pending = promise
      void promise.catch(() => {
        if (pending === promise)
          pending = null
      })
    }
    return pending
  }

  return {
    run,
    peek: () => pending,
    reset: () => {
      pending = null
    },
  }
}
