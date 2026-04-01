import type { LivelinePalette, ChartLayout, LivelinePoint, Momentum, ReferenceLine, OrderbookData, DegenOptions } from '../types'
import { drawGrid, type GridState } from './grid'
import { drawLine } from './line'
import { drawDot, drawArrows, drawSimpleDot, drawMultiDot } from './dot'
import { drawCrosshair, drawMultiCrosshair } from './crosshair'
import type { MultiSeriesHoverEntry } from './crosshair'
import { drawReferenceLine } from './referenceLine'
import { drawTimeAxis, type TimeAxisState } from './timeAxis'
import { drawOrderbook, type OrderbookState } from './orderbook'
import { drawParticles, spawnOnSwing, type ParticleState } from './particles'
import { drawEmpty } from './empty'

// Constants
const SHAKE_DECAY_RATE = 0.002
const SHAKE_MIN_AMPLITUDE = 0.2
export const FADE_EDGE_WIDTH = 40
const CROSSHAIR_FADE_MIN_PX = 5

export interface ArrowState { up: number; down: number }

export function createArrowState(): ArrowState {
  return { up: 0, down: 0 }
}

export interface ShakeState {
  amplitude: number  // current shake magnitude in px, decays each frame
}

export function createShakeState(): ShakeState {
  return { amplitude: 0 }
}

export function createGridState(): GridState {
  return { interval: 0, labels: new Map() }
}

export function createTimeAxisState(): TimeAxisState {
  return { labels: new Map() }
}

export function createOrderbookState(): OrderbookState {
  return {
    labels: [], spawnTimer: 0, smoothSpeed: 60,
    prevBidTotal: 0, prevAskTotal: 0, churnRate: 0,
  }
}

export function createParticleState(): ParticleState {
  return { particles: [], cooldown: 0, burstCount: 0 }
}

export interface DrawOptions {
  visible: LivelinePoint[]
  smoothValue: number
  now: number  // engine's Date.now()/1000, single timestamp for the frame
  momentum: Momentum
  arrowState: ArrowState
  showGrid: boolean
  showMomentum: boolean
  showPulse: boolean
  showFill: boolean
  referenceLine?: ReferenceLine
  hoverX: number | null
  hoverValue: number | null
  hoverTime: number | null
  scrubAmount: number // 0 = not scrubbing, 1 = fully scrubbing (lerped)
  windowSecs: number
  formatValue: (v: number) => string
  formatTime: (t: number) => string
  gridState: GridState
  timeAxisState: TimeAxisState
  dt: number // delta time in ms for frame-rate-independent lerps
  targetWindowSecs: number // final target window (stable during transitions)
  tooltipY: number
  tooltipOutline: boolean
  orderbookData?: OrderbookData
  orderbookState?: OrderbookState
  particleState?: ParticleState
  particleOptions?: DegenOptions
  swingMagnitude: number
  shakeState?: ShakeState
  chartReveal: number       // 0 = loading/morphing from center, 1 = fully revealed
  pauseProgress: number     // 0 = playing, 1 = fully paused
  now_ms: number            // performance.now() for breathing animation timing
}

