export interface HeaderItem {
  readonly element: HTMLElement
  readonly title: string
  readonly link: string
  readonly level: number
  children?: HeaderItem[]
}

export interface OutlineOptions {
  readonly replaceHash: (hash: string | null) => void
}
