import type { RenderedTitle } from './post-title-transition/renderer.ts'
import { shouldSkipMotion } from '../../shared/animation.ts'
import { isElementVisibleInViewport } from '../../shared/visibility.ts'
import { postTitleDom } from './post-title-transition/config.ts'
import {
  createSharedTransitionCss,
  createTransitionNames,
  playScatterAnimation,
} from './post-title-transition/motion.ts'
import {
  clearRenderedTitleShadow,
  countTitleGlyphs,
  disposeRenderedTitle,
  findSourceTitle,
  findTitleByKey,
  getNormalizedTitleText,
  isHeroTitle,
  renderTitle,
  waitForStableTitleLayout,
} from './post-title-transition/renderer.ts'

type TitleTransitionMode = 'pending' | 'shared' | 'scatter'

interface ActiveTitleTransition {
  owner: symbol
  key: string
  glyphNames: string[]
  finalName: string
  rendered: RenderedTitle[]
  style: HTMLStyleElement
  sourceText: string
  sourceIsHero: boolean
  mode: TitleTransitionMode
}

interface BeginTitleTransitionOptions {
  trigger?: Element
}

export interface PostTitleTransitionPreparation {
  waitForTarget: boolean
  ready: Promise<boolean>
  cancel: () => void
}

interface PreparationOwner {
  token: symbol
  controller: AbortController
  cancelled: boolean
}

let activeTransition: ActiveTitleTransition | null = null
let activePreparation: PreparationOwner | null = null

export function beginPostTitleTransition({
  trigger,
}: BeginTitleTransitionOptions): PostTitleTransitionPreparation {
  cancelActivePreparation()

  if (!supportsPostTitleTransition() || document.documentElement.dataset.pageTransition === 'active')
    return createInactivePreparation()

  const source = findSourceTitle(trigger)
  const key = source?.dataset.postTitleKey
  if (!source || !key)
    return createInactivePreparation()

  const sourceIsHero = isHeroTitle(source)
  const owner: PreparationOwner = {
    token: Symbol(key),
    controller: new AbortController(),
    cancelled: false,
  }
  activePreparation = owner

  const cancel = (): void => {
    if (owner.cancelled)
      return

    owner.cancelled = true
    owner.controller.abort()
    if (activePreparation === owner)
      activePreparation = null
    clearPostTitleTransition(owner.token)
  }

  const ready = preparePostTitleTransition({
    key,
    owner,
    source,
    sourceIsHero,
  })

  return {
    waitForTarget: sourceIsHero,
    ready,
    cancel,
  }
}

async function preparePostTitleTransition({
  key,
  owner,
  source,
  sourceIsHero,
}: {
  key: string
  owner: PreparationOwner
  source: HTMLElement
  sourceIsHero: boolean
}): Promise<boolean> {
  if (
    sourceIsHero
    && !(await isElementVisibleInViewport(source, owner.controller.signal))
  ) {
    return false
  }
  if (!ownsPreparation(owner))
    return false

  await waitForStableTitleLayout(source)
  if (!ownsPreparation(owner) || !source.isConnected)
    return false

  const rendered = renderTitle(source, { preserveTextShadow: sourceIsHero })
  if (!rendered?.glyphs.length)
    return false

  const { glyphNames, finalName } = createTransitionNames(key, rendered.glyphs.length)
  rendered.glyphs.forEach((glyph, index) => {
    glyph.style.setProperty('view-transition-name', glyphNames[index])
  })

  const style = document.createElement('style')
  style.setAttribute(postTitleDom.styleAttribute, '')
  document.head.append(style)
  document.documentElement.setAttribute(postTitleDom.activeAttribute, 'active')
  activeTransition = {
    owner: owner.token,
    key,
    glyphNames,
    finalName,
    rendered: [rendered],
    style,
    sourceText: getNormalizedTitleText(source),
    sourceIsHero,
    mode: 'pending',
  }
  return true
}

export function resolvePostTitleTransitionTarget(incomingDocument?: Document): void {
  const transition = activeTransition
  if (!transition)
    return

  const target = incomingDocument
    ? findTitleByKey(transition.key, incomingDocument)
    : null
  const canShare = Boolean(
    target
    && getNormalizedTitleText(target) === transition.sourceText
    && countTitleGlyphs(target) === transition.glyphNames.length,
  )

  setTransitionMode(
    transition,
    canShare || !transition.sourceIsHero ? 'shared' : 'scatter',
  )
}

export async function playPostTitleExitAnimation(): Promise<boolean> {
  const transition = activeTransition
  if (!transition || transition.mode !== 'scatter' || !transition.sourceIsHero)
    return false

  transition.style.textContent = ''
  await playScatterAnimation(transition.rendered[0], transition.key)
  return activeTransition === transition
}

export function renderPostTitleTransitionTarget(): void {
  const transition = activeTransition
  if (!transition || transition.mode !== 'shared')
    return

  const target = findTitleByKey(transition.key)
  if (!target || !target.isConnected)
    return

  const rendered = renderTitle(target, {
    finalViewTransitionName: isHeroTitle(target) ? transition.finalName : undefined,
  })
  if (!rendered || rendered.glyphs.length !== transition.glyphNames.length) {
    if (transition.sourceIsHero)
      setTransitionMode(transition, 'scatter')
    return
  }

  rendered.glyphs.forEach((glyph, index) => {
    glyph.style.setProperty('view-transition-name', transition.glyphNames[index])
  })
  transition.rendered.push(rendered)
}

export function clearPostTitleTransition(owner?: symbol): void {
  const transition = activeTransition
  if (owner && transition?.owner !== owner)
    return

  document.documentElement.removeAttribute(postTitleDom.activeAttribute)

  if (!transition) {
    document.querySelector(`style[${postTitleDom.styleAttribute}]`)?.remove()
    return
  }

  transition.rendered.forEach(disposeRenderedTitle)
  transition.style.remove()
  activeTransition = null
}

function cancelActivePreparation(): void {
  const preparation = activePreparation
  if (!preparation)
    return

  preparation.cancelled = true
  preparation.controller.abort()
  activePreparation = null
  clearPostTitleTransition(preparation.token)
}

function createInactivePreparation(): PostTitleTransitionPreparation {
  return {
    waitForTarget: false,
    ready: Promise.resolve(false),
    cancel: () => {},
  }
}

function ownsPreparation(owner: PreparationOwner): boolean {
  return !owner.cancelled
    && !owner.controller.signal.aborted
    && activePreparation === owner
}

function setTransitionMode(
  transition: ActiveTitleTransition,
  mode: Exclude<TitleTransitionMode, 'pending'>,
): void {
  transition.mode = mode
  if (mode === 'shared') {
    clearRenderedTitleShadow(transition.rendered[0])
    transition.style.textContent = createSharedTransitionCss(
      transition.glyphNames,
      transition.finalName,
    )
    return
  }

  transition.style.textContent = ''
}

function supportsPostTitleTransition(): boolean {
  const viewTransitionDocument = document as Document & {
    startViewTransition?: unknown
  }

  return Boolean(
    typeof viewTransitionDocument.startViewTransition === 'function'
    && typeof Intl.Segmenter === 'function'
    && typeof IntersectionObserver === 'function'
    && typeof Element.prototype.checkVisibility === 'function'
    && !shouldSkipMotion(),
  )
}
