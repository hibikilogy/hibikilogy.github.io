declare module 'virtual:hibikilogy-config' {
  type HibikilogyScalar = string | number | boolean

  export const HIBIKILOGY_CONFIG: {
    searchPageSize: number
    analyticsGoogle: string
    pageViewsEndpoint: string
    productionBaseUrl: string
    [key: string]: HibikilogyScalar
  }

  export const HIBIKILOGY_TRANSLATIONS: Record<string, string>
}
