import type { ZoomBinding } from 'components/lazy-image/zoom.ts'
import { onScopeDispose } from '@vue/reactivity'
import { createZoomBinding } from 'components/lazy-image/zoom.ts'
import { pageDom } from 'shared/selectors.ts'
import { outlineDom } from '../outline/index.ts'

/**
 * Sets up the article page enhancements (KaTeX, image zoom, Heti spacing)
 * inside the page scope. Async tasks guard against running after the scope
 * is disposed — the page was already swapped out.
 */
export function setupArticlePage(): void {
  const article = document.querySelector<HTMLElement>(pageDom.article)
  if (!article)
    return

  let disposed = false
  const zoom = createZoomBinding()
  onScopeDispose(() => {
    disposed = true
    zoom.close()
    zoom.detachAll()
  })

  void renderArticleMath(article, () => disposed).catch(() => {})
  bindArticleZoom(article, zoom)
  void applyHetiSpacing(article, () => disposed).catch(() => {})
}

async function renderArticleMath(article: HTMLElement, isDisposed: () => boolean): Promise<void> {
  if (!article.hasAttribute('data-katex'))
    return

  const { default: renderMathInElement } = await import('katex/dist/contrib/auto-render.mjs')
  if (isDisposed() || !document.contains(article))
    return

  renderMathInElement(article, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true },
    ],
    throwOnError: false,
  })
}

function bindArticleZoom(article: HTMLElement, zoom: ZoomBinding): void {
  const images = article.querySelectorAll<HTMLImageElement>(':where(img)')
  if (!images.length)
    return

  zoom.close()
  zoom.detachAll()
  zoom.attachAll(images)
}

async function applyHetiSpacing(article: HTMLElement, isDisposed: () => boolean): Promise<void> {
  if (!document.querySelector(outlineDom.marker))
    return

  const { default: Heti } = await import('./heti')
  if (isDisposed() || !document.contains(article))
    return

  const heti = new Heti(pageDom.article)
  heti.autoSpacing()
}
