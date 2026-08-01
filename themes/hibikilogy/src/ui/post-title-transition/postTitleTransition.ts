import type { RenderedTitle } from './renderer.ts'
import type {
  PostTitleTransitionPreparation,
  ResolvePostTitleTransitionTargetOptions,
} from './types.ts'
import { shouldSkipMotion } from '../../shared/animation.ts'
import { isElementVisibleInViewport } from '../../shared/visibility.ts'
import { postTitleDom } from './config.ts'
import {
  createSharedTransitionCss,
  createTransitionNames,
  playScatterAnimation,
} from './motion.ts'
import { isLowPerformanceMobileDevice } from './performance.ts'
import {
  clearRenderedTitleShadow,
  countTitleGlyphs,
  discardRenderedTitleGlyphs,
  disposeRenderedTitle,
  findSourceTitle,
  findTitleByKey,
  getNormalizedTitleText,
  isHeroTitle,
  renderTitle,
  waitForStableTitleLayout,
} from './renderer.ts'

type TitleTransitionMode = 'pending' | 'shared' | 'scatter' | 'dismissed'

interface BeginTitleTransitionOptions {
  trigger?: Element
}

let activeSession: PostTitleTransitionSession | null = null

/**
 * Encapsulates the resource ownership (rendered glyph overlay, injected
 * `<style>`, view-transition name tokens) and mode progression for one
 * title-transition lifecycle. Replaces ad-hoc module-level `let`s.
 */
class PostTitleTransitionSession {
  readonly owner: symbol
  readonly key: string
  readonly glyphNames: string[]
  readonly finalName: string
  readonly style: HTMLStyleElement
  readonly sourceText: string
  readonly sourceIsHero: boolean
  targetIsHero: boolean
  mode: TitleTransitionMode
  private readonly rendered: RenderedTitle[]

  constructor(owner: symbol, key: string, glyphNames: string[], finalName: string, style: HTMLStyleElement, sourceText: string, sourceIsHero: boolean, rendered: RenderedTitle) {
    this.owner = owner
    this.key = key
    this.glyphNames = glyphNames
    this.finalName = finalName
    this.style = style
    this.sourceText = sourceText
    this.sourceIsHero = sourceIsHero
    this.targetIsHero = false
    this.mode = 'pending'
    this.rendered = [rendered]
  }

  static fromTrigger(owner: symbol, source: HTMLElement, sourceIsHero: boolean): PostTitleTransitionSession | null {
    const key = source.dataset.postTitleKey
    if (!key)
      return null

    const rendered = renderTitle(source, { preserveTextShadow: sourceIsHero })
    if (!rendered || !rendered.glyphs.length)
      return null

    const { glyphNames, finalName } = createTransitionNames(key, rendered.glyphs.length)
    rendered.glyphs.forEach((glyph, index) => {
      glyph.style.setProperty('view-transition-name', glyphNames[index])
    })

    const style = document.createElement('style')
    style.setAttribute(postTitleDom.styleAttribute, '')
    document.head.append(style)
    document.documentElement.setAttribute(postTitleDom.activeAttribute, 'active')

    return new PostTitleTransitionSession(
      owner,
      key,
      glyphNames,
      finalName,
      style,
      getNormalizedTitleText(source),
      sourceIsHero,
      rendered,
    )
  }

  resolveTarget(
    incomingDocument?: Document,
    options: ResolvePostTitleTransitionTargetOptions = {},
  ): void {
    const target = incomingDocument
      ? findTitleByKey(this.key, incomingDocument)
      : null
    const canShare = Boolean(
      target
      && getNormalizedTitleText(target) === this.sourceText
      && countTitleGlyphs(target) === this.glyphNames.length,
    )
    this.targetIsHero = Boolean(canShare && target && isHeroTitle(target))

    if (canShare || !this.sourceIsHero) {
      this.setMode('shared')
      return
    }

    this.setMode(options.suppressScatter ? 'dismissed' : 'scatter')
  }

  renderTarget(): void {
    if (this.mode !== 'shared')
      return

    const target = findTitleByKey(this.key)
    if (!target || !target.isConnected)
      return

    const rendered = renderTitle(target, {
      finalViewTransitionName: isHeroTitle(target) ? this.finalName : undefined,
    })
    if (!rendered || rendered.glyphs.length !== this.glyphNames.length) {
      if (this.sourceIsHero)
        this.setMode('scatter')
      return
    }

    rendered.glyphs.forEach((glyph, index) => {
      glyph.style.setProperty('view-transition-name', this.glyphNames[index])
    })
    this.rendered.push(rendered)
  }

