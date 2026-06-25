import Finder from 'heti-findandreplacedomtext'

// ── Finder type ──────────────────────────────────────────────────

interface FinderPortion {
  text: string
}

interface FinderOptions {
  find: RegExp
  replace: (portion: FinderPortion) => HTMLElement
  forceContext?: (el: HTMLElement) => boolean
  filterElements?: (el: HTMLElement) => boolean
  offset?: number
}

interface FinderStatic {
  (element: Element, options: FinderOptions): void
  NON_PROSE_ELEMENTS: Record<string, number>
  NON_CONTIGUOUS_PROSE_ELEMENTS: Record<string, number>
}

const findAndReplace = Finder as unknown as FinderStatic

// ── Element exclusion maps ──────────────────────────────────────

const hasOwn = {}.hasOwnProperty

const HETI_NON_CONTIGUOUS_ELEMENTS: Record<string, number> = Object.assign(
  {},
  findAndReplace.NON_CONTIGUOUS_PROSE_ELEMENTS,
  { ins: 1, del: 1, s: 1, a: 1 },
)

const HETI_SKIPPED_ELEMENTS: Record<string, number> = Object.assign(
  {},
  findAndReplace.NON_PROSE_ELEMENTS,
  { 'pre': 1, 'code': 1, 'sup': 1, 'sub': 1, 'heti-spacing': 1, 'heti-close': 1 },
)

const HETI_SKIPPED_CLASS = 'heti-skip'

// ── Character classes ───────────────────────────────────────────

// 部分正则表达式修改自 pangu.js https://github.com/vinta/pangu.js
const CJK = '\u2E80-\u2EFF\u2F00-\u2FDF\u3040-\u309F\u30A0-\u30FA\u30FC-\u30FF\u3100-\u312F\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF'
const A = 'A-Za-z\u0080-\u00FF\u0370-\u03FF'
const N = '0-9'
const S = '`~!@#\\$%\\^&\\*\\(\\)-_=\\+\\[\\]{}\\\\\\|;:\'",<.>\\/\\?'
const ANS = `${A}${N}${S}`

const REG_CJK_FULL = `(?<=[${CJK}])( *[${ANS}]+(?: +[${ANS}]+)* *)(?=[${CJK}])`
const REG_CJK_START = `([${ANS}]+(?: +[${ANS}]+)* *)(?=[${CJK}])`
const REG_CJK_END = `(?<=[${CJK}])( *[${ANS}]+(?: +[${ANS}]+)*)`
const REG_CJK_FULL_WITHOUT_LOOKBEHIND = `(?:[${CJK}])( *[${ANS}]+(?: +[${ANS}]+)* *)(?=[${CJK}])`
const REG_CJK_END_WITHOUT_LOOKBEHIND = `(?:[${CJK}])( *[${ANS}]+(?: +[${ANS}]+)*)`

const REG_BD_STOP = '。．，、：；！‼？⁇'
const REG_BD_SEP = '·・‧'
const REG_BD_OPEN = '「『（《〈【〖〔［｛'
const REG_BD_CLOSE = '」』）》〉】〗〕］｝'
const REG_BD_START = `${REG_BD_OPEN}${REG_BD_CLOSE}`
const REG_BD_END = `${REG_BD_STOP}${REG_BD_OPEN}${REG_BD_CLOSE}`
const REG_BD_HALF_OPEN = '\u201C\u2018'
const REG_BD_HALF_CLOSE = '\u201D\u2019'
const REG_BD_HALF_START = `${REG_BD_HALF_OPEN}${REG_BD_HALF_CLOSE}`

// ── Heti class ──────────────────────────────────────────────────

export class Heti {
  private rootSelector: string
  private REG_FULL: RegExp
  private REG_START: RegExp
  private REG_END: RegExp
  private offsetWidth: number
  private funcForceContext: (el: HTMLElement) => boolean
  private funcFilterElements: (el: HTMLElement) => boolean

  constructor(rootSelector: string) {
    let supportLookBehind = true

    try {
      new RegExp('(?<=\\d)\\d', '').test('')
    }
    catch (err) {
      console.info((err as Error).name, '该浏览器尚未实现 RegExp positive lookbehind')
      supportLookBehind = false
    }

    this.rootSelector = rootSelector || '.heti'
    this.REG_FULL = new RegExp(supportLookBehind ? REG_CJK_FULL : REG_CJK_FULL_WITHOUT_LOOKBEHIND, 'g')
    this.REG_START = new RegExp(REG_CJK_START, 'g')
    this.REG_END = new RegExp(supportLookBehind ? REG_CJK_END : REG_CJK_END_WITHOUT_LOOKBEHIND, 'g')
    this.offsetWidth = supportLookBehind ? 0 : 1
    this.funcForceContext = function forceContext(el: HTMLElement) {
      return hasOwn.call(HETI_NON_CONTIGUOUS_ELEMENTS, el.nodeName.toLowerCase())
    }
    this.funcFilterElements = function filterElements(el: HTMLElement) {
      return (
        !(el.classList && el.classList.contains(HETI_SKIPPED_CLASS))
        && !hasOwn.call(HETI_SKIPPED_ELEMENTS, el.nodeName.toLowerCase())
      )
    }
  }

  spacingElement($$elm: Element): void {
    const commonConfig = {
      forceContext: this.funcForceContext,
      filterElements: this.funcFilterElements,
    }
    const getWrapper = (elementName: string, classList: string, text: string) => {
      const $$r = document.createElement(elementName)
      $$r.className = classList
      $$r.textContent = text.trim()
      return $$r
    }

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: this.REG_FULL,
      replace: portion => getWrapper('heti-spacing', 'heti-spacing-start heti-spacing-end', portion.text),
      offset: this.offsetWidth,
    }))

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: this.REG_START,
      replace: portion => getWrapper('heti-spacing', 'heti-spacing-start', portion.text),
    }))

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: this.REG_END,
      replace: portion => getWrapper('heti-spacing', 'heti-spacing-end', portion.text),
      offset: this.offsetWidth,
    }))

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: new RegExp(`([${REG_BD_STOP}])(?=[${REG_BD_START}])|([${REG_BD_OPEN}])(?=[${REG_BD_OPEN}])|([${REG_BD_CLOSE}])(?=[${REG_BD_END}])`, 'g'),
      replace: portion => getWrapper('heti-adjacent', 'heti-adjacent-half', portion.text),
      offset: this.offsetWidth,
    }))

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: new RegExp(`([${REG_BD_SEP}])(?=[${REG_BD_OPEN}])|([${REG_BD_CLOSE}])(?=[${REG_BD_SEP}])`, 'g'),
      replace: portion => getWrapper('heti-adjacent', 'heti-adjacent-quarter', portion.text),
      offset: this.offsetWidth,
    }))

    findAndReplace($$elm, Object.assign({}, commonConfig, {
      find: new RegExp(`([${REG_BD_STOP}])(?=[${REG_BD_HALF_START}])|([${REG_BD_HALF_OPEN}])(?=[${REG_BD_OPEN}])`, 'g'),
      replace: portion => getWrapper('heti-adjacent', 'heti-adjacent-quarter', portion.text),
      offset: this.offsetWidth,
    }))
  }

  autoSpacing(): void {
    const callback = () => {
      const $$rootList = document.querySelectorAll(this.rootSelector)

      for (const $$root of $$rootList) {
        this.spacingElement($$root)
      }
    }
    if (document.readyState === 'complete')
      setTimeout(callback)
    else
      document.addEventListener('DOMContentLoaded', callback)
  }
}

export default Heti
