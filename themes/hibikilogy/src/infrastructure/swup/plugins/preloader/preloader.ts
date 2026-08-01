import type { DelegateEventUnsubscribe, HookDefaultHandler, PageData } from 'swup'
import type {
  PagePreloader,
  PagePreloaderOptions,
  PreloadOptions,
  PreloadStrategy,
} from './types.ts'
import Plugin from '@swup/plugin'
import { deviceSupportsHover, supportsIdleCallback } from 'shared/capabilities.ts'
import { getCurrentUrl, Location } from 'swup'

const BASE_STRATEGY: PreloadStrategy = {
  threshold: 0.2,
  rootMargin: '0px',
  delay: 300,
  concurrency: 5,
}

const AGGRESSIVE_STRATEGY: PreloadStrategy = {
  threshold: 0,
  rootMargin: '300px',
  delay: 0,
  concurrency: 10,
}

type AnchorElement = HTMLAnchorElement | SVGAElement

interface PreloadEntry {
  state: 'queued' | 'fetching'
  // User-intent driven (hover/touch/focus); maps to fetch priority.
  priority: boolean
  promise: Promise<PageData>
  resolve: (page: PageData) => void
  reject: (error: unknown) => void
}

function isAnchorElement(element: unknown): element is AnchorElement {
  if (!element)
    return false

  return element instanceof HTMLAnchorElement
    || (typeof SVGAElement !== 'undefined' && element instanceof SVGAElement)
}

function whenIdle(callback: () => void): () => void {
  if (supportsIdleCallback()) {
    const id = window.requestIdleCallback(callback)
    return () => window.cancelIdleCallback(id)
  }

  const id = setTimeout(callback, 1)
  return () => clearTimeout(id)
}

function afterPageReady(callback: () => void): () => void {
  let cancelIdle: (() => void) | null = null
  const start = (): void => {
    cancelIdle = whenIdle(callback)
  }

  if (document.readyState === 'complete') {
    start()
    return () => cancelIdle?.()
  }

  window.addEventListener('load', start, { once: true })
  return () => {
    window.removeEventListener('load', start)
    cancelIdle?.()
  }
}

// Replacement for @swup/preload-plugin, keyed by normalized URL so
// navigations dedupe against in-flight preloads. Two tiers: conservative
// base, aggressive on fast networks.
export default class SwupPagePreloadPlugin extends Plugin implements PagePreloader {
  override name = 'SwupPagePreloadPlugin'
  override requires = { swup: '>=4.5' }

  private readonly baseStrategy: PreloadStrategy
  private readonly aggressiveStrategy: PreloadStrategy
  private readonly isFastNetwork: () => boolean

  private readonly entries = new Map<string, PreloadEntry>()
  private readonly queue: string[] = []
  private readonly priorityQueue: string[] = []
  private running = 0

  private readonly visibleTimers = new Map<Element, ReturnType<typeof setTimeout>>()
  private observed = new WeakSet<Element>()
  private observer: IntersectionObserver | null = null
  private observerRootMargin: string | null = null
  private observerThreshold: number | null = null

  private delegates: DelegateEventUnsubscribe[] = []
  private cancelBackgroundWork: () => void = () => {}

  constructor(options: PagePreloaderOptions = {}) {
    super()
    this.baseStrategy = { ...BASE_STRATEGY, ...options.strategy }
    this.aggressiveStrategy = { ...AGGRESSIVE_STRATEGY, ...options.aggressiveStrategy }
    this.isFastNetwork = options.isFastNetwork ?? (() => false)
    this.preload = this.preload.bind(this)
  }

  override mount(): void {
    const { swup } = this

    swup.preload = this.preload

    this.replace('page:load', this.onPageLoad)
    this.on('page:view', () => {
      this.clearVisibleTimers()
      this.cancelBackgroundWork()
      // Drop the previous page's elements: the observer would otherwise hold
      // strong references to detached DOM across navigations.
      this.observer?.disconnect()
      this.observed = new WeakSet()
      // Let the new page's own assets start first.
      this.cancelBackgroundWork = afterPageReady(() => this.scanVisibleLinks())
    })

    const selector = swup.options.linkSelector
    this.delegates = [
      swup.delegateEvent(selector, 'mouseenter', (event) => {
        if (!deviceSupportsHover() || event.target !== event.delegateTarget)
          return
        if (isAnchorElement(event.delegateTarget))
          void this.preload(event.delegateTarget, { priority: true })
      }, { passive: true, capture: true }),
      swup.delegateEvent(selector, 'touchstart', (event) => {
        if (deviceSupportsHover())
          return
        if (isAnchorElement(event.delegateTarget))
          void this.preload(event.delegateTarget, { priority: true })
      }, { passive: true, capture: true }),
      swup.delegateEvent(selector, 'focusin', (event) => {
        if (isAnchorElement(event.delegateTarget))
          void this.preload(event.delegateTarget, { priority: true })
      }, { passive: true, capture: true }),
    ]

    // Wait for page resources + idle, then cache the current page for
    // instant back-button navigation.
    this.cancelBackgroundWork = afterPageReady(() => {
      void this.preload(getCurrentUrl())
      this.scanVisibleLinks()
    })
  }

