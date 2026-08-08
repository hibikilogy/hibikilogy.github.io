import { isPageEnterRunning } from './pageEnter.ts'
import { shouldDisableNativeTransition } from './searchBoxTransition.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

/**
 * 是否保留原生 View Transition：
 * - 搜索过渡保留（桌面 morph，移动端由幕布动画接管）；
 * - 被中断的普通访问瞬间交换，避免旧页经交叉淡化叠进新页。
 */
export function shouldKeepNativeTransition(
  fromUrl: string,
  toUrl: string,
  interrupted: boolean,
): boolean {
  if (shouldDisableNativeTransition(fromUrl, toUrl))
    return false
  if (getSearchTransitionScope(fromUrl, toUrl) !== null)
    return true
  return !interrupted && !isPageEnterRunning()
}
