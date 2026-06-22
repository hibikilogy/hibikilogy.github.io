import renderMathInElement from 'katex/dist/contrib/auto-render.mjs'
import mediumZoom from 'medium-zoom'
import 'katex/dist/katex.min.css'

interface MediumZoomController {
  close: () => Promise<unknown>
  detach: (...selectors: Array<string | NodeListOf<Element> | Element[] | Element>) => MediumZoomController
}

interface HetiInstance {
  autoSpacing: () => void
}

type HetiConstructor = new (selector: string) => HetiInstance

let articleZoom: MediumZoomController | null = null
let activeArticle: HTMLElement | null = null
let hetiConstructorPromise: Promise<HetiConstructor | null> | null = null

export async function initArticlePage(): Promise<void> {
  const article = document.querySelector<HTMLElement>('.content-container > article')
  if (!article) {
    disposeArticlePage()
    return
  }

  activeArticle = article
  renderArticleMath(article)
  bindArticleZoom(article)
  await applyHetiSpacing(article)
}

export function disposeArticlePage(): void {
  void articleZoom?.close?.().catch(() => {})
  articleZoom?.detach?.()
  articleZoom = null
  activeArticle = null
}

function renderArticleMath(article: HTMLElement): void {
  if (activeArticle !== article || !document.contains(article))
    return

  renderMathInElement(article, {
    delimiters: [
      { left: '$', right: '$', display: true },
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

async function applyHetiSpacing(article: HTMLElement): Promise<void> {
  if (!document.querySelector('.outline-marker'))
    return

  const Heti = await loadHetiConstructor()
  if (!Heti || activeArticle !== article || !document.contains(article))
    return

  const heti = new Heti('.content-container > article')
  heti.autoSpacing()
}

async function loadHetiConstructor(): Promise<HetiConstructor | null> {
  if (window.Heti)
    return window.Heti

  if (!hetiConstructorPromise) {
    hetiConstructorPromise = loadScript('https://unpkg.com/heti/umd/heti-addon.min.js')
      .then(() => window.Heti || null)
      .catch(() => null)
  }

  return hetiConstructorPromise
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
  if (existing?.dataset.loaded === 'true')
    return Promise.resolve()

  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true })
    document.head.append(script)
  })
}

declare global {
  interface Window {
    Heti?: HetiConstructor
  }
}
