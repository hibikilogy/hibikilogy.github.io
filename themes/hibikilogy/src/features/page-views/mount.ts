import type { PageViewCounter, PageViewMountOptions } from './types.ts'

const countSelector = '[data-page-views-value]'

/**
 * 有缓存就先上屏（切页不出现空白），接口返回后再用真实值校正；
 * 页面已被替换时丢弃结果。
 */
export function mountPageViews(counter: PageViewCounter, options: PageViewMountOptions): void {
  const element = options.root.querySelector<HTMLElement>(countSelector)
  if (!element)
    return

  const cached = counter.peek(options.pathname)
  if (cached !== undefined)
    paint(element, cached, 'cached')

  void counter.load(options.pathname).then((count) => {
    if (count === null || !options.isActive())
      return
    paint(element, count, 'fresh')
  })
}

function paint(element: HTMLElement, count: number, state: 'cached' | 'fresh'): void {
  element.textContent = String(count)
  element.dataset.state = state
}
