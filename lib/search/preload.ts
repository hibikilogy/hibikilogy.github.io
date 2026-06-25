export interface ResettablePreloadTask {
  current: () => Promise<void> | null
  trigger: () => Promise<void>
}

export function createResettablePreloadTask(
  load: () => Promise<void>,
): ResettablePreloadTask {
  let pending: Promise<void> | null = null

  return {
    current: () => pending,
    trigger: () => {
      if (!pending) {
        pending = Promise.resolve(load()).finally(() => {
          pending = null
        })
      }

      return pending
    },
  }
}
