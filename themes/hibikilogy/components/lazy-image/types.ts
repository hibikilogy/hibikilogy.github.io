export interface TriggerLoadOptions {
  onImageLoad?: (image: HTMLImageElement) => void
  onImageError?: (image: HTMLImageElement, error: Event) => void
}
