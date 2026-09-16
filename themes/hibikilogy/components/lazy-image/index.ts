import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { supportsIntersectionObserver } from 'shared/capabilities.ts'
import { cn } from '../utils'
import {
  DEFAULT_IMAGE_PLACEHOLDER,
  DEV_DEFAULT_THUMBHASH,
  PLACEHOLDER_FADE_MS,
  REVEAL_ANIMATION_THRESHOLD_MS,
} from './constants'
import { createPlaceholderFromThumbHash, triggerLoad } from './lazyLoad'
import { getPreloadRootMargin } from './loadPolicy'
import { scheduleAfterUpdate } from './loadScheduler'
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
  alt = ''

  @property({ type: Number })
  width?: number

  @property({ type: Number })
  height?: number

  @property()
  decoding: 'async' | 'sync' | 'auto' = 'async'

  @property({ attribute: 'fetchpriority' })
  fetchPriority?: 'high' | 'low' | 'auto'

  @property()
  loading: 'lazy' | 'eager' = 'lazy'

  @property({ attribute: 'thumbhash' })
  thumbhash?: string

  @property({ type: Boolean })
  zoomable = false

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
  private cancelScheduledLoad?: () => void
  private placeholderHideTimeout?: number
  private loadStarted = false
  private loadStartedAt = 0
  private runtimeSetup = false
  private zoomAttached = false

  override disconnectedCallback(): void {
    this.cancelScheduledLoad?.()
    this.cancelScheduledLoad = undefined
    this.detachZoom()
    this.teardownRuntime()
    super.disconnectedCallback()
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

    if (changed.has('thumbhash')) {
      this.syncCurrentImageSrc()
    }

    if (changed.has('zoomable')) {
      if (!this.zoomable) {
        this.detachZoom()
        return
      }

      if (this.isContentVisible) {
        const image = this.getContentImageElement()
        if (image)
          this.attachZoom(image)
      }
    }
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    if (this.hasLoadConfigChange(changed)) {
      this.teardownRuntime()
    }

    if (this.shouldLoadImmediately) {
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
        ${this.renderContentImage()}
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
        src=${ifDefined(this.contentImageSrc)}
        data-src=${ifDefined(shouldDefer ? (this.src || undefined) : undefined)}
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
    this.debugLoadingState('setup-start', image)

    if (this.shouldLoadImmediately || !supportsIntersectionObserver()) {
      this.startLoad(image)
      return
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
        this.startLoad(image)
    }, { rootMargin: getPreloadRootMargin() })
    this.intersectionObserver.observe(image)
  }

  private ensureImageLoading(): void {
    if (this.loadStarted || this.hasLoadError || this.isContentVisible || !this.hasPendingAsset())
      return

    this.setupImageLoading()
  }

  private scheduleEnsureImageLoading(): void {
    this.cancelScheduledLoad ??= scheduleAfterUpdate(
      this.updateComplete,
      () => this.isConnected,
      () => {
        this.cancelScheduledLoad = undefined
        this.ensureImageLoading()
      },
    )
  }

  private startLoad(image: HTMLImageElement): void {
    if (this.loadStarted)
      return

    this.loadStarted = true
    this.loadStartedAt = performance.now()
    if (image.loading === 'lazy')
      image.loading = 'eager'
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
    this.cancelScheduledLoad?.()
    this.cancelScheduledLoad = undefined
    this.intersectionObserver?.disconnect()
    this.intersectionObserver = undefined
    this.loadCleanup?.()
    this.loadCleanup = undefined
    this.clearPlaceholderHideTimeout()
    this.runtimeSetup = false
  }

  private get shouldLoadImmediately(): boolean {
    return this.loading === 'eager'
  }

  private hasPendingAsset(): boolean {
    return Boolean(this.src)
  }

  private hasRenderableContent(): boolean {
    return this.hasPendingAsset() || Boolean(this.getPlaceholderSrc())
  }

  private hasVisualPlaceholder(): boolean {
    return Boolean(this.currentImageSrc)
  }

  private getContentImageElement(): HTMLImageElement | null {
    return this.renderRoot.querySelector<HTMLImageElement>('.lazy-image__content-img')
  }

  private attachZoom(image: HTMLImageElement): void {
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
    this.currentImageSrc = this.getPlaceholderSrc()
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
    }, PLACEHOLDER_FADE_MS)
  }

  private clearPlaceholderHideTimeout(): void {
    if (this.placeholderHideTimeout === undefined)
      return

    window.clearTimeout(this.placeholderHideTimeout)
    this.placeholderHideTimeout = undefined
  }

  private getPlaceholderSrc(): string | undefined {
    const thumbhash = this.thumbhash || (import.meta.env.DEV ? DEV_DEFAULT_THUMBHASH : undefined)
    return createPlaceholderFromThumbHash(thumbhash)
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
    )
  }

  private get contentImageClass(): string {
    return cn(
      'lazy-image__content-img',
      'col-start-1 row-start-1 block h-auto w-full max-w-full',
      this.shouldAnimateReveal ? 'transition-opacity duration-200 ease-in-out' : 'transition-none',
      !this.hasVisualPlaceholder() || this.isContentVisible ? 'opacity-100' : 'opacity-0',
    )
  }

  private hasLoadConfigChange(changed: Map<PropertyKey, unknown>): boolean {
    return changed.has('src') || changed.has('loading')
  }

  private debugLoadingState(stage: string, image: HTMLImageElement | null): void {
    if (!import.meta.env.DEV)
      return

    // eslint-disable-next-line no-console
    console.debug('[lazy-image]', stage, {
      src: this.src,
      loadStarted: this.loadStarted,
      hasLoadError: this.hasLoadError,
      isContentVisible: this.isContentVisible,
      currentImageSrc: this.currentImageSrc,
      contentSrc: this.contentSrc,
      imageFound: Boolean(image),
      imageSrc: image?.getAttribute('src'),
      imageDataSrc: image?.getAttribute('data-src'),
      imageClass: image?.className,
    })
  }
}
