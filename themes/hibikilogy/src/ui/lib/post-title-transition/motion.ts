import type { GlyphPosition, RenderedTitle } from './renderer.ts'
import { animate } from 'motion/mini'
import { compactViewportWidth, postTitleDom, scatterTitleMotion, sharedTitleMotion } from './config.ts'
import {
  createStableToken,
  deterministicIndexJitter,
  deterministicUnitValue,
  roundCoordinate,
} from './utils.ts'

interface TransitionNames {
  glyphNames: string[]
  finalName: string
}

interface ScatterParameters {
  offsetX: number
  offsetY: number
  scale: number
  delay: number
}

const scatterRandomChannel = {
  angle: 0,
  // Channel 1 is intentionally reserved to preserve the established motion.
  distance: 2,
  scale: 3,
  delay: 4,
} as const

export function createTransitionNames(key: string, glyphCount: number): TransitionNames {
  const token = createStableToken(key)
  return {
    glyphNames: Array.from(
      { length: glyphCount },
      (_, index) => `post-title-glyph-${token}-${index}`,
    ),
    finalName: `post-title-final-${token}`,
  }
}

export function createSharedTransitionCss(
  names: string[],
  finalName: string,
  crossFadeToFinalTitle: boolean,
): string {
  const delays = names.map((_, index) => {
    const orderedProgress = names.length > 1 ? index / (names.length - 1) : 0
    const randomProgress = deterministicIndexJitter(index)
    return Math.round(
      orderedProgress * sharedTitleMotion.maxOrderedDelay
      + randomProgress * sharedTitleMotion.maxRandomDelay,
    )
  })
  const totalDuration = sharedTitleMotion.glyphDuration + Math.max(...delays)
  const glyphStyles = names.map((name, index) => {
    const delay = delays[index]
    const incomingAnimation = crossFadeToFinalTitle
      ? 'post-title-glyph-new-to-final'
      : 'post-title-glyph-new'

    return `
      html[${postTitleDom.activeAttribute}='active']::view-transition-group(${name}) {
        z-index: var(--joh-z-index-layout-top);
        animation-duration: ${sharedTitleMotion.glyphDuration}ms;
        animation-delay: ${delay}ms;
        animation-timing-function: ${sharedTitleMotion.movementEasing};
      }
      html[${postTitleDom.activeAttribute}='active']::view-transition-old(${name}) {
        mix-blend-mode: normal;
        animation: post-title-glyph-old ${sharedTitleMotion.glyphDuration}ms ${sharedTitleMotion.crossFadeEasing} ${delay}ms both;
      }
      html[${postTitleDom.activeAttribute}='active']::view-transition-new(${name}) {
        mix-blend-mode: normal;
        animation: ${incomingAnimation} ${sharedTitleMotion.glyphDuration}ms ${sharedTitleMotion.crossFadeEasing} ${delay}ms both;
      }
    `
  }).join('')

  return `${glyphStyles}
    html[${postTitleDom.activeAttribute}='active']::view-transition-group(${finalName}) {
      z-index: calc(var(--joh-z-index-layout-top) + 1);
      animation: none;
    }
    html[${postTitleDom.activeAttribute}='active']::view-transition-new(${finalName}) {
      mix-blend-mode: normal;
      animation: post-title-final-enter ${totalDuration}ms linear both;
    }
  `
}

export async function playScatterAnimation(
  rendered: RenderedTitle,
  key: string,
): Promise<void> {
  const parameters = createScatterParameters(rendered.positions, key)
  const msToSeconds = (ms: number): number => ms / 1000

  const animations = rendered.glyphs.map((glyph, index) => animate(
    glyph,
    {
      transform: [
        'translate(0px, 0px) scale(1)',
        `translate(${parameters[index].offsetX}px, ${parameters[index].offsetY}px) scale(${parameters[index].scale})`,
      ],
      opacity: [1, 0],
    },
    {
      duration: msToSeconds(scatterTitleMotion.glyphDuration),
      delay: msToSeconds(parameters[index].delay),
      ease: scatterTitleMotion.easingControlPoints,
    },
  ))

  await Promise.all(animations.map((animation, index) =>
    Promise.resolve(animation)
      .then(() => {
        // Pin the animated end state, mirroring WAAPI `fill: 'both'`.
        const { offsetX, offsetY, scale } = parameters[index]
        rendered.glyphs[index].style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
        rendered.glyphs[index].style.opacity = '0'
      })
      .catch(() => undefined),
  ))
}

function createScatterParameters(
  positions: GlyphPosition[],
  key: string,
): ScatterParameters[] {
  const maxDistance = window.innerWidth < compactViewportWidth
    ? scatterTitleMotion.compactMaxDistance
    : scatterTitleMotion.wideMaxDistance
  const canonicalAngle = Math.atan2(
    scatterTitleMotion.directionY,
    scatterTitleMotion.directionX,
  )

  return positions.map((_, index) => {
    const seed = `${key}:${index}`
    const angleProgress = deterministicUnitValue(seed, scatterRandomChannel.angle) - 0.5
    const angle = canonicalAngle + angleProgress * scatterTitleMotion.angleVariation
    const distanceProgress = deterministicUnitValue(seed, scatterRandomChannel.distance)
    const distance = scatterTitleMotion.minDistance
      + distanceProgress * (maxDistance - scatterTitleMotion.minDistance)
    const scaleProgress = deterministicUnitValue(seed, scatterRandomChannel.scale)
    const scale = scatterTitleMotion.minScale
      + scaleProgress * scatterTitleMotion.scaleVariation
    const orderedProgress = positions.length > 1 ? index / (positions.length - 1) : 0
    const randomDelay = deterministicUnitValue(seed, scatterRandomChannel.delay)
    const delay = Math.round(scatterTitleMotion.maxStagger * (
      orderedProgress * scatterTitleMotion.orderedDelayWeight
      + randomDelay * scatterTitleMotion.randomDelayWeight
    ))

    return {
      offsetX: roundCoordinate(Math.cos(angle) * distance),
      offsetY: roundCoordinate(Math.sin(angle) * distance),
      scale: roundCoordinate(scale),
      delay,
    }
  })
}
