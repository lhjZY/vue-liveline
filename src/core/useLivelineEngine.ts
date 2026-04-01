import { onMounted, onUnmounted, type Ref, type ShallowRef } from 'vue'
import type { LivelinePoint, LivelinePalette, Momentum, ReferenceLine, HoverPoint, Padding, ChartLayout, OrderbookData, DegenOptions, BadgeVariant } from './types'
import { lerp } from './math/lerp'
import { computeRange } from './math/range'
import { detectMomentum } from './math/momentum'
import { interpolateAtTime } from './math/interpolate'
import { getDpr, applyDpr } from './canvas/dpr'
import {
  drawFrame, drawMultiFrame, FADE_EDGE_WIDTH,
  createGridState, createTimeAxisState, createOrderbookState,
  createParticleState, createShakeState, createArrowState,
  type GridState, type TimeAxisState, type OrderbookState, type ParticleState, type ShakeState, type ArrowState,
  type MultiSeriesEntry,
} from './draw'
import { drawLoading } from './draw/loading'
import { drawEmpty } from './draw/empty'
import { badgeSvgPath, badgePillOnly, BADGE_PAD_X, BADGE_PAD_Y, BADGE_TAIL_LEN, BADGE_TAIL_SPREAD, BADGE_LINE_H } from './draw/badge'

export interface EngineConfig {
  data: LivelinePoint[]
  value: number
  palette: LivelinePalette
  windowSecs: number
  lerpSpeed: number
  showGrid: boolean
  showBadge: boolean
  showMomentum: boolean
  momentumOverride?: Momentum
  showFill: boolean
  referenceLine?: ReferenceLine
  formatValue: (v: number) => string
  formatTime: (t: number) => string
  padding: Required<Padding>
  onHover?: (point: HoverPoint | null) => void
  showPulse: boolean
  scrub: boolean
  exaggerate: boolean
  degenOptions?: DegenOptions
  badgeTail: boolean
  badgeVariant: BadgeVariant
  tooltipY: number
  tooltipOutline: boolean
  valueMomentumColor: boolean
  valueDisplayRef?: Ref<HTMLSpanElement | null>
  orderbookData?: OrderbookData
  loading?: boolean
  paused?: boolean
  emptyText?: string

  // Multi-series mode
  multiSeries?: Array<{
    id: string
    data: LivelinePoint[]
    value: number
    palette: LivelinePalette
    label?: string
  }>
  isMultiSeries?: boolean
  hiddenSeriesIds?: Set<string>
}

