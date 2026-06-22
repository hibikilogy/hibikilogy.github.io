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
        try {
          pending = Promise.resolve(load())
            .finally(() => {
              pending = null
            })
        }
        catch (error) {
          pending = Promise.reject(error)
            .finally(() => {
              pending = null
            })
        }
      }

      return pending
    },
  }
}
