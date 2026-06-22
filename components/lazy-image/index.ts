import type { LazyImageSource } from './types'
import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { cn } from '../utils'
import { DEFAULT_IMAGE_PLACEHOLDER, DEV_DEFAULT_THUMBHASH, REVEAL_ANIMATION_THRESHOLD_MS } from './constants'
import {
  autoSizes,
  createPlaceholderFromThumbHash,
  triggerLoad,
} from './LazyLoad'
import { attachToZoom, detachFromZoom } from './zoom'

@customElement('lazy-image')
export class LazyImage extends LitElement {
  static override readonly styles = css`
    @unocss-placeholder

    :host {
      display: block;
      width: 100%;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      color: inherit;
    }
  `

  @property()
  src = ''

  @property()
  srcset = ''

  @property()
  sizes = ''

  @property()
  alt = ''

  @property({ type: Number })
  width?: number

  @property({ type: Number })
  height?: number

  @property()
  decoding: 'async' | 'sync' | 'auto' = 'async'

  @property({ attribute: 'fetchpriority' })
  fetchPriority?: 'high' | 'low' | 'auto'

  @property({ attribute: 'crossorigin' })
  crossOrigin?: string

  @property({ attribute: 'referrerpolicy' })
  referrerPolicy?: string

  @property()
  loading: 'lazy' | 'eager' = 'lazy'

  @property({ type: Boolean })
  preload = false

  @property({ attribute: 'thumbhash' })
  thumbhash?: string

  @property({ attribute: 'placeholder-src' })
  placeholderSrc?: string

  @property({ attribute: 'error-placeholder-src' })
  errorPlaceholderSrc?: string

  @property({ type: Boolean })
  zoomable = false

  @property({ attribute: 'img-class' })
  imgClass = ''

  @property({ attribute: false })
  sources: LazyImageSource[] = []

  @state()
  private hasLoadError = false

  @state()
  private currentImageSrc?: string

  @state()
  private isContentVisible = false

  @state()
  private contentSrc?: string

  @state()
  private shouldAnimateReveal = true

  @state()
  private showPlaceholder = false

  private intersectionObserver?: IntersectionObserver
  private loadCleanup?: () => void
  private sizesCleanup?: () => void
  private placeholderHideTimeout?: number
  private loadStarted = false
  private loadStartedAt = 0
  private runtimeSetup = false
  private ensureScheduled = false
  private zoomAttached = false

  override disconnectedCallback(): void {
    this.detachZoom()
    this.teardownRuntime()
    super.disconnectedCallback()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    void this.updateComplete.then(() => {
      this.syncCurrentImageSrc()
      if (this.shouldLoadImmediately()) {
        this.ensureImageLoading()
        return
      }

      this.scheduleEnsureImageLoading()
    })
  }

  override firstUpdated(): void {
    this.syncCurrentImageSrc()
    if (this.shouldLoadImmediately()) {
      this.ensureImageLoading()
      return
    }

    this.scheduleEnsureImageLoading()
  }

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (this.hasLoadConfigChange(changed)) {
      this.detachZoom()
      this.hasLoadError = false
      this.loadStarted = false
      this.loadStartedAt = 0
      this.isContentVisible = false
      this.contentSrc = undefined
      this.shouldAnimateReveal = true
      this.runtimeSetup = false
      this.clearPlaceholderHideTimeout()
      this.syncCurrentImageSrc()
      return
    }

    if (this.hasPlaceholderConfigChange(changed)) {
      this.syncCurrentImageSrc()
    }

    if (changed.has('zoomable') && !this.zoomable)
      this.detachZoom()
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    if (this.hasLoadConfigChange(changed)) {
      this.teardownRuntime()
    }

    if (this.shouldLoadImmediately()) {
      this.ensureImageLoading()
      return
    }