/**
 * Master draw function — calls each draw module in order.
 * Mutates arrowState in place.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  palette: LivelinePalette,
  opts: DrawOptions,
): void {
  // 0. Chart shake — apply offset, decay amplitude
  const shake = opts.shakeState
  let shakeX = 0
  let shakeY = 0
  if (shake && shake.amplitude > SHAKE_MIN_AMPLITUDE) {
    shakeX = (Math.random() - 0.5) * 2 * shake.amplitude
    shakeY = (Math.random() - 0.5) * 2 * shake.amplitude
    ctx.save()
    ctx.translate(shakeX, shakeY)
  }
  if (shake) {
    // Exponential decay — ~200ms of visible shake
    const decayRate = Math.pow(SHAKE_DECAY_RATE, opts.dt / 1000)
    shake.amplitude *= decayRate
    if (shake.amplitude < SHAKE_MIN_AMPLITUDE) shake.amplitude = 0
  }

  const reveal = opts.chartReveal
  const pause = opts.pauseProgress

  // Smoothstep helper for staggered reveal
  const revealRamp = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (reveal - start) / (end - start)))
    return t * t * (3 - 2 * t)
  }

  // 1. Reference line (behind everything) — fades with reveal
  if (opts.referenceLine && reveal > 0.01) {
    ctx.save()
    if (reveal < 1) ctx.globalAlpha = reveal
    drawReferenceLine(ctx, layout, palette, opts.referenceLine)
    ctx.restore()
  }

  // 2. Grid — fades in delayed (15%–70% of reveal)
  if (opts.showGrid) {
    const gridAlpha = reveal < 1 ? revealRamp(0.15, 0.7) : 1
    if (gridAlpha > 0.01) {
      ctx.save()
      if (gridAlpha < 1) ctx.globalAlpha = gridAlpha
      drawGrid(ctx, layout, palette, opts.formatValue, opts.gridState, opts.dt)
      ctx.restore()
    }
  }

  // 2b. Orderbook (behind line) — fades with reveal
  if (opts.orderbookData && opts.orderbookState && reveal > 0.01) {
    ctx.save()
    if (reveal < 1) ctx.globalAlpha = reveal
    drawOrderbook(ctx, layout, palette, opts.orderbookData, opts.dt, opts.orderbookState, opts.swingMagnitude)
    ctx.restore()
  }

  // 3. Line + fill (with scrub dimming + reveal morphing)
  const scrubX = opts.scrubAmount > 0.05 ? opts.hoverX : null
  const pts = drawLine(ctx, layout, palette, opts.visible, opts.smoothValue, opts.now, opts.showFill, scrubX, opts.scrubAmount, reveal, opts.now_ms)

  // 4. Time axis — same timing as grid
  {
    const timeAlpha = reveal < 1 ? revealRamp(0.15, 0.7) : 1
    if (timeAlpha > 0.01) {
      ctx.save()
      if (timeAlpha < 1) ctx.globalAlpha = timeAlpha
      drawTimeAxis(ctx, layout, palette, opts.windowSecs, opts.targetWindowSecs, opts.formatTime, opts.timeAxisState, opts.dt)
      ctx.restore()
    }
  }

  if (pts && pts.length > 0) {
    const lastPt = pts[pts.length - 1]

    // 5. Dot — dims during scrub, fades in with reveal (0.3 → 1.0)
    let dotScrub = opts.scrubAmount
    if (opts.hoverX !== null && dotScrub > 0) {
      const distToLive = lastPt[0] - opts.hoverX
      const fadeStart = Math.min(80, layout.chartW * 0.3)
      dotScrub = distToLive < CROSSHAIR_FADE_MIN_PX ? 0
        : distToLive >= fadeStart ? opts.scrubAmount
        : ((distToLive - CROSSHAIR_FADE_MIN_PX) / (fadeStart - CROSSHAIR_FADE_MIN_PX)) * opts.scrubAmount
    }

    // Dot appears once shape is recognizable (reveal > 0.3)
    const dotAlpha = reveal < 0.3 ? 0 : (reveal - 0.3) / 0.7
    const showPulse = opts.showPulse && reveal > 0.6 && pause < 0.5
    if (dotAlpha > 0.01) {
      ctx.save()
      if (dotAlpha < 1) ctx.globalAlpha = dotAlpha
      drawDot(ctx, lastPt[0], lastPt[1], palette, showPulse, dotScrub, opts.now_ms)
      ctx.restore()
    }

    // 5b. Arrows — appear late in reveal (60%+), fade with pause
    if (opts.showMomentum) {
      const arrowReveal = reveal < 1 ? revealRamp(0.6, 1) : 1
      const arrowAlpha = arrowReveal * (1 - pause)
      if (arrowAlpha > 0.01) {
        ctx.save()
        if (arrowAlpha < 1) ctx.globalAlpha = arrowAlpha
        drawArrows(
          ctx, lastPt[0], lastPt[1],
          opts.momentum, palette, opts.arrowState, opts.dt, opts.now_ms,
        )
        ctx.restore()
      }
    }

    // 6. Particles — only when fully revealed
    if (opts.particleState && reveal > 0.9) {
      const burstIntensity = spawnOnSwing(
        opts.particleState, opts.momentum, lastPt[0], lastPt[1],
        opts.swingMagnitude, palette.line, opts.dt, opts.particleOptions,
      )
      if (burstIntensity > 0 && shake) {
        shake.amplitude = (3 + opts.swingMagnitude * 4) * burstIntensity
      }
      drawParticles(ctx, opts.particleState, opts.dt)
    }
  }

  // 7. Left edge fade — gradient erase
  const fadeW = FADE_EDGE_WIDTH
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const fadeGrad = ctx.createLinearGradient(layout.pad.left, 0, layout.pad.left + fadeW, 0)
  fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = fadeGrad
  ctx.fillRect(0, 0, layout.pad.left + fadeW, layout.h)
  ctx.restore()

  // 8. Crosshair — fade out well before reaching live dot
  if (opts.hoverX !== null && opts.hoverValue !== null && opts.hoverTime !== null && pts && pts.length > 0) {
    const lastPt = pts[pts.length - 1]
    const distToLive = lastPt[0] - opts.hoverX
    const fadeStart = Math.min(80, layout.chartW * 0.3)
    const scrubOpacity = distToLive < CROSSHAIR_FADE_MIN_PX ? 0
      : distToLive >= fadeStart ? opts.scrubAmount
      : ((distToLive - CROSSHAIR_FADE_MIN_PX) / (fadeStart - CROSSHAIR_FADE_MIN_PX)) * opts.scrubAmount

    if (scrubOpacity > 0.01) {
      drawCrosshair(
        ctx, layout, palette,
        opts.hoverX, opts.hoverValue, opts.hoverTime,
        opts.formatValue, opts.formatTime,
        scrubOpacity,
        opts.tooltipY,
        lastPt[0], // liveDotX — tooltip right edge stops here
        opts.tooltipOutline,
      )
    }
  }

  // Restore shake translate
  if (shake && (shakeX !== 0 || shakeY !== 0)) {
    ctx.restore()
  }
}

// ─── Multi-series draw orchestration ──────────────────────────────────────

export interface MultiSeriesEntry {
  visible: LivelinePoint[]
  smoothValue: number
  palette: LivelinePalette
  label?: string
  alpha?: number  // series visibility alpha (0 = hidden, 1 = visible)
}

export interface MultiSeriesDrawOptions {
  series: MultiSeriesEntry[]
  now: number
  showGrid: boolean
  showPulse: boolean
  referenceLine?: ReferenceLine
  hoverX: number | null
  hoverTime: number | null
  hoverEntries: MultiSeriesHoverEntry[]
  scrubAmount: number
  windowSecs: number
  formatValue: (v: number) => string
  formatTime: (t: number) => string
  gridState: GridState
  timeAxisState: TimeAxisState
  dt: number
  targetWindowSecs: number
  tooltipY: number
  tooltipOutline: boolean
  chartReveal: number
  pauseProgress: number
  now_ms: number
  /** Primary palette (from first series) for grid/axis/crosshair colors */
  primaryPalette: LivelinePalette
}

