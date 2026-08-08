export function stopPageEnter(root: HTMLElement = document.documentElement): void {
  root.removeAttribute('data-page-enter')
}

export function startPageEnter(root: HTMLElement = document.documentElement): void {
  root.dataset.pageEnter = 'navigation'
}

/** 当前页的入场动画是否仍在播放。 */
export function isPageEnterRunning(): boolean {
  const { getAnimations } = document as Document & { getAnimations?: () => Animation[] }
  if (!getAnimations)
    return false
  // DOM 方法必须以 document 为 receiver 调用，否则真实浏览器抛 Illegal invocation。
  return getAnimations.call(document).some(
    animation => (animation as CSSAnimation).animationName === 'page-enter'
      && animation.playState !== 'finished'
      && animation.playState !== 'idle',
  )
}