  override unmount(): void {
    if (this.swup.preload === this.preload)
      this.swup.preload = undefined

    this.delegates.forEach(delegate => delegate.destroy())
    this.delegates = []
    this.observer?.disconnect()
    this.clearVisibleTimers()
    this.cancelBackgroundWork()
  }

  private strategy(): PreloadStrategy {
    return this.isFastNetwork() ? this.aggressiveStrategy : this.baseStrategy
  }

  private pump(): void {
    while (this.running < this.strategy().concurrency) {
      const url = this.priorityQueue.shift() ?? this.queue.shift()
      if (url === undefined)
        return

      const entry = this.entries.get(url)
      if (!entry || entry.state !== 'queued')
        continue

      this.running++
      entry.state = 'fetching'
      void this.settle(url, entry)
    }
  }

  private async settle(url: string, entry: PreloadEntry): Promise<void> {
    try {
      entry.resolve(await this.swup.fetchPage(url))
    }
    catch (error) {
      entry.reject(error)
    }
    finally {
      this.running--
      this.entries.delete(url)
      this.pump()
    }
  }

  private eligible(url: string, href: string, el?: AnchorElement): boolean {
    const { swup } = this
    if (swup.cache.has(url) || this.entries.has(url))
      return false
    // In-flight visits take precedence over speculation (the initial visit
    // has an empty target and never blocks).
    if (!swup.visit.done && swup.visit.to.url !== '')
      return false
    if (swup.shouldIgnoreVisit(href, { el }))
      return false
    // Links only: preloading the current page is pointless, while the string
    // form is how the entry page gets cached.
    if (el && swup.resolveUrl(url) === swup.resolveUrl(getCurrentUrl()))
      return false

    return true
  }

  preload(input: string | AnchorElement, { priority = false }: PreloadOptions = {}): Promise<PageData | void> {
    const { swup } = this
    const el = isAnchorElement(input) ? input : undefined
    const { url, href } = el ? Location.fromElement(el) : Location.fromUrl(input as string)
    if (!url)
      return Promise.resolve()

    const existing = this.entries.get(url)
    if (existing) {
      if (priority) {
        existing.priority = true
        if (existing.state === 'queued') {
          const index = this.queue.indexOf(url)
          if (index >= 0) {
            this.queue.splice(index, 1)
            this.priorityQueue.push(url)
            this.pump()
          }
        }
      }
      return existing.promise
    }

    if (swup.cache.has(url))
      return Promise.resolve(swup.cache.get(url))
    if (!this.eligible(url, href, el))
      return Promise.resolve()

    const entry: Partial<PreloadEntry> = { state: 'queued', priority }
    const promise = new Promise<PageData>((resolve, reject) => {
      entry.resolve = resolve
      entry.reject = reject
    })
    entry.promise = promise
    this.entries.set(url, entry as PreloadEntry)
    // Prevent unhandled rejections (navigations reuse the stored promise).
    promise.catch(() => {})

    ;(priority ? this.priorityQueue : this.queue).push(url)
    this.pump()
    return promise
  }

  isPriorityPreload(url: string): boolean {
    return this.entries.get(url)?.priority ?? false
  }

  releaseForNavigation(url: string): void {
    for (const [entryUrl, entry] of this.entries) {
      if (entryUrl === url && entry.state === 'fetching')
        continue

      // Removed entries are skipped by pump(); in-flight fetches are aborted upstream.
      this.entries.delete(entryUrl)
    }
  }

  private onPageLoad: HookDefaultHandler<'page:load'> = (visit, args, defaultHandler) => {
    const entry = this.entries.get(visit.to.url)
    if (entry)
      return entry.promise

    return defaultHandler!(visit, args)
  }

  // Rebuilt when the strategy tier changes.
  private getObserver(): IntersectionObserver {
    const { threshold, rootMargin } = this.strategy()
    if (this.observer && this.observerThreshold === threshold && this.observerRootMargin === rootMargin)
      return this.observer

    this.observer?.disconnect()
    this.clearVisibleTimers()
    this.observed = new WeakSet()
    this.observerThreshold = threshold
    this.observerRootMargin = rootMargin
    this.observer = new IntersectionObserver((observerEntries) => {
      for (const observerEntry of observerEntries) {
        const el = observerEntry.target
        if (observerEntry.isIntersecting) {
          if (!this.visibleTimers.has(el)) {
            this.visibleTimers.set(el, setTimeout(() => {
              this.visibleTimers.delete(el)
              this.observer?.unobserve(el)
              if (isAnchorElement(el))
                void this.preload(el)
            }, this.strategy().delay))
          }
        }
        else {
          clearTimeout(this.visibleTimers.get(el))
          this.visibleTimers.delete(el)
        }
      }
    }, { threshold, rootMargin })
    return this.observer
  }

  private clearVisibleTimers(): void {
    this.visibleTimers.forEach(timer => clearTimeout(timer))
    this.visibleTimers.clear()
  }

  private scanVisibleLinks(): void {
    const activeObserver = this.getObserver()
    document.querySelectorAll(this.swup.options.linkSelector).forEach((el) => {
      if (this.observed.has(el) || !isAnchorElement(el))
        return

      const { url, href } = Location.fromElement(el)
      if (!url || !this.eligible(url, href, el))
        return

      this.observed.add(el)
      activeObserver.observe(el)
    })
  }
}
