import type { ScrollModel } from './types.ts'
import { computed, onScopeDispose, reactive, readonly, ref } from '@vue/reactivity'
import { useEventListener } from 'shared/useEventListener.ts'

type ScrollTarget = Window | Document | HTMLElement

interface UseScrollOptions {
  directionTolerance?: number
}

function readPosition(target: ScrollTarget): { x: number, y: number } {
  if (target === window) {
    return {
      x: Math.max(window.scrollX || document.documentElement.scrollLeft, 0),
      y: Math.max(window.scrollY || document.documentElement.scrollTop, 0),
    }
  }

  const element = target instanceof Document
    ? target.documentElement
    : target as HTMLElement
  return {
    x: Math.max(element.scrollLeft, 0),
    y: Math.max(element.scrollTop, 0),
  }
}

export function useScroll(
  target: ScrollTarget = window,
  options: UseScrollOptions = {},
): ScrollModel {
  const { directionTolerance = 0 } = options
  const initial = readPosition(target)
  const x = ref(initial.x)
  const y = ref(initial.y)
  const atTop = computed(() => y.value === 0)
  const directions = reactive({
    left: false,
    right: false,
    top: false,
    bottom: false,
  })
  let scrollFrame = 0
  let directionX = initial.x
  let directionY = initial.y

  const measure = (): void => {
    const next = readPosition(target)
    const deltaX = next.x - directionX
    const deltaY = next.y - directionY

    if (Math.abs(deltaX) >= directionTolerance) {
      directions.left = deltaX < 0
      directions.right = deltaX > 0
      directionX = next.x
    }
    if (Math.abs(deltaY) >= directionTolerance) {
      directions.top = deltaY < 0
      directions.bottom = deltaY > 0
      directionY = next.y
    }

    x.value = next.x
    y.value = next.y
  }

  useEventListener(target, 'scroll', () => {
    if (scrollFrame)
      return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0
      measure()
    })
  }, { passive: true })

  onScopeDispose(() => cancelAnimationFrame(scrollFrame))

  return {
    x: readonly(x),
    y: readonly(y),
    atTop,
    directions: readonly(directions),
    measure,
  }
}
