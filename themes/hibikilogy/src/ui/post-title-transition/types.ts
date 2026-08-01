export interface PostTitleTransitionPreparation {
  readonly waitForTarget: boolean
  readonly ready: Promise<boolean>
  readonly cancel: () => void
}

export interface ResolvePostTitleTransitionTargetOptions {
  /**
   * Skip the hero-title scatter exit when the target page has no matching
   * title, e.g. when navigating to the search page. The rendered glyph
   * overlay is torn down so the title leaves with the plain page transition.
   */
  readonly suppressScatter?: boolean
}
