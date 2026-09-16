import { pageDom } from 'shared/selectors.ts'

export const postTitleDom = {
  titleSelector: '.PostTitleTransition[data-post-title-key]',
  titleTextSelector: '.PostTitleTransitionText',
  heroSelector: pageDom.hero,
  overlayClass: 'PostTitleTransitionOverlay',
  glyphClass: 'PostTitleTransitionGlyph',
  svgClass: 'PostTitleTransitionSvg',
  activeClass: 'is-post-title-transition-active',
  finalTargetClass: 'is-post-title-final-target',
  activeAttribute: 'data-post-title-transition',
  styleAttribute: 'data-post-title-transition-style',
} as const

/** Consecutive frames sampled before accepting title geometry. */
export const TITLE_LAYOUT_STABILITY_FRAME_LIMIT = 2

/** Cap on webfont loading before layout is accepted anyway. */
export const TITLE_FONT_WAIT_LIMIT = 120

/** Reuse a recently verified layout after pointer/focus intent. */
export const TITLE_LAYOUT_WARM_DURATION = 2_000

export const sharedTitleMotion = {
  glyphDuration: 500,
  maxOrderedDelay: 180,
  maxRandomDelay: 70,
  movementEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  crossFadeEasing: 'ease-in-out',
} as const

/** Geometry for a Hero title leaving toward the upper-right. */
export const scatterTitleMotion = {
  glyphDuration: 220,
  maxStagger: 130,
  easing: 'cubic-bezier(0.72, 0, 1, 0.35)',

  compactMaxDistance: 72,
  wideMaxDistance: 104,
  minDistance: 40,

  // atan2(-1, 5): mostly right with a subtle upward trajectory.
  directionX: 5,
  directionY: -1,
  angleVariation: 0.28,

  minScale: 0.94,
  scaleVariation: 0.06,

  // Ordered and random delay weights intentionally sum to one.
  orderedDelayWeight: 0.55,
  randomDelayWeight: 0.45,
} as const

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
