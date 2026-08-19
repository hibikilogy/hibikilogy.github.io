import type { ScrollModel } from './types.ts'
import { computed, onScopeDispose, reactive, readonly, ref } from '@vue/reactivity'
import { useEventListener } from 'shared/useEventListener.ts'

interface UseScrollOptions {
  directionTolerance?: number
}

function readScrollY(): number {
  return Math.max(window.scrollY || document.documentElement.scrollTop, 0)
}

export function useScroll(options: UseScrollOptions = {}): ScrollModel {
  const { directionTolerance = 0 } = options
  const y = ref(readScrollY())
  const atTop = computed(() => y.value === 0)
  const directions = reactive({ down: false })
  let scrollFrame = 0
  let directionY = y.value

  const measure = (): void => {
    const nextY = readScrollY()
    const deltaY = nextY - directionY

    if (Math.abs(deltaY) >= directionTolerance) {
      directions.down = deltaY > 0
      directionY = nextY
    }

    y.value = nextY
  }

  useEventListener(window, 'scroll', () => {
    if (scrollFrame)
      return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      measure()
    })
  }, { passive: true })

  onScopeDispose(() => cancelAnimationFrame(scrollFrame))

  return {
    y: readonly(y),
    atTop,
    directions: readonly(directions),
  }
}