interface BadgeEls {
  container: HTMLDivElement
  svg: SVGSVGElement
  path: SVGPathElement
  text: HTMLSpanElement
  displayW: number
  targetW: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

// --- Constants ---
const MAX_DELTA_MS = 50
const SCRUB_LERP_SPEED = 0.12
const BADGE_WIDTH_LERP = 0.15
const BADGE_Y_LERP = 0.35
const BADGE_Y_LERP_TRANSITIONING = 0.5
const MOMENTUM_COLOR_LERP = 0.12
const WINDOW_TRANSITION_MS = 750
const WINDOW_BUFFER = 0.05
const WINDOW_BUFFER_NO_BADGE = 0.015
const VALUE_SNAP_THRESHOLD = 0.001
const ADAPTIVE_SPEED_BOOST = 0.2
const MOMENTUM_GREEN: [number, number, number] = [34, 197, 94]
const MOMENTUM_RED: [number, number, number] = [239, 68, 68]
const CHART_REVEAL_SPEED = 0.14
const CHART_REVEAL_SPEED_FWD = 0.09
const PAUSE_PROGRESS_SPEED = 0.12
const PAUSE_CATCHUP_SPEED = 0.08
const PAUSE_CATCHUP_SPEED_FAST = 0.22
const LOADING_ALPHA_SPEED = 0.14
const SERIES_TOGGLE_SPEED = 0.10

// --- Extracted helper functions (pure computation, called inside draw loop) ---

interface WindowTransState {
  from: number; to: number; startMs: number
  rangeFromMin: number; rangeFromMax: number; rangeToMin: number; rangeToMax: number
}

/** Lerp display value with adaptive speed — slow for big jumps, fast for small ticks. */
function computeAdaptiveSpeed(
  value: number,
  displayValue: number,
  displayMin: number,
  displayMax: number,
  lerpSpeed: number,
  noMotion: boolean,
): number {
  const valGap = Math.abs(value - displayValue)
  const prevRange = displayMax - displayMin || 1
  const gapRatio = Math.min(valGap / prevRange, 1)
  return noMotion ? 1 : lerpSpeed + (1 - gapRatio) * ADAPTIVE_SPEED_BOOST
}

/** Update window transition state, returning current display window and transition progress. */
function updateWindowTransition(
  cfg: EngineConfig,
  wt: WindowTransState,
  displayWindow: number,
  displayMin: number,
  displayMax: number,
  noMotion: boolean,
  now_ms: number,
  now: number,
  points: LivelinePoint[],
  smoothValue: number,
  buffer: number,
): { windowSecs: number; windowTransProgress: number } {
  if (wt.to !== cfg.windowSecs) {
    wt.from = displayWindow
    wt.to = cfg.windowSecs
    wt.startMs = now_ms
    wt.rangeFromMin = displayMin
    wt.rangeFromMax = displayMax
    const targetRightEdge = now + cfg.windowSecs * buffer
    const targetLeftEdge = targetRightEdge - cfg.windowSecs
    const targetVisible: LivelinePoint[] = []
    for (const p of points) {
      if (p.time >= targetLeftEdge - 2 && p.time <= targetRightEdge) {
        targetVisible.push(p)
      }
    }
    if (targetVisible.length > 0) {
      const targetRange = computeRange(targetVisible, smoothValue, cfg.referenceLine?.value, cfg.exaggerate)
      wt.rangeToMin = targetRange.min
      wt.rangeToMax = targetRange.max
    }
  }

  let windowTransProgress = 0
  let resultWindow: number
  if (noMotion || wt.startMs === 0) {
    resultWindow = cfg.windowSecs
  } else {
    const elapsed = now_ms - wt.startMs
    const duration = WINDOW_TRANSITION_MS
    const t = Math.min(elapsed / duration, 1)
    const eased = (1 - Math.cos(t * Math.PI)) / 2
    windowTransProgress = eased
    const logFrom = Math.log(wt.from)
    const logTo = Math.log(wt.to)
    resultWindow = Math.exp(logFrom + (logTo - logFrom) * eased)
    if (t >= 1) {
      resultWindow = cfg.windowSecs
      wt.startMs = 0
      windowTransProgress = 0
    }
  }

  return { windowSecs: resultWindow, windowTransProgress }
}

/** Smooth Y range with lerp. During window transitions, interpolates between pre-computed ranges. */
function updateRange(
  computedRange: { min: number; max: number },
  rangeInited: boolean,
  targetMin: number,
  targetMax: number,
  displayMin: number,
  displayMax: number,
  isTransitioning: boolean,
  windowTransProgress: number,
  wt: WindowTransState,
  adaptiveSpeed: number,
  chartH: number,
  dt: number,
): { minVal: number; maxVal: number; valRange: number; targetMin: number; targetMax: number; displayMin: number; displayMax: number; rangeInited: boolean } {
  if (!rangeInited) {
    return {
      minVal: computedRange.min, maxVal: computedRange.max,
      valRange: (computedRange.max - computedRange.min) || 0.001,
      targetMin: computedRange.min, targetMax: computedRange.max,
      displayMin: computedRange.min, displayMax: computedRange.max,
      rangeInited: true,
    }
  }

  if (isTransitioning) {
    displayMin = wt.rangeFromMin + (wt.rangeToMin - wt.rangeFromMin) * windowTransProgress
    displayMax = wt.rangeFromMax + (wt.rangeToMax - wt.rangeFromMax) * windowTransProgress
    targetMin = computedRange.min
    targetMax = computedRange.max
  } else {
    const curRange = displayMax - displayMin
    targetMin = computedRange.min
    targetMax = computedRange.max
    displayMin = lerp(displayMin, targetMin, adaptiveSpeed, dt)
    displayMax = lerp(displayMax, targetMax, adaptiveSpeed, dt)
    const pxThreshold = 0.5 * curRange / chartH || 0.001
    if (Math.abs(displayMin - targetMin) < pxThreshold) displayMin = targetMin
    if (Math.abs(displayMax - targetMax) < pxThreshold) displayMax = targetMax
  }

  return {
    minVal: displayMin, maxVal: displayMax,
    valRange: (displayMax - displayMin) || 0.001,
    targetMin, targetMax, displayMin, displayMax,
    rangeInited: true,
  }
}

/** Compute hover position, interpolated value, and scrub amount. */
function updateHoverState(
  hoverPixelX: number | null,
  pad: Required<Padding>,
  w: number,
  layout: ChartLayout,
  now: number,
  visible: LivelinePoint[],
  scrubAmount: number,
  lastHover: { x: number; value: number; time: number } | null,
  cfg: EngineConfig,
  noMotion: boolean,
  leftEdge: number,
  rightEdge: number,
  chartW: number,
  dt: number,
): {
  hoverX: number | null; hoverValue: number | null; hoverTime: number | null
  scrubAmount: number; isActiveHover: boolean
  lastHover: { x: number; value: number; time: number } | null
} {
  let hoverValue: number | null = null
  let hoverTime: number | null = null
  let hoverChartX: number | null = null
  let isActiveHover = false

  if (hoverPixelX !== null && hoverPixelX >= pad.left && hoverPixelX <= w - pad.right) {
    const maxHoverX = layout.toX(now)
    const clampedX = Math.min(hoverPixelX, maxHoverX)
    const t = leftEdge + ((clampedX - pad.left) / chartW) * (rightEdge - leftEdge)
    const v = interpolateAtTime(visible, t)
    if (v !== null) {
      hoverValue = v
      hoverTime = t
      hoverChartX = clampedX
      isActiveHover = true
      lastHover = { x: clampedX, value: v, time: t }
      cfg.onHover?.({ time: t, value: v, x: clampedX, y: layout.toY(v) })
    }
  }

  // Lerp scrub amount
  const scrubTarget = isActiveHover ? 1 : 0
  if (noMotion) {
    scrubAmount = scrubTarget
  } else {
    scrubAmount += (scrubTarget - scrubAmount) * SCRUB_LERP_SPEED
    if (scrubAmount < 0.01) scrubAmount = 0
    if (scrubAmount > 0.99) scrubAmount = 1
  }

  // Use last known position during fade-out
  let drawHoverX = hoverChartX
  let drawHoverValue = hoverValue
  let drawHoverTime = hoverTime
  if (!isActiveHover && scrubAmount > 0 && lastHover) {
    drawHoverX = lastHover.x
    drawHoverValue = lastHover.value
    drawHoverTime = lastHover.time
  }

  return {
    hoverX: drawHoverX, hoverValue: drawHoverValue, hoverTime: drawHoverTime,
    scrubAmount, isActiveHover, lastHover,
  }
}

/** Update badge DOM element — text, width lerp, SVG path, position, color. */
function updateBadgeDOM(
  badge: BadgeEls,
  cfg: EngineConfig,
  smoothValue: number,
  layout: ChartLayout,
  momentum: Momentum,
  badgeY: number | null,
  badgeColor: { green: number },
  isWindowTransitioning: boolean,
  noMotion: boolean,
  ctx: CanvasRenderingContext2D,
  dt: number,
  chartReveal: number = 1,
): number | null /* updated badgeY */ {
  if (!cfg.showBadge || chartReveal < 0.25) {
    badge.container.style.display = 'none'
    return badgeY
  }

  badge.container.style.display = ''
  const badgeOpacity = chartReveal < 0.5 ? (chartReveal - 0.25) / 0.25 : 1
  badge.container.style.opacity = badgeOpacity < 1 ? String(badgeOpacity) : ''
  const { w, h, pad } = layout

  const text = cfg.formatValue(smoothValue)
  badge.text.textContent = text
  badge.text.style.font = cfg.palette.labelFont
  badge.text.style.lineHeight = `${BADGE_LINE_H}px`
  const tailLen = cfg.badgeTail ? BADGE_TAIL_LEN : 0
  badge.text.style.padding = `${BADGE_PAD_Y}px ${BADGE_PAD_X}px ${BADGE_PAD_Y}px ${tailLen + BADGE_PAD_X}px`

  // Measure target text width using canvas (template with widest digits)
  ctx.font = cfg.palette.labelFont
  const template = text.replace(/[0-9]/g, '8')
  const targetTextW = ctx.measureText(template).width

  // Smooth-lerp the badge width
  badge.targetW = targetTextW
  if (badge.displayW === 0) badge.displayW = targetTextW
  badge.displayW = lerp(badge.displayW, badge.targetW, BADGE_WIDTH_LERP, dt)
  if (Math.abs(badge.displayW - badge.targetW) < 0.3) badge.displayW = badge.targetW
  const textW = badge.displayW

  const pillW = textW + BADGE_PAD_X * 2
  const pillH = BADGE_LINE_H + BADGE_PAD_Y * 2

  const totalW = tailLen + pillW
  badge.svg.setAttribute('width', String(Math.ceil(totalW)))
  badge.svg.setAttribute('height', String(pillH))
  badge.svg.setAttribute('viewBox', `0 0 ${totalW} ${pillH}`)
  badge.path.setAttribute('d', cfg.badgeTail
    ? badgeSvgPath(pillW, pillH, BADGE_TAIL_LEN, BADGE_TAIL_SPREAD)
    : badgePillOnly(pillW, pillH))

  // Badge Y lerp — decoupled from range/value math, morphed during reveal
  const centerY = pad.top + layout.chartH / 2
  const realTargetY = Math.max(pad.top, Math.min(h - pad.bottom, layout.toY(smoothValue)))
  const targetBadgeY = chartReveal < 1
    ? centerY + (realTargetY - centerY) * chartReveal
    : realTargetY
  if (badgeY === null || noMotion) {
    badgeY = targetBadgeY
  } else {
    const badgeSpeed = isWindowTransitioning ? BADGE_Y_LERP_TRANSITIONING : BADGE_Y_LERP
    badgeY = lerp(badgeY, targetBadgeY, badgeSpeed, dt)
  }

  const badgeLeft = w - pad.right + 8 - BADGE_PAD_X - tailLen
  const badgeTop = badgeY - pillH / 2
  badge.container.style.transform = `translate3d(${badgeLeft}px, ${badgeTop}px, 0)`

  // Badge styling
  if (cfg.badgeVariant === 'minimal') {
    badge.path.setAttribute('fill', cfg.palette.badgeOuterBg)
    badge.text.style.color = cfg.palette.tooltipText
    badge.container.style.filter = `drop-shadow(0 1px 4px ${cfg.palette.badgeOuterShadow})`
  } else {
    badge.container.style.filter = ''
    badge.text.style.color = '#fff'
    const bs = badgeColor
    let fillColor: string
    if (!cfg.showMomentum) {
      fillColor = cfg.palette.line
    } else {
      const target = momentum === 'up' ? 1 : momentum === 'down' ? 0 : bs.green
      bs.green = noMotion ? target : lerp(bs.green, target, MOMENTUM_COLOR_LERP, dt)
      if (bs.green > 0.99) bs.green = 1
      if (bs.green < 0.01) bs.green = 0
      const g = bs.green
      const rr = Math.round(MOMENTUM_RED[0] + (MOMENTUM_GREEN[0] - MOMENTUM_RED[0]) * g)
      const gg = Math.round(MOMENTUM_RED[1] + (MOMENTUM_GREEN[1] - MOMENTUM_RED[1]) * g)
      const bb = Math.round(MOMENTUM_RED[2] + (MOMENTUM_GREEN[2] - MOMENTUM_RED[2]) * g)
      fillColor = `rgb(${rr},${gg},${bb})`
    }
    badge.path.setAttribute('fill', fillColor)
  }

  return badgeY
}

export function useLivelineEngine(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLDivElement | null>,
  configRef: ShallowRef<EngineConfig>,
) {
  // --- Animation state (mutable closure variables) ---
  let animationId: number | null = null
  let lastFrameTime = 0

  // Display values
  let smoothValue = configRef.value.value
  let displayValues = new Map<string, number>()
  let displayMin = 0
  let displayMax = 0
  let targetMin = 0
  let targetMax = 0
  let rangeInited = false

  // Window
  let displayWindowSecs = configRef.value.windowSecs
  let windowTransition: WindowTransState = {
    from: configRef.value.windowSecs, to: configRef.value.windowSecs, startMs: 0,
    rangeFromMin: 0, rangeFromMax: 0, rangeToMin: 0, rangeToMax: 0,
  }

  // Hover
  let hoverPixelX: number | null = null
  let scrubAmount = 0
  let lastHover: { x: number; value: number; time: number } | null = null
  let lastHoverEntries: { color: string; label: string; value: number }[] = []

  // Reveal + loading
  let chartReveal = 0
  let loadingAlpha = configRef.value.loading ? 1 : 0

  // Pause
  let pauseProgress = 0
  let timeDebt = 0

  // Data stash (reverse morph animation)
  let lastData: LivelinePoint[] = []
  let lastMultiSeries: Array<{ id: string; data: LivelinePoint[]; value: number; palette: LivelinePalette; label?: string }> = []
  let frozenNow = 0

  // Pause data snapshot
  let pausedData: LivelinePoint[] | null = null
  let pausedMultiData: Map<string, { data: LivelinePoint[]; value: number }> | null = null

  // Badge
  let badgeEls: BadgeEls | null = null
  let badgeDisplayY: number | null = null
  let badgeColor = { green: 1 }

  // Multi-series
  let seriesAlphas = new Map<string, number>()

  // Engine states
  let reducedMotion = false
  let cachedCtx: CanvasRenderingContext2D | null = null
  let sizeW = 0
  let sizeH = 0
  let swingMagnitude = 0

  // Draw states
  const gridState: GridState = createGridState()
  const timeAxisState: TimeAxisState = createTimeAxisState()
  const arrowState: ArrowState = createArrowState()
  let orderbookState: OrderbookState | null = null
  let particleState: ParticleState | null = null
  let shakeState: ShakeState | null = null

  // --- Render loop ---
  function render() {
    // Tab visibility check
    if (document.hidden) {
      animationId = 0
      return
    }

    const canvas = canvasRef.value
    const w = sizeW
    const h = sizeH

    if (!canvas || w === 0 || h === 0) {
      animationId = requestAnimationFrame(render)
      return
    }

    const cfg = configRef.value
    const dpr = getDpr()

    // Delta time for frame-rate-independent lerps
    const now_ms = performance.now()
    const dt = lastFrameTime ? Math.min(now_ms - lastFrameTime, MAX_DELTA_MS) : 16.67
    lastFrameTime = now_ms

    // Resize canvas if needed
    const targetW = Math.round(w * dpr)
    const targetH = Math.round(h * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }

    // Canvas context caching
    if (!cachedCtx || cachedCtx.canvas !== canvas) {
      cachedCtx = canvas.getContext('2d')
    }
    if (!cachedCtx) {
      animationId = requestAnimationFrame(render)
      return
    }
    const ctx = cachedCtx

    applyDpr(ctx, dpr, w, h)

    // Reduced motion: use speed=1 to skip all lerps (instant snap)
    const noMotion = reducedMotion

    // --- Pause data snapshot ---
    if (cfg.isMultiSeries && cfg.multiSeries) {
      if (cfg.paused && pausedMultiData === null) {
        const snap = new Map<string, { data: LivelinePoint[]; value: number }>()
        for (const s of cfg.multiSeries) {
          if (s.data.length >= 2) snap.set(s.id, { data: s.data.slice(), value: s.value })
        }
        if (snap.size > 0) pausedMultiData = snap
      }
      if (!cfg.paused) {
        pausedMultiData = null
      }
    } else {
      if (cfg.paused && pausedData === null && cfg.data.length >= 2) {
        pausedData = cfg.data.slice()
      }
      if (!cfg.paused) {
        pausedData = null
      }
    }

    const points = pausedData ?? cfg.data
    const hasMultiData = cfg.isMultiSeries && cfg.multiSeries ? cfg.multiSeries.some(s => s.data.length >= 2) : false
    const hasData = hasMultiData || points.length >= 2
    const pad = cfg.padding
    const chartH = h - pad.top - pad.bottom

    // --- Pause time management ---
    const pauseTarget = cfg.paused ? 1 : 0
    pauseProgress = noMotion
      ? pauseTarget
      : lerp(pauseProgress, pauseTarget, PAUSE_PROGRESS_SPEED, dt)
    if (pauseProgress < 0.005) pauseProgress = 0
    if (pauseProgress > 0.995) pauseProgress = 1
    const pausedDt = dt * (1 - pauseProgress)

    const realDtSec = dt / 1000
    timeDebt += realDtSec * pauseProgress
    if (!cfg.paused && timeDebt > 0.001) {
      const catchUpSpeed = timeDebt > 10
        ? PAUSE_CATCHUP_SPEED_FAST
        : PAUSE_CATCHUP_SPEED
      timeDebt = lerp(timeDebt, 0, catchUpSpeed, dt)
      if (timeDebt < 0.01) timeDebt = 0
    }

    // --- Loading alpha (loading ↔ empty crossfade) ---
    const loadingTarget = cfg.loading ? 1 : 0
    loadingAlpha = noMotion
      ? loadingTarget
      : lerp(loadingAlpha, loadingTarget, LOADING_ALPHA_SPEED, dt)
    if (loadingAlpha < 0.01) loadingAlpha = 0
    if (loadingAlpha > 0.99) loadingAlpha = 1

    // --- Chart reveal (loading/empty → data morph) ---
    const revealTarget = (!cfg.loading && hasData) ? 1 : 0
    chartReveal = noMotion
      ? revealTarget
      : lerp(chartReveal, revealTarget,
          revealTarget === 1 ? CHART_REVEAL_SPEED_FWD : CHART_REVEAL_SPEED, dt)
    if (Math.abs(chartReveal - revealTarget) < 0.005) {
      chartReveal = revealTarget
    }

    // Reset range when reveal fully collapses
    if (chartReveal < 0.01) {
      rangeInited = false
    }

    // Data stash for reverse morph
    let useStash: boolean
    let useMultiStash = false

    // Multi-series stash
    useMultiStash = !hasData && chartReveal > 0.005 && lastMultiSeries.length > 0
    if (hasMultiData && cfg.multiSeries) {
      lastMultiSeries = cfg.multiSeries.map(s => ({
        id: s.id, data: s.data.slice(), value: s.value, palette: s.palette, label: s.label,
      }))
    }
    // Clear multi stash when single-series data arrives
    if (hasData && !cfg.isMultiSeries) lastMultiSeries = []

    useStash = !useMultiStash && !hasData && chartReveal > 0.005 && lastData.length >= 2
    if (hasData && !cfg.isMultiSeries) lastData = points

    if (!hasData && !useStash && !useMultiStash) {
      // No chart pipeline — draw loading or empty as the sole visual.
      // Grey loading line for multi-series (no single accent color)
      const loadingColor = (cfg.isMultiSeries || lastMultiSeries.length > 0)
        ? cfg.palette.gridLabel
        : undefined
      if (loadingAlpha > 0.01) {
        drawLoading(ctx, w, h, pad, cfg.palette, now_ms, loadingAlpha, loadingColor)
      }
      if ((1 - loadingAlpha) > 0.01) {
        drawEmpty(ctx, w, h, pad, cfg.palette, 1 - loadingAlpha, now_ms, false, cfg.emptyText)
      }
      // Left-edge fade
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      const fadeGrad = ctx.createLinearGradient(pad.left, 0, pad.left + FADE_EDGE_WIDTH, 0)
      fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
      fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = fadeGrad
      ctx.fillRect(0, 0, pad.left + FADE_EDGE_WIDTH, h)
      ctx.restore()

      if (badgeEls) badgeEls.container.style.display = 'none'
      animationId = requestAnimationFrame(render)
      return
    }

    if ((cfg.isMultiSeries && cfg.multiSeries && cfg.multiSeries.length > 0) || useMultiStash) {
    // ═══════════════════════════════════════════════════════
    // MULTI-SERIES LINE MODE PIPELINE
    // ═══════════════════════════════════════════════════════

    const effectiveMultiSeries = useMultiStash ? lastMultiSeries : cfg.multiSeries!

    // Reserve right-side space for endpoint labels
    let labelReserve = 0
    if (effectiveMultiSeries.some(s => s.label)) {
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif'
      let maxLabelW = 0
      for (const s of effectiveMultiSeries) {
        if (s.label) {
          const lw = ctx.measureText(s.label).width
          if (lw > maxLabelW) maxLabelW = lw
        }
      }
      labelReserve = Math.max(0, maxLabelW - 2) * chartReveal
    }

    const chartW = w - pad.left - pad.right - labelReserve
    const buffer = cfg.showBadge ? WINDOW_BUFFER : WINDOW_BUFFER_NO_BADGE

    // Clean stale entries from displayValues
    if (!useMultiStash) {
      const currentIds = new Set(effectiveMultiSeries.map(s => s.id))
      for (const key of displayValues.keys()) {
        if (!currentIds.has(key)) displayValues.delete(key)
      }
    }

    // Use first series data for window transition seeding
    const firstSeries = effectiveMultiSeries[0]
    const transition = windowTransition
    if (hasData) frozenNow = Date.now() / 1000 - timeDebt
    const now = useMultiStash ? frozenNow : Date.now() / 1000 - timeDebt

    // Per-series smooth values (freeze when using stash)
    const smoothValues = new Map<string, number>()
    for (const s of effectiveMultiSeries) {
      let dv = displayValues.get(s.id)
      if (dv === undefined) dv = s.value
      if (!useMultiStash) {
        const adaptiveSpeed = computeAdaptiveSpeed(
          s.value, dv,
          displayMin, displayMax,
          cfg.lerpSpeed, noMotion,
        )
        dv = lerp(dv, s.value, adaptiveSpeed, pausedDt)
        const prevRange = displayMax - displayMin || 1
        if (Math.abs(dv - s.value) < prevRange * VALUE_SNAP_THRESHOLD) dv = s.value
        displayValues.set(s.id, dv)
      }
      smoothValues.set(s.id, dv)
    }

    // Per-series visibility alpha
    const hiddenIds = cfg.hiddenSeriesIds
    for (const s of effectiveMultiSeries) {
      let alpha = seriesAlphas.get(s.id) ?? 1
      const target = hiddenIds?.has(s.id) ? 0 : 1
      alpha = noMotion ? target : lerp(alpha, target, SERIES_TOGGLE_SPEED, pausedDt)
      if (alpha < 0.01) alpha = 0
      if (alpha > 0.99) alpha = 1
      seriesAlphas.set(s.id, alpha)
    }

    // Window transition
    const firstData = pausedMultiData?.get(firstSeries.id)?.data ?? firstSeries.data
    const windowResult = updateWindowTransition(
      cfg, transition, displayWindowSecs,
      displayMin, displayMax,
      noMotion, now_ms, now, firstData, smoothValues.get(firstSeries.id) ?? firstSeries.value, buffer,
    )
    // Override range target with union of ALL series
    if (transition.startMs > 0 && effectiveMultiSeries.length > 1) {
      const targetRightEdge = now + cfg.windowSecs * buffer
      const targetLeftEdge = targetRightEdge - cfg.windowSecs
      let unionMin = Infinity
      let unionMax = -Infinity
      for (const s of effectiveMultiSeries) {
        const sData = pausedMultiData?.get(s.id)?.data ?? s.data
        const sv = smoothValues.get(s.id) ?? s.value
        const targetVisible: LivelinePoint[] = []
        for (const p of sData) {
          if (p.time >= targetLeftEdge - 2 && p.time <= targetRightEdge) targetVisible.push(p)
        }
        if (targetVisible.length > 0) {
          const range = computeRange(targetVisible, sv, cfg.referenceLine?.value, cfg.exaggerate)
          if (range.min < unionMin) unionMin = range.min
          if (range.max > unionMax) unionMax = range.max
        }
      }
      if (isFinite(unionMin) && isFinite(unionMax)) {
        transition.rangeToMin = unionMin
        transition.rangeToMax = unionMax
      }
    }
    displayWindowSecs = windowResult.windowSecs
    const windowSecs = windowResult.windowSecs
    const windowTransProgress = windowResult.windowTransProgress
    const isWindowTransitioning = transition.startMs > 0

    const rightEdge = now + windowSecs * buffer
    const leftEdge = rightEdge - windowSecs
    const filterRight = rightEdge - (rightEdge - now) * pauseProgress

    // Build per-series visible arrays and compute global range
    const seriesEntries: MultiSeriesEntry[] = []
    let globalMin = Infinity
    let globalMax = -Infinity
    for (const s of effectiveMultiSeries) {
      const snap = pausedMultiData?.get(s.id)
      const seriesData = snap?.data ?? s.data
      const visible: LivelinePoint[] = []
      for (const p of seriesData) {
        if (p.time >= leftEdge - 2 && p.time <= filterRight) visible.push(p)
      }
      const sv = smoothValues.get(s.id) ?? s.value
      const alpha = seriesAlphas.get(s.id) ?? 1
      if (visible.length >= 2) {
        if (alpha > 0.01) {
          const range = computeRange(visible, sv, cfg.referenceLine?.value, cfg.exaggerate)
          if (range.min < globalMin) globalMin = range.min
          if (range.max > globalMax) globalMax = range.max
        }
        seriesEntries.push({ visible, smoothValue: sv, palette: s.palette, label: s.label, alpha })
      }
    }

    if (seriesEntries.length === 0) {
      // No visible data — draw loading/empty fallback
      if (loadingAlpha > 0.01) {
        drawLoading(ctx, w, h, pad, cfg.palette, now_ms, loadingAlpha, cfg.palette.gridLabel)
      }
      if ((1 - loadingAlpha) > 0.01) {
        drawEmpty(ctx, w, h, pad, cfg.palette, 1 - loadingAlpha, now_ms, false, cfg.emptyText)
      }
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      const fadeGrad = ctx.createLinearGradient(pad.left, 0, pad.left + FADE_EDGE_WIDTH, 0)
      fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)')
      fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = fadeGrad
      ctx.fillRect(0, 0, pad.left + FADE_EDGE_WIDTH, h)
      ctx.restore()
      if (badgeEls) badgeEls.container.style.display = 'none'
      animationId = requestAnimationFrame(render)
      return
    }

    // Smooth global range
    const computedRange = { min: isFinite(globalMin) ? globalMin : 0, max: isFinite(globalMax) ? globalMax : 1 }
    const adaptiveSpeed = cfg.lerpSpeed + ADAPTIVE_SPEED_BOOST * 0.5
    const rangeResult = updateRange(
      computedRange, rangeInited,
      targetMin, targetMax,
      displayMin, displayMax,
      isWindowTransitioning, windowTransProgress, transition,
      adaptiveSpeed, chartH, pausedDt,
    )
    rangeInited = rangeResult.rangeInited
    targetMin = rangeResult.targetMin
    targetMax = rangeResult.targetMax
    displayMin = rangeResult.displayMin
    displayMax = rangeResult.displayMax
    const { minVal, maxVal, valRange } = rangeResult

    const layout: ChartLayout = {
      w, h, pad,
      chartW, chartH,
      leftEdge, rightEdge,
      minVal, maxVal, valRange,
      toX: (t: number) => pad.left + ((t - leftEdge) / (rightEdge - leftEdge)) * chartW,
      toY: (v: number) => pad.top + (1 - (v - minVal) / valRange) * chartH,
    }

    // Hover — interpolate value at hover time for each series
    const hoverPx = hoverPixelX
    let drawHoverX: number | null = null
    let drawHoverTime: number | null = null
    let isActiveHover = false
    let hoverEntries: { color: string; label: string; value: number }[] = []

    if (hoverPx !== null && hoverPx >= pad.left && hoverPx <= w - pad.right) {
      const maxHoverX = layout.toX(now)
      const clampedX = Math.min(hoverPx, maxHoverX)
      const t = leftEdge + ((clampedX - pad.left) / chartW) * (rightEdge - leftEdge)
      drawHoverX = clampedX
      drawHoverTime = t
      isActiveHover = true

      for (const entry of seriesEntries) {
        if ((entry.alpha ?? 1) < 0.5) continue
        const v = interpolateAtTime(entry.visible, t)
        if (v !== null) {
          hoverEntries.push({ color: entry.palette.line, label: entry.label ?? '', value: v })
        }
      }
      lastHover = { x: clampedX, value: hoverEntries[0]?.value ?? 0, time: t }
      lastHoverEntries = hoverEntries
      cfg.onHover?.({ time: t, value: hoverEntries[0]?.value ?? 0, x: clampedX, y: layout.toY(hoverEntries[0]?.value ?? 0) })
    }

    // Scrub amount
    const scrubTarget = isActiveHover ? 1 : 0
    if (noMotion) {
      scrubAmount = scrubTarget
    } else {
      scrubAmount += (scrubTarget - scrubAmount) * SCRUB_LERP_SPEED
      if (scrubAmount < 0.01) scrubAmount = 0
      if (scrubAmount > 0.99) scrubAmount = 1
    }

    // Fade-out: use last known hover position + cached entries
    if (!isActiveHover && scrubAmount > 0 && lastHover) {
      drawHoverX = lastHover.x
      drawHoverTime = lastHover.time
      hoverEntries = lastHoverEntries
    }

    // Draw multi-series frame
    drawMultiFrame(ctx, layout, {
      series: seriesEntries,
      now,
      showGrid: cfg.showGrid,
      showPulse: cfg.showPulse,
      referenceLine: cfg.referenceLine,
      hoverX: drawHoverX,
      hoverTime: drawHoverTime,
      hoverEntries,
      scrubAmount,
      windowSecs,
      formatValue: cfg.formatValue,
      formatTime: cfg.formatTime,
      gridState,
      timeAxisState,
      dt,
      targetWindowSecs: cfg.windowSecs,
      tooltipY: cfg.tooltipY,
      tooltipOutline: cfg.tooltipOutline,
      chartReveal,
      pauseProgress,
      now_ms,
      primaryPalette: cfg.palette,
    })

    // During reverse morph, overlay the empty text
    const bgAlpha = 1 - chartReveal
    if (bgAlpha > 0.01 && revealTarget === 0 && !cfg.loading) {
      const bgEmptyAlpha = (1 - loadingAlpha) * bgAlpha
      if (bgEmptyAlpha > 0.01) {
        drawEmpty(ctx, w, h, pad, cfg.palette, bgEmptyAlpha, now_ms, true, cfg.emptyText)
      }
    }

    // Hide badge in multi-series mode
    if (badgeEls) badgeEls.container.style.display = 'none'

    } else {
    // ═══════════════════════════════════════════════════════
    // LINE MODE PIPELINE (single series)
    // ═══════════════════════════════════════════════════════

    const effectivePoints = useStash ? lastData : points

    // Adaptive speed + smooth value (freeze lerp when using stashed data)
    const adaptiveSpeed = computeAdaptiveSpeed(
      cfg.value, smoothValue,
      displayMin, displayMax,
      cfg.lerpSpeed, noMotion,
    )
    if (!useStash) {
      smoothValue = lerp(smoothValue, cfg.value, adaptiveSpeed, pausedDt)
      // Skip snap when pausing
      if (pauseProgress < 0.5) {
        const prevRange = displayMax - displayMin || 1
        if (Math.abs(smoothValue - cfg.value) < prevRange * VALUE_SNAP_THRESHOLD) {
          smoothValue = cfg.value
        }
      }
    }

    const chartW = w - pad.left - pad.right

    // Dynamic buffer
    const baseBuffer = cfg.showBadge ? WINDOW_BUFFER : WINDOW_BUFFER_NO_BADGE
    const needsArrowRoom = cfg.showMomentum && cfg.showBadge
    const buffer = needsArrowRoom
      ? Math.max(baseBuffer, 37 / Math.max(chartW, 1))
      : baseBuffer

    // Window transition
    const transition = windowTransition
    if (hasData) frozenNow = Date.now() / 1000 - timeDebt
    const now = useStash ? frozenNow : Date.now() / 1000 - timeDebt
    const windowResult = updateWindowTransition(
      cfg, transition, displayWindowSecs,
      displayMin, displayMax,
      noMotion, now_ms, now, effectivePoints, smoothValue, buffer,
    )
    displayWindowSecs = windowResult.windowSecs
    const windowSecs = windowResult.windowSecs
    const windowTransProgress = windowResult.windowTransProgress

    const rightEdge = now + windowSecs * buffer
    const leftEdge = rightEdge - windowSecs

    // Filter visible points
    const filterRight = rightEdge - (rightEdge - now) * pauseProgress
    const visible: LivelinePoint[] = []
    for (const p of effectivePoints) {
      if (p.time >= leftEdge - 2 && p.time <= filterRight) {
        visible.push(p)
      }
    }

    if (visible.length < 2) {
      if (badgeEls) badgeEls.container.style.display = 'none'
      animationId = requestAnimationFrame(render)
      return
    }

    // Compute + smooth Y range
    const computedRange = computeRange(visible, smoothValue, cfg.referenceLine?.value, cfg.exaggerate)
    const isWindowTransitioning = transition.startMs > 0
    const rangeResult = updateRange(
      computedRange, rangeInited,
      targetMin, targetMax,
      displayMin, displayMax,
      isWindowTransitioning, windowTransProgress, transition,
      adaptiveSpeed, chartH, pausedDt,
    )
    rangeInited = rangeResult.rangeInited
    targetMin = rangeResult.targetMin
    targetMax = rangeResult.targetMax
    displayMin = rangeResult.displayMin
    displayMax = rangeResult.displayMax
    const { minVal, maxVal, valRange } = rangeResult

    const layout: ChartLayout = {
      w, h, pad,
      chartW, chartH,
      leftEdge, rightEdge,
      minVal, maxVal, valRange,
      toX: (t: number) => pad.left + ((t - leftEdge) / (rightEdge - leftEdge)) * chartW,
      toY: (v: number) => pad.top + (1 - (v - minVal) / valRange) * chartH,
    }

    // Momentum
    const momentum: Momentum = cfg.momentumOverride ?? detectMomentum(visible)

    // Hover + scrub
    const hoverResult = updateHoverState(
      hoverPixelX, pad, w, layout, now, visible,
      scrubAmount, lastHover,
      cfg, noMotion, leftEdge, rightEdge, chartW, dt,
    )
    scrubAmount = hoverResult.scrubAmount
    lastHover = hoverResult.lastHover
    const { hoverX: drawHoverX, hoverValue: drawHoverValue, hoverTime: drawHoverTime } = hoverResult

    // Compute swing magnitude for particles
    const lookback = Math.min(5, visible.length - 1)
    const recentDelta = lookback > 0
      ? Math.abs(visible[visible.length - 1].value - visible[visible.length - 1 - lookback].value)
      : 0
    swingMagnitude = valRange > 0 ? Math.min(recentDelta / valRange, 1) : 0

    // Create states if needed
    if (cfg.orderbookData && !orderbookState) {
      orderbookState = createOrderbookState()
    }
    if (cfg.degenOptions && !particleState) {
      particleState = createParticleState()
      shakeState = createShakeState()
    }

    // Draw canvas content
    drawFrame(ctx, layout, cfg.palette, {
      visible,
      smoothValue,
      now,
      momentum,
      arrowState,
      showGrid: cfg.showGrid,
      showMomentum: cfg.showMomentum,
      showPulse: cfg.showPulse,
      showFill: cfg.showFill,
      referenceLine: cfg.referenceLine,
      hoverX: drawHoverX,
      hoverValue: drawHoverValue,
      hoverTime: drawHoverTime,
      scrubAmount,
      windowSecs,
      formatValue: cfg.formatValue,
      formatTime: cfg.formatTime,
      gridState,
      timeAxisState,
      dt,
      targetWindowSecs: cfg.windowSecs,
      tooltipY: cfg.tooltipY,
      tooltipOutline: cfg.tooltipOutline,
      orderbookData: cfg.orderbookData,
      orderbookState: cfg.orderbookData ? orderbookState ?? undefined : undefined,
      particleState: cfg.degenOptions ? particleState ?? undefined : undefined,
      particleOptions: cfg.degenOptions,
      swingMagnitude,
      shakeState: cfg.degenOptions ? shakeState ?? undefined : undefined,
      chartReveal,
      pauseProgress,
      now_ms,
    })

    // During morph, overlay gradient gap + text
    const bgAlpha = 1 - chartReveal
    if (bgAlpha > 0.01 && revealTarget === 0 && !cfg.loading) {
      const bgEmptyAlpha = (1 - loadingAlpha) * bgAlpha
      if (bgEmptyAlpha > 0.01) {
        drawEmpty(ctx, w, h, pad, cfg.palette, bgEmptyAlpha, now_ms, true, cfg.emptyText)
      }
    }

    // Badge (DOM element, floats above container)
    if (badgeEls) {
      badgeDisplayY = updateBadgeDOM(
        badgeEls, cfg, smoothValue, layout, momentum,
        badgeDisplayY, badgeColor,
        isWindowTransitioning, noMotion, ctx, pausedDt,
        chartReveal,
      )
      // Hide badge during pause
      if (pauseProgress > 0.01 && badgeEls.container.style.display !== 'none') {
        const base = badgeEls.container.style.opacity ? parseFloat(badgeEls.container.style.opacity) : 1
        badgeEls.container.style.opacity = String(base * (1 - pauseProgress))
      }
    }

    // --- Live value display (DOM element) ---
    const valEl = cfg.valueDisplayRef?.value
    if (valEl) {
      const displayVal = cfg.valueMomentumColor ? Math.abs(smoothValue) : smoothValue
      valEl.textContent = cfg.formatValue(displayVal)
      if (cfg.valueMomentumColor) {
        const mc = momentum === 'up' ? '#22c55e' : momentum === 'down' ? '#ef4444' : ''
        if (mc) valEl.style.color = mc
        else valEl.style.removeProperty('color')
      }
    }

    } // end else (line mode)

    animationId = requestAnimationFrame(render)
  }

