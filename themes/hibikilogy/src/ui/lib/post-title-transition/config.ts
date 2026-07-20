export const postTitleDom = {
  titleSelector: '.PostTitleTransition[data-post-title-key]',
  titleTextSelector: '.PostTitleTransitionText',
  heroSelector: '.Hero',
  overlayClass: 'PostTitleTransitionOverlay',
  glyphClass: 'PostTitleTransitionGlyph',
  svgClass: 'PostTitleTransitionSvg',
  activeClass: 'is-post-title-transition-active',
  finalTargetClass: 'is-post-title-final-target',
  activeAttribute: 'data-post-title-transition',
  styleAttribute: 'data-post-title-transition-style',
} as const

/** Number of consecutive frames sampled before accepting title geometry. */
export const titleLayoutStabilityFrameLimit = 2

/** Timing for the shared title-to-title transition. */
export const sharedTitleMotion = {
  glyphDuration: 500,
  maxOrderedDelay: 180,
  maxRandomDelay: 70,
  movementEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  crossFadeEasing: 'ease-in-out',
} as const

/** Motion and geometry for a Hero title leaving toward the upper-right. */
export const scatterTitleMotion = {
  glyphDuration: 220,
  maxStagger: 130,
  easing: 'cubic-bezier(0.72, 0, 1, 0.35)',
  blurRadius: 1,

  // Compact viewports use a shorter travel distance to avoid edge clipping.
  compactViewportWidth: 720,
  compactMaxDistance: 72,
  wideMaxDistance: 104,
  minDistance: 40,

  // atan2(-1, 5) points mostly right with a subtle upward trajectory.
  directionX: 5,
  directionY: -1,
  angleVariation: 0.28,

  minScale: 0.94,
  scaleVariation: 0.06,

  // Ordered and random delay weights intentionally sum to one.
  orderedDelayWeight: 0.55,
  randomDelayWeight: 0.45,
} as const

export const svgNamespace = 'http://www.w3.org/2000/svg'