    this.scheduleEnsureImageLoading()
  }

  override render() {
    if (!this.hasRenderableContent())
      return nothing

    return html`
      <div class="lazy-image__stack grid w-full grid-cols-1 grid-rows-1">
        ${this.renderPlaceholder()}
        ${this.normalizedSources.length > 0
          ? this.renderPictureContent()
          : this.renderStandaloneContent()}
      </div>
    `
  }

  private renderPlaceholder() {
    if (!this.currentImageSrc || !this.showPlaceholder)
      return nothing

    return html`
      <img
        class=${this.placeholderImageClass}
        part="placeholder img"
        alt=""
        aria-hidden="true"
        draggable="false"
        width=${ifDefined(this.width)}
        height=${ifDefined(this.height)}
        src=${this.currentImageSrc}
      />
    `
  }

  private renderPictureContent() {
    return html`
      <picture class="lazy-image__content col-start-1 row-start-1 block w-full">
        ${this.normalizedSources.map(source => this.renderSource(source))}
        ${this.renderContentImage()}
      </picture>
    `
  }

  private renderStandaloneContent() {
    return this.renderContentImage()
  }

  private renderSource(source: LazyImageSource) {
    const shouldDefer = !this.hasLoadError && !this.isContentVisible

    return html`
      <source
        media=${ifDefined(source.media)}
        type=${ifDefined(source.type)}
        width=${ifDefined(source.width)}
        height=${ifDefined(source.height)}
        sizes=${ifDefined(source.sizes && source.sizes !== 'auto' ? source.sizes : undefined)}
        data-sizes=${ifDefined(source.sizes === 'auto' ? 'auto' : undefined)}
        srcset=${ifDefined(this.isContentVisible && !this.hasLoadError ? source.srcSet : undefined)}
        data-srcset=${ifDefined(shouldDefer ? source.srcSet : undefined)}
      />
    `
  }

  private renderContentImage() {
    const shouldDefer = !this.hasLoadError && !this.isContentVisible

    return html`
      <img
        class=${this.contentImageClass}
        part="content img"
        alt=${this.alt}
        width=${ifDefined(this.width)}
        height=${ifDefined(this.height)}
        loading=${this.loading}
        decoding=${this.decoding}
        fetchpriority=${ifDefined(this.fetchPriority)}
        crossorigin=${ifDefined(this.crossOrigin)}
        referrerpolicy=${ifDefined(this.referrerPolicy)}
        src=${ifDefined(this.contentImageSrc)}
        data-src=${ifDefined(shouldDefer ? (this.src || undefined) : undefined)}
        data-srcset=${ifDefined(shouldDefer ? (this.srcset || undefined) : undefined)}
        sizes=${ifDefined(this.getResolvedSizes())}
        data-sizes=${ifDefined(this.sizes === 'auto' ? 'auto' : undefined)}
      />
    `
  }

  private setupImageLoading(): void {
    const image = this.getContentImageElement()
    if (!image || this.hasLoadError || !this.hasPendingAsset()) {
      this.debugLoadingState('setup-bail', image)
      return
    }

    if (this.runtimeSetup) {
      this.debugLoadingState('setup-skip', image)
      return
    }

    this.runtimeSetup = true
    this.sizesCleanup = autoSizes(image, { updateOnResize: true })
    this.debugLoadingState('setup-start', image)

    if (
      this.shouldLoadImmediately()
      || typeof IntersectionObserver === 'undefined'
      || this.isWithinLoadThreshold(image)
    ) {
      this.startLoad(image)
      return
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
        this.startLoad(image)
    }, { rootMargin: '200px 0px' })
    this.intersectionObserver.observe(image)
  }

  private ensureImageLoading(): void {
    if (this.loadStarted || this.hasLoadError || this.isContentVisible || !this.hasPendingAsset())
      return

    this.setupImageLoading()
  }

  private isWithinLoadThreshold(image: HTMLImageElement): boolean {
    if (typeof window === 'undefined')
      return false

    const rect = image.getBoundingClientRect()
    const rootMargin = 200
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0

    if (rect.width === 0 && rect.height === 0)
      return false

    return (
      rect.bottom >= -rootMargin
      && rect.right >= -rootMargin
      && rect.top <= viewportHeight + rootMargin
      && rect.left <= viewportWidth + rootMargin
    )
  }

  private scheduleEnsureImageLoading(): void {
    if (this.ensureScheduled)
      return

    this.ensureScheduled = true
    void this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        this.ensureScheduled = false
        this.ensureImageLoading()
      })
    })
  }

  private startLoad(image: HTMLImageElement): void {
    if (this.loadStarted)
      return

    this.loadStarted = true
    this.loadStartedAt = performance.now()
    this.debugLoadingState('start-load', image)
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = undefined
    this.loadCleanup = triggerLoad(image, {
      onImageLoad: (loadedImage) => {
        const loadElapsed = performance.now() - this.loadStartedAt
        this.shouldAnimateReveal = this.hasVisualPlaceholder()
          && loadElapsed >= REVEAL_ANIMATION_THRESHOLD_MS
        this.contentSrc = loadedImage.currentSrc || loadedImage.src || this.src || this.contentSrc
        this.isContentVisible = true
        this.schedulePlaceholderHide()
        this.debugLoadingState('image-load', loadedImage)
        if (this.zoomable)
          this.attachZoom(loadedImage)
        this.dispatchEvent(new CustomEvent('image-load', {
          bubbles: true,
          composed: true,
          detail: { image: loadedImage },
        }))
      },
      onImageError: (erroredImage, error) => {
        this.hasLoadError = true
        this.detachZoom()
        if (this.errorPlaceholderSrc) {
          this.currentImageSrc = this.errorPlaceholderSrc
        }
        this.isContentVisible = false
        this.shouldAnimateReveal = false
        this.debugLoadingState('image-error', erroredImage)

        this.dispatchEvent(new CustomEvent('image-error', {
          bubbles: true,
          composed: true,
          detail: { image: erroredImage, error },
        }))
      },
    })
  }

  private teardownRuntime(): void {
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = undefined
    this.loadCleanup?.()
    this.loadCleanup = undefined
    this.sizesCleanup?.()
    this.sizesCleanup = undefined
    this.clearPlaceholderHideTimeout()
    this.runtimeSetup = false
  }

  private shouldLoadImmediately(): boolean {
    return this.preload || this.loading === 'eager'
  }

  private hasPendingAsset(): boolean {
    return Boolean(this.src || this.srcset || this.normalizedSources.length > 0)
  }

  private hasRenderableContent(): boolean {
    return this.hasPendingAsset() || Boolean(this.getPlaceholderSrc() || this.errorPlaceholderSrc)
  }

  private hasVisualPlaceholder(): boolean {
    return Boolean(this.currentImageSrc)
  }

  private getContentImageElement(): HTMLImageElement | null {
    return this.renderRoot.querySelector<HTMLImageElement>('.lazy-image__content-img')
  }

  private async attachZoom(image: HTMLImageElement): Promise<void> {
    if (this.zoomAttached || !this.zoomable)
      return

    attachToZoom(image)
    this.zoomAttached = true
  }

  private detachZoom(): void {
    if (!this.zoomAttached)
      return

    const image = this.getContentImageElement()
    if (image)
      detachFromZoom(image)
    this.zoomAttached = false
  }

  private syncCurrentImageSrc(): void {
    this.currentImageSrc = this.hasLoadError && this.errorPlaceholderSrc
      ? this.errorPlaceholderSrc
      : this.getPlaceholderSrc()
    this.showPlaceholder = Boolean(this.currentImageSrc)
  }

  private schedulePlaceholderHide(): void {
    this.clearPlaceholderHideTimeout()

    if (!this.currentImageSrc || this.hasLoadError) {
      this.showPlaceholder = Boolean(this.currentImageSrc)
      return
    }

    if (!this.shouldAnimateReveal) {
      this.showPlaceholder = false
      return
    }

    this.placeholderHideTimeout = window.setTimeout(() => {
      this.placeholderHideTimeout = undefined
      this.showPlaceholder = false
    }, 220)
  }

  private clearPlaceholderHideTimeout(): void {
    if (this.placeholderHideTimeout === undefined)
      return

    window.clearTimeout(this.placeholderHideTimeout)
    this.placeholderHideTimeout = undefined
  }

  private getPlaceholderSrc(): string | undefined {
    const thumbhash = this.thumbhash || (this.isLocalDevelopmentRuntime() ? DEV_DEFAULT_THUMBHASH : undefined)
    return createPlaceholderFromThumbHash(thumbhash) || this.placeholderSrc
  }

  private getResolvedSizes(): string | undefined {
    return this.sizes && this.sizes !== 'auto' ? this.sizes : undefined
  }

  private get contentImageSrc(): string | undefined {
    if (this.isContentVisible)
      return this.contentSrc || this.src || undefined

    return !this.hasVisualPlaceholder()
      ? DEFAULT_IMAGE_PLACEHOLDER
      : undefined
  }

  private get placeholderImageClass(): string {
    return cn(
      'lazy-image__placeholder',
      'col-start-1 row-start-1 block h-auto w-full max-w-full select-none pointer-events-none',
      this.shouldAnimateReveal ? 'transition-opacity duration-200 ease-in-out' : 'transition-none',
      this.isContentVisible && !this.hasLoadError ? 'opacity-0' : 'opacity-100',
      this.imgClass,
    )
  }

  private get contentImageClass(): string {
    return cn(
      'lazy-image__content-img',
      'col-start-1 row-start-1 block h-auto w-full max-w-full',
      this.shouldAnimateReveal ? 'transition-opacity duration-200 ease-in-out' : 'transition-none',
      !this.hasVisualPlaceholder() || this.isContentVisible ? 'opacity-100' : 'opacity-0',
      this.imgClass,
    )
  }

  private get normalizedSources(): LazyImageSource[] {
    return Array.isArray(this.sources)
      ? this.sources.filter(source => Boolean(source?.srcSet))
      : []
  }

  private hasLoadConfigChange(changed: Map<PropertyKey, unknown>): boolean {
    for (const key of [
      'src',
      'srcset',
      'sizes',
      'loading',
      'preload',
      'sources',
      'crossOrigin',
      'referrerPolicy',
    ]) {
      if (changed.has(key))
        return true
    }

    return false
  }

  private hasPlaceholderConfigChange(changed: Map<PropertyKey, unknown>): boolean {
    for (const key of ['thumbhash', 'placeholderSrc', 'errorPlaceholderSrc']) {
      if (changed.has(key))
        return true
    }

    return false
  }

  private isLocalDevelopmentRuntime(): boolean {
    if (typeof window === 'undefined')
      return false

    const { hostname, protocol } = window.location
    return protocol === 'file:'
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
  }

  private debugLoadingState(stage: string, image: HTMLImageElement | null): void {
    if (!this.isLocalDevelopmentRuntime())
      return

    console.debug('[lazy-image]', stage, {
      src: this.src,
      srcset: this.srcset,
      loadStarted: this.loadStarted,
      hasLoadError: this.hasLoadError,
      isContentVisible: this.isContentVisible,
      currentImageSrc: this.currentImageSrc,
      contentSrc: this.contentSrc,
      imageFound: Boolean(image),
      imageSrc: image?.getAttribute('src'),
      imageDataSrc: image?.getAttribute('data-src'),
      imageDataSrcset: image?.getAttribute('data-srcset'),
      imageClass: image?.className,
    })
  }
}

export type { LazyImageSource }
