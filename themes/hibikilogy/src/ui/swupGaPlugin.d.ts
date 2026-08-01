declare module '@swup/ga-plugin' {
  import type Swup from 'swup'

  export interface SwupGaPluginOptions {
    gaMeasurementId?: string
  }
  export default class SwupGaPlugin {
    constructor(options?: SwupGaPluginOptions)
    mount(swup: Swup): void
    unmount(): void
  }
}
