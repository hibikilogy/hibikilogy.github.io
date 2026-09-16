declare module 'katex/dist/contrib/auto-render.mjs' {
  interface AutoRenderDelimiter {
    left: string
    right: string
    display: boolean
  }

  interface AutoRenderOptions {
    delimiters: AutoRenderDelimiter[]
    throwOnError: boolean
  }

  export default function renderMathInElement(element: HTMLElement, options: AutoRenderOptions): void
}
