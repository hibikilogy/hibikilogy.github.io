export interface TriggerLoadOptions {
  onImageLoad?: (image: HTMLImageElement) => void
  onImageError?: (image: HTMLImageElement, error: Event) => void
}

export interface AutoSizesOptions {
  updateOnResize?: boolean
}

export interface LazyImageSource {
  srcSet: string
  media?: string
  type?: string
  sizes?: string
  width?: number
  height?: number
}
