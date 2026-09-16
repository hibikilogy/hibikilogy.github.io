import { isPageEnterRunning } from './pageEnter.ts'
import { shouldDisableNativeTransition } from './searchBoxTransition.ts'
import { getSearchTransitionScope } from './searchTransition.ts'

/**
 * 是否保留原生 View Transition：
 * - 进入搜索页时移动端由幕布接管；离开搜索页保留真实旧页面快照；
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
