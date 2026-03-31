import type { LivelinePalette, ChartLayout, LivelinePoint, Momentum, ReferenceLine, OrderbookData, DegenOptions } from '../types'
import { drawGrid, type GridState } from './grid'
import { drawLine } from './line'
import { drawDot, drawArrows, drawSimpleDot, drawMultiDot, type ArrowState } from './dot'
import { drawCrosshair, drawMultiCrosshair, type MultiSeriesHoverEntry } from './crosshair'
import { drawReferenceLine } from './referenceLine'
import { drawTimeAxis, type TimeAxisState } from './timeAxis'
import { drawOrderbook, type OrderbookState } from './orderbook'
import { drawParticles, spawnOnSwing, type ParticleState } from './particles'
import { drawEmpty } from './empty'
import { drawLoading } from './loading'

// Re-export all draw functions and types
export { drawGrid, type GridState, createGridState } from './grid'
export { drawLine } from './line'
export { drawDot, drawArrows, drawSimpleDot, drawMultiDot, type ArrowState, createArrowState } from './dot'
export { drawCrosshair, drawMultiCrosshair, type MultiSeriesHoverEntry } from './crosshair'
export { drawReferenceLine } from './referenceLine'
export { drawTimeAxis, type TimeAxisState, createTimeAxisState } from './timeAxis'
export { drawOrderbook, type OrderbookState, createOrderbookState } from './orderbook'
export { drawParticles, spawnOnSwing, type ParticleState, createParticleState } from './particles'
export { drawEmpty } from './empty'
export { drawLoading } from './loading'
export { loadingY, loadingBreath, LOADING_AMPLITUDE_RATIO, LOADING_SCROLL_SPEED } from './loadingShape'
export { badgeSvgPath, badgePillOnly, BADGE_PAD_X, BADGE_PAD_Y, BADGE_TAIL_LEN, BADGE_TAIL_SPREAD, BADGE_LINE_H } from './badge'

// Constants
const SHAKE_DECAY_RATE = 0.002
const SHAKE_MIN_AMPLITUDE = 0.2
export const FADE_EDGE_WIDTH = 40
const CROSSHAIR_FADE_MIN_PX = 5

export interface ShakeState {
  amplitude: number  // current shake magnitude in px, decays each frame
}

