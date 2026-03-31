import { ref, shallowRef, watch, onMounted, onUnmounted, type Ref, type ShallowRef } from 'vue'
import type { LivelinePoint, LivelinePalette, LivelineSeries, Momentum, ReferenceLine, HoverPoint, Padding, ChartLayout, OrderbookData, DegenOptions, BadgeVariant } from './types'
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
  type MultiSeriesHoverEntry,
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

export function useLivelineEngine(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLDivElement | null>,
  configRef: ShallowRef<EngineConfig>,
) {
  // Mutable state
  let animationId: number | null = null
  let lastFrameTime = 0

  // Smoothed values
  let smoothValue = 0
  let displayMin = 0
  let displayMax = 0
  let rangeInited = false
  let scrubAmount = 0
  let hoverX: number | null = null
  let hoverValue: number | null = null
  let hoverTime: number | null = null
  let chartReveal = 0
  let loadingAlpha = 1
  let pauseProgress = 0
  let pausedBaseTime = 0
  let pausedElapsed = 0
  let momentumColorT = 0.5
  let swingMagnitude = 0

  // Window transition
  let displayWindowSecs = 0
  let targetWindowSecs = 0
  let windowTransStart = 0
  let windowTransProgress = 1
  let isTransitioning = false
  let windowTransition = {
    rangeFromMin: 0, rangeFromMax: 0, rangeToMin: 0, rangeToMax: 0,
  }

  // States
  const gridState: GridState = createGridState()
  const timeAxisState: TimeAxisState = createTimeAxisState()
  const arrowState: ArrowState = createArrowState()
  let orderbookState: OrderbookState | null = null
  let particleState: ParticleState | null = null
  let shakeState: ShakeState | null = null

  // Badge
  let badgeEls: BadgeEls | null = null
  let badgeDisplayY = 0

  // Multi-series
  let seriesAlphas = new Map<string, number>()
  let multiHoverEntries: MultiSeriesHoverEntry[] = []

  // --- Badge DOM setup ---
  function createBadge(container: HTMLDivElement, palette: LivelinePalette, variant: BadgeVariant, hasTail: boolean): BadgeEls {
    const div = document.createElement('div')
    div.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 10;
      display: flex;
      align-items: center;
      transform: translateX(6px);
    `

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      overflow: visible;
    `

    const path = document.createElementNS(SVG_NS, 'path')
    const isMinimal = variant === 'minimal'
    path.setAttribute('fill', isMinimal ? palette.badgeOuterBg : palette.badgeBg)
    if (!isMinimal) {
      path.style.filter = `drop-shadow(0 2px 4px ${palette.badgeOuterShadow})`
    }
    svg.appendChild(path)

    const textSpan = document.createElement('span')
    textSpan.style.cssText = `
      position: relative;
      z-index: 1;
      font: ${palette.badgeFont};
      color: ${isMinimal ? palette.gridLabel : palette.badgeText};
      white-space: nowrap;
      padding: ${BADGE_PAD_Y}px ${BADGE_PAD_X}px;
      padding-left: ${hasTail ? BADGE_TAIL_LEN + BADGE_PAD_X : BADGE_PAD_X}px;
    `

    div.appendChild(svg)
    div.appendChild(textSpan)
    container.appendChild(div)

    return {
      container: div,
      svg,
      path,
      text: textSpan,
      displayW: 60,
      targetW: 60,
    }
  }

  function updateBadgePath(badge: BadgeEls, hasTail: boolean) {
    const pillH = BADGE_LINE_H + BADGE_PAD_Y * 2
    const pathData = hasTail
      ? badgeSvgPath(badge.displayW + BADGE_PAD_X * 2, pillH, BADGE_TAIL_LEN, BADGE_TAIL_SPREAD)
      : badgePillOnly(badge.displayW + BADGE_PAD_X * 2, pillH)
    badge.path.setAttribute('d', pathData)
    badge.svg.setAttribute('width', String(badge.displayW + BADGE_PAD_X * 2 + (hasTail ? BADGE_TAIL_LEN : 0)))
    badge.svg.setAttribute('height', String(pillH))
  }

  // --- Render loop ---
  function render(frameTime: number) {
    const canvas = canvasRef.value
    const container = containerRef.value
    const config = configRef.value

    if (!canvas || !container) {
      animationId = requestAnimationFrame(render)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      animationId = requestAnimationFrame(render)
      return
    }

    // Delta time
    const dt = Math.min(frameTime - lastFrameTime, MAX_DELTA_MS) || 16.67
    lastFrameTime = frameTime
    const now_ms = frameTime

    // Dimensions
    const rect = container.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    if (w === 0 || h === 0) {
      animationId = requestAnimationFrame(render)
      return
    }

    const dpr = getDpr()
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    applyDpr(ctx, dpr, w, h)

    const pad = config.padding
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top - pad.bottom

    // Initialize
    if (displayWindowSecs === 0) {
      displayWindowSecs = config.windowSecs
      targetWindowSecs = config.windowSecs
    }
    if (smoothValue === 0 && config.value !== 0) {
      smoothValue = config.value
    }

    // Loading / empty state
    const hasData = config.data.length > 0 || (config.multiSeries && config.multiSeries.some(s => s.data.length > 0))
    const wantLoading = config.loading === true
    const wantEmpty = !hasData && !wantLoading

    // Chart reveal
    const targetReveal = wantLoading || wantEmpty ? 0 : 1
    const revealSpeed = targetReveal > chartReveal ? CHART_REVEAL_SPEED_FWD : CHART_REVEAL_SPEED
    chartReveal = lerp(chartReveal, targetReveal, revealSpeed, dt)
    if (Math.abs(chartReveal - targetReveal) < 0.01) chartReveal = targetReveal

    // Loading alpha
    const targetLoadingAlpha = wantLoading ? 1 : 0
    loadingAlpha = lerp(loadingAlpha, targetLoadingAlpha, LOADING_ALPHA_SPEED, dt)
    if (Math.abs(loadingAlpha - targetLoadingAlpha) < 0.01) loadingAlpha = targetLoadingAlpha

    // Pause progress
    const targetPause = config.paused ? 1 : 0
    pauseProgress = lerp(pauseProgress, targetPause, PAUSE_PROGRESS_SPEED, dt)

    // Window transition
    if (config.windowSecs !== targetWindowSecs) {
      windowTransStart = now_ms
      windowTransProgress = 0
      isTransitioning = true
      windowTransition.rangeFromMin = displayMin
      windowTransition.rangeFromMax = displayMax
      targetWindowSecs = config.windowSecs
    }
    if (isTransitioning) {
      windowTransProgress = Math.min(1, (now_ms - windowTransStart) / WINDOW_TRANSITION_MS)
      const eased = windowTransProgress * windowTransProgress * (3 - 2 * windowTransProgress)
      displayWindowSecs = displayWindowSecs + (targetWindowSecs - displayWindowSecs) * eased
      if (windowTransProgress >= 1) {
        isTransitioning = false
        displayWindowSecs = targetWindowSecs
      }
    }

    // Time calculation
    const now = Date.now() / 1000
    const buffer = config.showBadge ? WINDOW_BUFFER : WINDOW_BUFFER_NO_BADGE
    const leftEdge = now - displayWindowSecs * (1 - buffer)
    const rightEdge = now + displayWindowSecs * buffer

    // Visible data
    const visible = config.data.filter(p => p.time >= leftEdge && p.time <= rightEdge)

    // Smooth value
    const targetValue = config.value
    const valueDiff = Math.abs(smoothValue - targetValue)
    const valueRange = (displayMax - displayMin) || 1
    const normalizedDiff = valueDiff / valueRange
    const adaptiveSpeed = config.lerpSpeed + normalizedDiff * ADAPTIVE_SPEED_BOOST
    smoothValue = lerp(smoothValue, targetValue, adaptiveSpeed, dt)
    if (normalizedDiff < VALUE_SNAP_THRESHOLD) smoothValue = targetValue

    // Momentum
    let momentum: Momentum = config.momentumOverride ?? detectMomentum(config.data)
    
    // Swing magnitude for particles
    if (visible.length >= 2) {
      const recentStart = Math.max(0, visible.length - 10)
      let minV = Infinity, maxV = -Infinity
      for (let i = recentStart; i < visible.length; i++) {
        const v = visible[i].value
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
      swingMagnitude = valueRange > 0 ? (maxV - minV) / valueRange : 0
    } else {
      swingMagnitude = 0
    }

    // Range calculation
    let targetRange: { min: number; max: number }
    if (config.isMultiSeries && config.multiSeries && config.multiSeries.length > 0) {
      // Multi-series: combine all visible data for range calculation
      const allVisible: LivelinePoint[] = []
      let smoothVal = 0
      for (const s of config.multiSeries) {
        const sVisible = s.data.filter(p => p.time >= leftEdge && p.time <= rightEdge)
        allVisible.push(...sVisible)
        // Safely get max value, guard against NaN/undefined
        const sVal = typeof s.value === 'number' && !isNaN(s.value) ? s.value : 0
        smoothVal = Math.max(smoothVal, sVal)
      }
      // If no visible data and no valid smoothVal, use sensible defaults
      if (allVisible.length === 0 && smoothVal === 0) {
        targetRange = { min: 0, max: 100 }
      } else {
        targetRange = computeRange(allVisible, smoothVal, config.referenceLine?.value, config.exaggerate)
      }
    } else {
      targetRange = computeRange(visible, smoothValue, config.referenceLine?.value, config.exaggerate)
    }
    // Guard against NaN in targetRange
    if (isNaN(targetRange.min) || isNaN(targetRange.max)) {
      targetRange = { min: 0, max: 100 }
    }
    if (!rangeInited) {
      displayMin = targetRange.min
      displayMax = targetRange.max
      rangeInited = true
    } else if (isTransitioning) {
      if (windowTransProgress < 0.1) {
        windowTransition.rangeToMin = targetRange.min
        windowTransition.rangeToMax = targetRange.max
      }
      const eased = windowTransProgress * windowTransProgress * (3 - 2 * windowTransProgress)
      displayMin = windowTransition.rangeFromMin + (windowTransition.rangeToMin - windowTransition.rangeFromMin) * eased
      displayMax = windowTransition.rangeFromMax + (windowTransition.rangeToMax - windowTransition.rangeFromMax) * eased
    } else {
      const rangeSpeed = 0.08 + (1 - Math.min(valueDiff / valueRange, 1)) * 0.04
      displayMin = lerp(displayMin, targetRange.min, rangeSpeed, dt)
      displayMax = lerp(displayMax, targetRange.max, rangeSpeed, dt)
    }

    const valRange = displayMax - displayMin || 1

    // Layout
    const layout: ChartLayout = {
      w, h, pad, chartW, chartH,
      leftEdge, rightEdge,
      minVal: displayMin, maxVal: displayMax, valRange,
      toX: (t: number) => pad.left + ((t - leftEdge) / (rightEdge - leftEdge)) * chartW,
      toY: (v: number) => pad.top + ((displayMax - v) / valRange) * chartH,
    }

    // Scrub handling
    if (config.scrub && hoverX !== null) {
      scrubAmount = lerp(scrubAmount, 1, SCRUB_LERP_SPEED, dt)
    } else {
      scrubAmount = lerp(scrubAmount, 0, SCRUB_LERP_SPEED, dt)
      if (scrubAmount < 0.01) {
        scrubAmount = 0
        hoverX = null
        hoverValue = null
        hoverTime = null
      }
    }

    // Create states if needed
    if (config.orderbookData && !orderbookState) {
      orderbookState = createOrderbookState()
    }
    if (config.degenOptions && !particleState) {
      particleState = createParticleState()
      shakeState = createShakeState()
    }

    // Multi-series alphas
    if (config.isMultiSeries && config.multiSeries) {
      for (const s of config.multiSeries) {
        const isHidden = config.hiddenSeriesIds?.has(s.id) ?? false
        const currentAlpha = seriesAlphas.get(s.id) ?? 1
        const targetAlpha = isHidden ? 0 : 1
        const newAlpha = lerp(currentAlpha, targetAlpha, SERIES_TOGGLE_SPEED, dt)
        seriesAlphas.set(s.id, newAlpha)
      }
    }

    // --- Draw ---
    if (loadingAlpha > 0.01) {
      drawLoading(ctx, w, h, pad, config.palette, now_ms, loadingAlpha)
    }

    if (wantEmpty && chartReveal < 0.01) {
      drawEmpty(ctx, w, h, pad, config.palette, 1, now_ms, false, config.emptyText)
    } else if (config.isMultiSeries && config.multiSeries) {
      // Multi-series mode
      const seriesEntries = config.multiSeries
        .filter(s => (seriesAlphas.get(s.id) ?? 1) > 0.01)
        .map(s => ({
          visible: s.data.filter(p => p.time >= leftEdge && p.time <= rightEdge),
          smoothValue: typeof s.value === 'number' && !isNaN(s.value) ? s.value : 0,
          palette: s.palette,
          label: s.label,
          alpha: seriesAlphas.get(s.id) ?? 1,
        }))

      // Multi-series hover
      if (hoverX !== null && hoverTime !== null) {
        multiHoverEntries = []
        for (const s of config.multiSeries) {
          const alpha = seriesAlphas.get(s.id) ?? 1
          if (alpha < 0.01) continue
          const v = interpolateAtTime(s.data, hoverTime)
          if (v !== null) {
            multiHoverEntries.push({
              color: s.palette.line,
              label: s.label ?? '',
              value: v,
            })
          }
        }
      }

      drawMultiFrame(ctx, layout, {
        series: seriesEntries,
        now,
        showGrid: config.showGrid,
        showPulse: config.showPulse,
        referenceLine: config.referenceLine,
        hoverX,
        hoverTime,
        hoverEntries: multiHoverEntries,
        scrubAmount,
        windowSecs: displayWindowSecs,
        formatValue: config.formatValue,
        formatTime: config.formatTime,
        gridState,
        timeAxisState,
        dt,
        targetWindowSecs,
        tooltipY: config.tooltipY,
        tooltipOutline: config.tooltipOutline,
        chartReveal,
        pauseProgress,
        now_ms,
        primaryPalette: config.palette,
      })
    } else {
      // Single series mode
      drawFrame(ctx, layout, config.palette, {
        visible,
        smoothValue,
        now,
        momentum,
        arrowState,
        showGrid: config.showGrid,
        showMomentum: config.showMomentum,
        showPulse: config.showPulse,
        showFill: config.showFill,
        referenceLine: config.referenceLine,
        hoverX,
        hoverValue,
        hoverTime,
        scrubAmount,
        windowSecs: displayWindowSecs,
        formatValue: config.formatValue,
        formatTime: config.formatTime,
        gridState,
        timeAxisState,
        dt,
        targetWindowSecs,
        tooltipY: config.tooltipY,
        tooltipOutline: config.tooltipOutline,
        orderbookData: config.orderbookData,
        orderbookState: orderbookState ?? undefined,
        particleState: particleState ?? undefined,
        particleOptions: config.degenOptions,
        swingMagnitude,
        shakeState: shakeState ?? undefined,
        chartReveal,
        pauseProgress,
        now_ms,
      })
    }

    // --- Badge update ---
    if (config.showBadge && !config.isMultiSeries) {
      if (!badgeEls && container) {
        badgeEls = createBadge(container, config.palette, config.badgeVariant, config.badgeTail)
      }
      if (badgeEls) {
        // Update text
        const displayValue = config.formatValue(smoothValue)
        if (badgeEls.text.textContent !== displayValue) {
          badgeEls.text.textContent = displayValue
          badgeEls.targetW = badgeEls.text.offsetWidth - BADGE_PAD_X * 2
        }

        // Smooth width
        badgeEls.displayW = lerp(badgeEls.displayW, badgeEls.targetW, BADGE_WIDTH_LERP, dt)
        updateBadgePath(badgeEls, config.badgeTail)

        // Position
        const dotX = layout.toX(now)
        const dotY = layout.toY(smoothValue)
        const targetY = Math.max(pad.top + 10, Math.min(h - pad.bottom - 10, dotY))
        const yLerpSpeed = isTransitioning ? BADGE_Y_LERP_TRANSITIONING : BADGE_Y_LERP
        badgeDisplayY = lerp(badgeDisplayY, targetY, yLerpSpeed, dt)

        const pillH = BADGE_LINE_H + BADGE_PAD_Y * 2
        badgeEls.container.style.left = `${dotX}px`
        badgeEls.container.style.top = `${badgeDisplayY - pillH / 2}px`

        // Visibility
        const badgeAlpha = chartReveal * (1 - scrubAmount * 0.5)
        badgeEls.container.style.opacity = String(badgeAlpha)
        badgeEls.container.style.display = badgeAlpha > 0.01 ? 'flex' : 'none'
      }
    } else if (badgeEls) {
      badgeEls.container.style.display = 'none'
    }

    // --- Value display update ---
    if (config.valueDisplayRef?.value && config.valueMomentumColor) {
      const targetMomentumT = momentum === 'up' ? 1 : momentum === 'down' ? 0 : 0.5
      momentumColorT = lerp(momentumColorT, targetMomentumT, MOMENTUM_COLOR_LERP, dt)
      const color = lerpRgb(MOMENTUM_RED, MOMENTUM_GREEN, momentumColorT)
      config.valueDisplayRef.value.style.color = color
      config.valueDisplayRef.value.textContent = config.formatValue(smoothValue)
    }

    animationId = requestAnimationFrame(render)
  }

  // --- Mouse handlers ---
  function handleMouseMove(e: MouseEvent) {
    const canvas = canvasRef.value
    const config = configRef.value
    if (!canvas || !config.scrub) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const pad = config.padding

    if (x >= pad.left && x <= rect.width - pad.right && y >= pad.top && y <= rect.height - pad.bottom) {
      hoverX = x
      const chartW = rect.width - pad.left - pad.right
      const now = Date.now() / 1000
      const buffer = config.showBadge ? WINDOW_BUFFER : WINDOW_BUFFER_NO_BADGE
      const leftEdge = now - displayWindowSecs * (1 - buffer)
      const rightEdge = now + displayWindowSecs * buffer
      hoverTime = leftEdge + ((x - pad.left) / chartW) * (rightEdge - leftEdge)
      hoverValue = interpolateAtTime(config.data, hoverTime)

      if (config.onHover && hoverValue !== null && hoverTime !== null) {
        config.onHover({ time: hoverTime, value: hoverValue, x, y })
      }
    } else {
      hoverX = null
      hoverValue = null
      hoverTime = null
      if (config.onHover) config.onHover(null)
    }
  }

  function handleMouseLeave() {
    const config = configRef.value
    hoverX = null
    hoverValue = null
    hoverTime = null
    if (config.onHover) config.onHover(null)
  }

  // --- Lifecycle ---
  onMounted(() => {
    const canvas = canvasRef.value
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove)
      canvas.addEventListener('mouseleave', handleMouseLeave)
    }
    lastFrameTime = performance.now()
    animationId = requestAnimationFrame(render)
  })

  onUnmounted(() => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId)
    }
    const canvas = canvasRef.value
    if (canvas) {
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
    if (badgeEls) {
      badgeEls.container.remove()
    }
  })

  return {
    // Expose state if needed
  }
}

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}
