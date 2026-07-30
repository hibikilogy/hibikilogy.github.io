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
  // Keeps an in-flight preload of `url` for the navigation to reuse; drops
  // every other pending preload (queued entries never fire).
  releaseForNavigation: (url: string) => void
  // Whether the pending preload of `url` was user-intent driven (hover,
  // touch, focus or explicit call) rather than a background viewport scan.
  isPriorityPreload: (url: string) => boolean
}

export interface PreloadStrategy {
  // IntersectionObserver inputs for visible-link preloading.
  threshold: number
  rootMargin: string
  // How long a link must stay visible before it is preloaded.
  delay: number
  concurrency: number
}

export interface PagePreloaderOptions {
  strategy?: Partial<PreloadStrategy>
  // Used while `isFastNetwork` holds; merged over `strategy`.
  aggressiveStrategy?: Partial<PreloadStrategy>
  isFastNetwork?: () => boolean
}
