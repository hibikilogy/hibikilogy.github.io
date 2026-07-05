/// <reference types="vite/client" />

import type { WaterFallTarget } from '../ui/water-fall.ts'

declare global {
  interface Window {
    // Application globals
    initWaterFall?: (container?: WaterFallTarget, child?: string) => void
    navigateToSearch?: (options?: { focusIntent?: string }) => void
    refreshWaterFalls?: () => Promise<void[]>
    gtag?: (...args: unknown[]) => void

    // Runtime-only config injected by templates/base.html
    __HIBIKILOGY_BASE_URL?: string
    __HIBIKILOGY_SEARCH_INDEX_URL?: string
    __HIBIKILOGY_SEARCH_WORKER_URL?: string
  }
}

export {}
