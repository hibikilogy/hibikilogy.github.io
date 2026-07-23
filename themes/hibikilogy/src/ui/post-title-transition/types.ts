export interface PostTitleTransitionPreparation {
  readonly waitForTarget: boolean
  readonly ready: Promise<boolean>
  readonly cancel: () => void
}