export function createShakeState(): ShakeState {
  return { amplitude: 0 }
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

  const scrubX = opts.hoverX
  const chartRight = layout.w - layout.pad.right

  // 1. Grid (first, so it's behind everything)
  if (opts.showGrid) {
    ctx.globalAlpha = revealRamp(0.2, 0.6) * (1 - pause * 0.3)
    drawGrid(ctx, layout, palette, opts.formatValue, opts.gridState, opts.dt)
    ctx.globalAlpha = 1
  }

  // 2. Reference line (between grid and chart line)
  if (opts.referenceLine) {
    ctx.globalAlpha = revealRamp(0.3, 0.7)
    drawReferenceLine(ctx, layout, palette, opts.referenceLine)
    ctx.globalAlpha = 1
  }

  // 3. Line + fill
  ctx.globalAlpha = 1
  const pts = drawLine(
    ctx, layout, palette, opts.visible, opts.smoothValue,
    opts.now, opts.showFill, scrubX, opts.scrubAmount, reveal, opts.now_ms,
  )

  // 4. Particles (drawn on top of line, behind dot)
  if (opts.particleState) {
    drawParticles(ctx, opts.particleState, opts.dt)
  }

  // 5. Live dot (at the tip of the line)
  if (pts && pts.length > 0) {
    const [dotX, dotY] = pts[pts.length - 1]
    
    // Spawn particles on swing (before drawing dot)
    if (opts.particleState && opts.particleOptions) {
      const burstIntensity = spawnOnSwing(
        opts.particleState,
        opts.momentum,
        dotX, dotY,
        opts.swingMagnitude,
        palette.line,
        opts.dt,
        opts.particleOptions,
      )
      // Trigger shake on burst
      if (burstIntensity > 0 && shake) {
        shake.amplitude = Math.max(shake.amplitude, burstIntensity * 8)
      }
    }

    ctx.globalAlpha = revealRamp(0.4, 0.8)
    drawDot(ctx, dotX, dotY, palette, opts.showPulse, opts.scrubAmount, opts.now_ms)

    // Momentum arrows
    if (opts.showMomentum) {
      drawArrows(ctx, dotX, dotY, opts.momentum, palette, opts.arrowState, opts.dt, opts.now_ms)
    }
    ctx.globalAlpha = 1
  }

  // 6. Time axis
  ctx.globalAlpha = revealRamp(0.3, 0.7)
  drawTimeAxis(
    ctx, layout, palette, opts.windowSecs, opts.targetWindowSecs,
    opts.formatTime, opts.timeAxisState, opts.dt,
  )
  ctx.globalAlpha = 1

  // 7. Orderbook overlay
  if (opts.orderbookData && opts.orderbookState) {
    ctx.globalAlpha = revealRamp(0.5, 0.9)
    drawOrderbook(ctx, layout, palette, opts.orderbookData, opts.dt, opts.orderbookState, opts.swingMagnitude)
    ctx.globalAlpha = 1
  }

  // 8. Crosshair (on top of everything)
  if (scrubX !== null && opts.hoverValue !== null && opts.hoverTime !== null) {
    const liveDotX = pts && pts.length > 0 ? pts[pts.length - 1][0] : undefined
    // Edge fade — suppress crosshair when hovering near edges
    const fadeStart = layout.pad.left + CROSSHAIR_FADE_MIN_PX
    const fadeEnd = layout.pad.left + FADE_EDGE_WIDTH
    const leftFade = scrubX < fadeStart ? 0 : scrubX > fadeEnd ? 1 : (scrubX - fadeStart) / (fadeEnd - fadeStart)
    const rightStart = chartRight - FADE_EDGE_WIDTH
    const rightEnd = chartRight - CROSSHAIR_FADE_MIN_PX
    const rightFade = scrubX > rightEnd ? 0 : scrubX < rightStart ? 1 : (rightEnd - scrubX) / (rightEnd - rightStart)
    const edgeFade = Math.min(leftFade, rightFade)
    
    ctx.globalAlpha = opts.scrubAmount * edgeFade
    drawCrosshair(
      ctx, layout, palette, scrubX, opts.hoverValue, opts.hoverTime,
      opts.formatValue, opts.formatTime, opts.scrubAmount * edgeFade,
      opts.tooltipY, liveDotX, opts.tooltipOutline,
    )
    ctx.globalAlpha = 1
  }

  // Restore from shake transform
  if (shake && shake.amplitude > SHAKE_MIN_AMPLITUDE) {
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
  const reveal = opts.chartReveal
  const pause = opts.pauseProgress
  const palette = opts.primaryPalette
  const chartRight = layout.w - layout.pad.right

  const revealRamp = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (reveal - start) / (end - start)))
    return t * t * (3 - 2 * t)
  }

  // 1. Grid
  if (opts.showGrid) {
    ctx.globalAlpha = revealRamp(0.2, 0.6) * (1 - pause * 0.3)
    drawGrid(ctx, layout, palette, opts.formatValue, opts.gridState, opts.dt)
    ctx.globalAlpha = 1
  }

  // 2. Reference line
  if (opts.referenceLine) {
    ctx.globalAlpha = revealRamp(0.3, 0.7)
    drawReferenceLine(ctx, layout, palette, opts.referenceLine)
    ctx.globalAlpha = 1
  }

  // 3. Draw each series line + dot
  const allPts: { x: number; y: number; color: string }[] = []
  for (const s of opts.series) {
    const seriesAlpha = s.alpha ?? 1
    if (seriesAlpha < 0.01) continue

    ctx.globalAlpha = seriesAlpha
    const pts = drawLine(
      ctx, layout, s.palette, s.visible, s.smoothValue,
      opts.now, false, // no fill for multi-series
      opts.hoverX, opts.scrubAmount, reveal, opts.now_ms,
    )
    ctx.globalAlpha = 1

    if (pts && pts.length > 0) {
      const [dotX, dotY] = pts[pts.length - 1]
      allPts.push({ x: dotX, y: dotY, color: s.palette.line })
      ctx.globalAlpha = seriesAlpha * revealRamp(0.4, 0.8)
      drawMultiDot(ctx, dotX, dotY, s.palette.line, opts.showPulse, opts.now_ms)
      ctx.globalAlpha = 1
    }
  }

  // 4. Time axis
  ctx.globalAlpha = revealRamp(0.3, 0.7)
  drawTimeAxis(
    ctx, layout, palette, opts.windowSecs, opts.targetWindowSecs,
    opts.formatTime, opts.timeAxisState, opts.dt,
  )
  ctx.globalAlpha = 1

  // 5. Multi-crosshair
  if (opts.hoverX !== null && opts.hoverTime !== null && opts.hoverEntries.length > 0) {
    const liveDotX = allPts.length > 0 ? Math.max(...allPts.map(p => p.x)) : undefined
    // Edge fade
    const fadeStart = layout.pad.left + CROSSHAIR_FADE_MIN_PX
    const fadeEnd = layout.pad.left + FADE_EDGE_WIDTH
    const leftFade = opts.hoverX < fadeStart ? 0 : opts.hoverX > fadeEnd ? 1 : (opts.hoverX - fadeStart) / (fadeEnd - fadeStart)
    const rightStart = chartRight - FADE_EDGE_WIDTH
    const rightEnd = chartRight - CROSSHAIR_FADE_MIN_PX
    const rightFade = opts.hoverX > rightEnd ? 0 : opts.hoverX < rightStart ? 1 : (rightEnd - opts.hoverX) / (rightEnd - rightStart)
    const edgeFade = Math.min(leftFade, rightFade)

    ctx.globalAlpha = opts.scrubAmount * edgeFade
    drawMultiCrosshair(
      ctx, layout, palette, opts.hoverX, opts.hoverTime,
      opts.hoverEntries, opts.formatValue, opts.formatTime,
      opts.scrubAmount * edgeFade, opts.tooltipY, opts.tooltipOutline, liveDotX,
    )
    ctx.globalAlpha = 1
  }
}
