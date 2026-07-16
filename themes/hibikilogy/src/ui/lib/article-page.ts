import mediumZoom from 'medium-zoom'
import Heti from './heti'

interface MediumZoomController {
  close: () => Promise<unknown>
  detach: (...selectors: Array<string | NodeListOf<Element> | Element[] | Element>) => MediumZoomController
}

let articleZoom: MediumZoomController | null = null
let activeArticle: HTMLElement | null = null

export function initArticlePage(): void {
  const article = document.querySelector<HTMLElement>('.content-container > article')
  if (!article) {
    disposeArticlePage()
    return
  }

  activeArticle = article
  void renderArticleMath(article)
  bindArticleZoom(article)
  applyHetiSpacing(article)
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

function bindArticleZoom(article: HTMLElement): void {
  void articleZoom?.close?.().catch(() => {})
  articleZoom?.detach?.()
  articleZoom = mediumZoom(article.querySelectorAll(':where(img)')) as MediumZoomController
}

function applyHetiSpacing(article: HTMLElement): void {
  if (!document.querySelector('.outline-marker'))
    return

  if (activeArticle !== article || !document.contains(article))
    return

  const heti = new Heti('.content-container > article')
  heti.autoSpacing()
}
