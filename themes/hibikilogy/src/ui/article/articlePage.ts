import { pageDom } from '../../shared/dom.ts'
import { outlineDom } from '../outline/index.ts'

interface MediumZoomController {
  close: () => Promise<unknown>
  detach: (...selectors: Array<string | NodeListOf<Element> | Element[] | Element>) => MediumZoomController
}

let articleZoom: MediumZoomController | null = null
let activeArticle: HTMLElement | null = null

export function initArticlePage(): void {
  const article = document.querySelector<HTMLElement>(pageDom.article)
  if (!article) {
    disposeArticlePage()
    return
  }

  activeArticle = article
  void renderArticleMath(article).catch(() => {})
  void bindArticleZoom(article).catch(() => {})
  void applyHetiSpacing(article).catch(() => {})
}

export function disposeArticlePage(): void {
  void articleZoom?.close?.().catch(() => {})
  articleZoom?.detach?.()
  articleZoom = null
  activeArticle = null
}

async function renderArticleMath(article: HTMLElement): Promise<void> {
  if (!article.hasAttribute('data-katex'))
    return

  const { default: renderMathInElement } = await import('katex/dist/contrib/auto-render.mjs')
  if (activeArticle !== article || !document.contains(article))
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

async function bindArticleZoom(article: HTMLElement): Promise<void> {
  const images = article.querySelectorAll(':where(img)')
  if (!images.length)
    return

  const { default: mediumZoom } = await import('medium-zoom')
  if (activeArticle !== article || !document.contains(article))
    return

  void articleZoom?.close?.().catch(() => {})
  articleZoom?.detach?.()
  articleZoom = mediumZoom(images) as MediumZoomController
}

async function applyHetiSpacing(article: HTMLElement): Promise<void> {
  if (!document.querySelector(outlineDom.marker))
    return

  const { default: Heti } = await import('./heti')
  if (activeArticle !== article || !document.contains(article))
    return

  const heti = new Heti(pageDom.article)
  heti.autoSpacing()
}
