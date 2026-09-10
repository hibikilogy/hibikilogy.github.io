declare module 'fontkit' {
  interface Font {
    characterSet: number[]
    numGlyphs: number
  }

  export function openSync(path: string): Font
}