  // --- Event handlers ---
  function onMove(e: MouseEvent) {
    if (!configRef.value.scrub) return
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    hoverPixelX = e.clientX - rect.left
  }

  function onLeave() {
    hoverPixelX = null
    configRef.value.onHover?.(null)
  }

  function onTouchStart(e: TouchEvent) {
    if (!configRef.value.scrub) return
    if (e.touches.length !== 1) return
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    hoverPixelX = e.touches[0].clientX - rect.left
  }

  function onTouchMove(e: TouchEvent) {
    if (!configRef.value.scrub) return
    if (e.touches.length !== 1) return
    e.preventDefault() // prevent scroll while scrubbing
    const container = containerRef.value
    if (!container) return
    const rect = container.getBoundingClientRect()
    hoverPixelX = e.touches[0].clientX - rect.left
  }

  function onTouchEnd() {
    hoverPixelX = null
    configRef.value.onHover?.(null)
  }

  function onReducedMotionChange(e: MediaQueryListEvent) {
    reducedMotion = e.matches
  }

  function onVisibilityChange() {
    if (!document.hidden && !animationId) {
      animationId = requestAnimationFrame(render)
    }
  }

  // --- Lifecycle ---
  let resizeObserver: ResizeObserver | null = null
  let reducedMotionMql: MediaQueryList | null = null