/**
 * Multi-series draw function — draws multiple overlapping lines sharing the same axes.
 * No fill, no momentum arrows, no badge (those are per-chart concerns handled by the engine).
 */
export function drawMultiFrame(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  opts: MultiSeriesDrawOptions,
): void {
  const palette = opts.primaryPalette
  const reveal = opts.chartReveal

  const revealRamp = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (reveal - start) / (end - start)))
    return t * t * (3 - 2 * t)
  }

  // 1. Reference line
  if (opts.referenceLine && reveal > 0.01) {
    ctx.save()
    if (reveal < 1) ctx.globalAlpha = reveal
    drawReferenceLine(ctx, layout, palette, opts.referenceLine)
    ctx.restore()
  }

  // 2. Grid
  if (opts.showGrid) {
    const gridAlpha = reveal < 1 ? revealRamp(0.15, 0.7) : 1
    if (gridAlpha > 0.01) {
      ctx.save()
      if (gridAlpha < 1) ctx.globalAlpha = gridAlpha
      drawGrid(ctx, layout, palette, opts.formatValue, opts.gridState, opts.dt)
      ctx.restore()
    }
  }

  // 3. Draw each series line (back to front, no fill, with scrub dimming)
  // During reverse morph, secondary lines fade out so only one remains at
  // chartReveal=0 — prevents alpha compounding from multiple overlapping strokes
  // looking brighter than the single standalone loading squiggly.
  const scrubX = opts.scrubAmount > 0.05 ? opts.hoverX : null
  const allPts: { pts: [number, number][]; palette: LivelinePalette; label?: string; alpha: number }[] = []
  for (let si = 0; si < opts.series.length; si++) {
    const s = opts.series[si]
    const seriesAlpha = s.alpha ?? 1
    const secondaryFade = (si > 0 && reveal < 1) ? Math.min(1, reveal * 2) : 1
    const combinedAlpha = secondaryFade * seriesAlpha
    if (combinedAlpha < 0.01) continue
    ctx.save()
    if (combinedAlpha < 1) ctx.globalAlpha = combinedAlpha
    const pts = drawLine(
      ctx, layout, s.palette, s.visible, s.smoothValue, opts.now,
      false, // no fill
      scrubX, opts.scrubAmount,
      reveal, opts.now_ms,
    )
    ctx.restore()
    if (pts && pts.length > 0) {
      allPts.push({ pts, palette: s.palette, label: s.label, alpha: seriesAlpha })
    }
  }

  // 4. Time axis
  {
    const timeAlpha = reveal < 1 ? revealRamp(0.15, 0.7) : 1
    if (timeAlpha > 0.01) {
      ctx.save()
      if (timeAlpha < 1) ctx.globalAlpha = timeAlpha
      drawTimeAxis(ctx, layout, palette, opts.windowSecs, opts.targetWindowSecs, opts.formatTime, opts.timeAxisState, opts.dt)
      ctx.restore()
    }
  }

  // 5. Endpoint dots + labels for each series
  // Dots stay at reveal-based alpha only (no scrub dimming) — matching
  // single-series where drawDot keeps inner dot at full baseAlpha
  if (reveal > 0.3 && allPts.length > 0) {
    const dotAlpha = (reveal - 0.3) / 0.7
    const showPulse = opts.showPulse && reveal > 0.6 && opts.pauseProgress < 0.5

    for (const entry of allPts) {
      if (entry.alpha < 0.01) continue
      const lastPt = entry.pts[entry.pts.length - 1]

      ctx.save()
      ctx.globalAlpha = dotAlpha * entry.alpha

      // Use pulsing dot when enabled and series is mostly visible
      if (showPulse && entry.alpha > 0.5) {
        drawMultiDot(ctx, lastPt[0], lastPt[1], entry.palette.line, true, opts.now_ms, 3)
      } else {
        drawSimpleDot(ctx, lastPt[0], lastPt[1], entry.palette.line, 3)
      }

      // Label at endpoint (right of dot — layout reserves space via labelReserve)
      if (entry.label) {
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillStyle = entry.palette.line
        ctx.fillText(entry.label, lastPt[0] + 6, lastPt[1] + 3.5)
      }
      ctx.restore()
    }
  }

  // 6. Left edge fade
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const fadeGrad = ctx.createLinearGradient(layout.pad.left, 0, layout.pad.left + FADE_EDGE_WIDTH, 0)
  fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
  fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = fadeGrad
  ctx.fillRect(0, 0, layout.pad.left + FADE_EDGE_WIDTH, layout.h)
  ctx.restore()

  // 7. Multi-series crosshair — fade out near live dots (same logic as single-series)
  if (opts.hoverX !== null && opts.hoverTime !== null && opts.hoverEntries.length > 0 && allPts.length > 0 && opts.scrubAmount > 0.01) {
    // Find rightmost live dot X (skip hidden series)
    let maxLiveDotX = 0
    for (const entry of allPts) {
      if (entry.alpha < 0.01) continue
      const lastX = entry.pts[entry.pts.length - 1][0]
      if (lastX > maxLiveDotX) maxLiveDotX = lastX
    }

    const distToLive = maxLiveDotX - opts.hoverX
    const fadeStart = Math.min(80, layout.chartW * 0.3)
    const scrubOpacity = distToLive < CROSSHAIR_FADE_MIN_PX ? 0
      : distToLive >= fadeStart ? opts.scrubAmount
      : ((distToLive - CROSSHAIR_FADE_MIN_PX) / (fadeStart - CROSSHAIR_FADE_MIN_PX)) * opts.scrubAmount

    if (scrubOpacity > 0.01) {
      drawMultiCrosshair(
        ctx, layout, palette,
        opts.hoverX, opts.hoverTime,
        opts.hoverEntries,
        opts.formatValue, opts.formatTime,
        scrubOpacity,
        opts.tooltipY,
        opts.tooltipOutline,
        maxLiveDotX,
      )
    }
  }
}

// Re-exports for external use
export { drawGrid, type GridState } from './grid'
export { drawLine } from './line'
export { drawDot, drawArrows, drawSimpleDot, drawMultiDot } from './dot'
export { drawCrosshair, drawMultiCrosshair, type MultiSeriesHoverEntry } from './crosshair'
export { drawReferenceLine } from './referenceLine'
export { drawTimeAxis, type TimeAxisState } from './timeAxis'
export { drawOrderbook, type OrderbookState } from './orderbook'
export { drawParticles, spawnOnSwing, type ParticleState } from './particles'
export { drawEmpty } from './empty'
export { drawLoading } from './loading'
export { loadingY, loadingBreath, LOADING_AMPLITUDE_RATIO, LOADING_SCROLL_SPEED } from './loadingShape'
export { badgeSvgPath, badgePillOnly, BADGE_PAD_X, BADGE_PAD_Y, BADGE_TAIL_LEN, BADGE_TAIL_SPREAD, BADGE_LINE_H } from './badge'
