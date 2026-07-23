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

/**
 * Viewport width below which the device is considered "mobile" for title
 * motion purposes (shorter scatter travel, stricter performance gating).
 * Shared by scatter layout and the capability probe to avoid drift.
 */
export const compactViewportWidth = 720

/** Number of consecutive frames sampled before accepting title geometry. */
export const titleLayoutStabilityFrameLimit = 2

/** Keep navigation responsive when a webfont request is slow or unavailable. */
export const titleFontWaitLimit = 120

/** Reuse a recently verified layout after pointer/focus intent. */
export const titleLayoutWarmDuration = 2_000

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

  // Compact viewports use a shorter travel distance to avoid edge clipping.
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

/** Conservative capability guard for detailed per-glyph motion on mobile. */
export const titleMotionPerformance = {
  lowCoreCount: 4,
  lowMemoryGb: 4,
} as const

export const svgNamespace = 'http://www.w3.org/2000/svg'