  onMounted(() => {
    const container = containerRef.value
    if (!container) return

    // Badge DOM creation
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;will-change:transform;display:none;z-index:1;'

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.style.cssText = 'position:absolute;top:0;left:0;'

    const path = document.createElementNS(SVG_NS, 'path')
    svg.appendChild(path)

    const text = document.createElement('span')
    text.style.cssText = 'position:relative;display:block;color:#fff;white-space:nowrap;'

    el.appendChild(svg)
    el.appendChild(text)
    container.appendChild(el)

    badgeEls = { container: el, svg, path, text, displayW: 0, targetW: 0 }

    // ResizeObserver
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      sizeW = width
      sizeH = height
    })
    resizeObserver.observe(container)

    // Init size
    const rect = container.getBoundingClientRect()
    sizeW = rect.width
    sizeH = rect.height

    // Mouse + touch events
    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', onLeave)
    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd)
    container.addEventListener('touchcancel', onTouchEnd)

    // Reduced motion detection
    reducedMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = reducedMotionMql.matches
    reducedMotionMql.addEventListener('change', onReducedMotionChange)

    // Visibility change
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Start rAF
    lastFrameTime = performance.now()
    animationId = requestAnimationFrame(render)
  })

  onUnmounted(() => {
    // Stop rAF
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
      animationId = null
    }

    const container = containerRef.value

    // Remove event listeners
    if (container) {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', onLeave)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('touchcancel', onTouchEnd)
    }

    // Disconnect ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }

    // Remove badge DOM
    if (badgeEls && badgeEls.container.parentNode) {
      badgeEls.container.parentNode.removeChild(badgeEls.container)
      badgeEls = null
    }

    // Remove reduced motion listener
    if (reducedMotionMql) {
      reducedMotionMql.removeEventListener('change', onReducedMotionChange)
      reducedMotionMql = null
    }

    // Remove visibility change listener
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {}
}
