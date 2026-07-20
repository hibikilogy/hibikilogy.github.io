import { enableAutoAnimate, shouldSkipMotion, waitForAnimationFrame } from '../shared/animation.ts'

const activeTransitions = new WeakMap<Element, object>()

export async function replaceChildrenWithSlideVisibleOnceBottom(
  element: Element | null,
  children: Node[],
): Promise<boolean> {
  if (!element)
    return false

  enableAutoAnimate(element)
  const nextChildren = Array.isArray(children) ? children : []
  const token = {}
  activeTransitions.set(element, token)

  if (shouldSkipMotion()) {
    element.replaceChildren(...nextChildren)
    return activeTransitions.get(element) === token
  }

  if (element.children.length > 0) {
    await waitForAnimationFrame()
    if (activeTransitions.get(element) !== token)
      return false
  }

  element.replaceChildren(...nextChildren)
  return activeTransitions.get(element) === token
}
