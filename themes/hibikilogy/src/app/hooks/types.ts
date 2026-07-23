import type { ComputedRef, Ref, ShallowRef } from '@vue/reactivity'

export interface RouteLocation {
  readonly href: string
  readonly pathname: string
  readonly search: string
  readonly hash: string
}

export type NavigationKind = 'initial' | 'navigate' | 'popstate' | 'replace'

export interface RouteModel {
  readonly current: Readonly<ShallowRef<RouteLocation>>
  readonly isNavigating: Readonly<Ref<boolean>>
  readonly isSearchPage: Readonly<ComputedRef<boolean>>
  readonly navigationKind: Readonly<Ref<NavigationKind>>
  navigate: (url: string) => void
  replace: (url: string) => void
  back: (fallback?: string) => void
}

export interface LayoutModel {
  readonly navbarOpen: Readonly<Ref<boolean>>
  readonly atTop: Readonly<Ref<boolean>>
  toggleNavbar: () => void
  closeNavbar: () => void
}

export type PageKind = 'search' | 'article' | 'journal' | 'default'

export interface PageData {
  readonly kind: PageKind
}
