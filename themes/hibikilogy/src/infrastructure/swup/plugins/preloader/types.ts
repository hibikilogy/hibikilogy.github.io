import type { PageData } from 'swup'

declare module 'swup' {
  interface Swup {
    preload?: (url: string, options?: PreloadOptions) => Promise<PageData | void>
  }
}

export interface PreloadOptions {
  priority?: boolean
}

export interface PagePreloader {
  preload: (input: string | HTMLAnchorElement | SVGAElement, options?: PreloadOptions) => Promise<PageData | void>
  releaseForNavigation: (url: string) => void
  isPriorityPreload: (url: string) => boolean
}

export interface PreloadStrategy {
  threshold: number
  rootMargin: string
  delay: number
  concurrency: number
}

export interface PagePreloaderOptions {
  strategy?: Partial<PreloadStrategy>
  aggressiveStrategy?: Partial<PreloadStrategy>
  isFastNetwork?: () => boolean
}