  async playExitAnimation(): Promise<boolean> {
    if (this.mode !== 'scatter' || !this.sourceIsHero)
      return false

    this.style.textContent = ''
    await playScatterAnimation(this.rendered[0], this.key)
    discardRenderedTitleGlyphs(this.rendered[0])
    return activeSession === this
  }

  /** Tear down DOM inserts and clear the active slot if this session owns it. */
  clear(owner?: symbol): void {
    if (owner && this.owner !== owner)
      return

    document.documentElement.removeAttribute(postTitleDom.activeAttribute)
    this.rendered.forEach(disposeRenderedTitle)
    this.style.remove()
    if (activeSession === this)
      activeSession = null
  }

  private setMode(mode: Exclude<TitleTransitionMode, 'pending'>): void {
    this.mode = mode
    if (mode === 'shared') {
      clearRenderedTitleShadow(this.rendered[0])
      this.style.textContent = createSharedTransitionCss(
        this.glyphNames,
        this.finalName,
        this.targetIsHero,
      )
      return
    }

    if (mode === 'dismissed') {
      // Restore the source title (its text is hidden while the overlay is
      // active) and drop the glyph layer so it leaves with the page.
      disposeRenderedTitle(this.rendered[0])
    }
    this.style.textContent = ''
  }
}

interface PreparationOwner {
  token: symbol
  controller: AbortController
  session: PostTitleTransitionSession | null
  cancelled: boolean
}

let activePreparation: PreparationOwner | null = null

export function beginPostTitleTransition({
  trigger,
}: BeginTitleTransitionOptions): PostTitleTransitionPreparation {
  cancelActivePreparation()

  if (!supportsPostTitleTransition() || document.documentElement.dataset.pageTransition === 'active')
    return createInactivePreparation()

  const source = findSourceTitle(trigger)
  if (!source || !source.dataset.postTitleKey)
    return createInactivePreparation()

  const sourceIsHero = isHeroTitle(source)
  const owner: PreparationOwner = {
    token: Symbol(source.dataset.postTitleKey as string),
    controller: new AbortController(),
    session: null,
    cancelled: false,
  }
  activePreparation = owner

  const ready = preparePostTitleTransition({
    owner,
    source,
    sourceIsHero,
  })

  const cancel = (): void => {
    if (owner.cancelled)
      return
    owner.cancelled = true
    if (activePreparation === owner)
      activePreparation = null
    owner.controller.abort()
    owner.session?.clear(owner.token)
  }

  return {
    waitForTarget: sourceIsHero,
    ready,
    cancel,
  }
}

export function preloadPostTitleTransition(trigger?: Element): void {
  if (!supportsPostTitleTransition())
    return

  const source = findSourceTitle(trigger)
  if (source)
    void waitForStableTitleLayout(source)
}

async function preparePostTitleTransition({
  owner,
  source,
  sourceIsHero,
}: {
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

  const session = PostTitleTransitionSession.fromTrigger(owner.token, source, sourceIsHero)
  if (!session)
    return false
  if (!ownsPreparation(owner)) {
    session.clear()
    return false
  }
  owner.session = session
  activeSession = session
  return true
}

export function resolvePostTitleTransitionTarget(
  incomingDocument?: Document,
  options?: ResolvePostTitleTransitionTargetOptions,
): void {
  activeSession?.resolveTarget(incomingDocument, options)
}

export async function playPostTitleExitAnimation(): Promise<boolean> {
  return activeSession?.playExitAnimation() ?? false
}

export function renderPostTitleTransitionTarget(): void {
  activeSession?.renderTarget()
}

export function clearPostTitleTransition(owner?: symbol): void {
  activeSession?.clear(owner)
}

function cancelActivePreparation(): void {
  const preparation = activePreparation
  if (!preparation)
    return

  preparation.cancelled = true
  activePreparation = null
  preparation.controller.abort()
  preparation.session?.clear(preparation.token)
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

function supportsPostTitleTransition(): boolean {
  const viewTransitionDocument = document as Document & {
    startViewTransition?: unknown
  }

  return Boolean(
    typeof viewTransitionDocument.startViewTransition === 'function'
    && typeof Intl.Segmenter === 'function'
    && typeof IntersectionObserver === 'function'
    && typeof Element.prototype.checkVisibility === 'function'
    && !shouldSkipMotion()
    && !isLowPerformanceMobileDevice(),
  )
}
