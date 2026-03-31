<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted } from 'vue'
import type { LivelineProps, Padding, DegenOptions, BadgeVariant } from '../types'
import { resolveTheme, resolveSeriesPalettes, SERIES_COLORS } from '../theme'
import { useLivelineEngine, type EngineConfig } from '../useLivelineEngine'

const props = withDefaults(defineProps<LivelineProps>(), {
  theme: 'dark',
  color: '#3b82f6',
  window: 30,
  grid: true,
  badge: true,
  momentum: true,
  fill: true,
  scrub: true,
  loading: false,
  paused: false,
  exaggerate: false,
  badgeTail: true,
  badgeVariant: 'default',
  showValue: false,
  valueMomentumColor: false,
  tooltipY: 14,
  tooltipOutline: true,
  cursor: 'crosshair',
  pulse: true,
  lerpSpeed: 0.08,
  seriesToggleCompact: false,
})

const emit = defineEmits<{
  (e: 'update:window', secs: number): void
  (e: 'hover', point: { time: number; value: number; x: number; y: number } | null): void
  (e: 'seriesToggle', id: string, visible: boolean): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const valueDisplayRef = ref<HTMLSpanElement | null>(null)

const defaultFormatValue = (v: number) => v.toFixed(2)
const defaultFormatTime = (t: number) => {
  const d = new Date(t * 1000)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

// Computed palette
const palette = computed(() => {
  const p = resolveTheme(props.color, props.theme)
  if (props.lineWidth != null) p.lineWidth = props.lineWidth
  return p
})

// Multi-series palettes
const seriesPalettes = computed(() => {
  if (!props.series || props.series.length === 0) return null
  return resolveSeriesPalettes(props.series, props.theme)
})

// Default padding
const defaultPadding = computed<Required<Padding>>(() => ({
  top: props.badge ? 40 : 20,
  right: props.grid ? 60 : 20,
  bottom: 40,
  left: 20,
}))

const resolvedPadding = computed<Required<Padding>>(() => ({
  top: props.padding?.top ?? defaultPadding.value.top,
  right: props.padding?.right ?? defaultPadding.value.right,
  bottom: props.padding?.bottom ?? defaultPadding.value.bottom,
  left: props.padding?.left ?? defaultPadding.value.left,
}))

// Degen options
const degenOptions = computed<DegenOptions | undefined>(() => {
  if (!props.degen) return undefined
  if (props.degen === true) return { scale: 1 }
  return props.degen
})

// Momentum resolved
const momentumOverride = computed(() => {
  if (typeof props.momentum === 'string') return props.momentum
  return undefined
})

const showMomentum = computed(() => {
  return props.momentum === true || typeof props.momentum === 'string'
})

// Hidden series
const hiddenSeriesIds = ref<Set<string>>(new Set())

// Multi-series config
const isMultiSeries = computed(() => {
  return props.series != null && props.series.length > 0
})

const multiSeriesConfig = computed(() => {
  if (!props.series || !seriesPalettes.value) return undefined
  return props.series.map((s, i) => ({
    id: s.id,
    data: s.data,
    value: s.value,
    palette: seriesPalettes.value!.get(s.id) ?? resolveTheme(s.color || SERIES_COLORS[i % SERIES_COLORS.length], props.theme),
    label: s.label,
  }))
})

// Engine config
const engineConfig = shallowRef<EngineConfig>({
  data: props.data,
  value: props.value,
  palette: palette.value,
  windowSecs: props.window,
  lerpSpeed: props.lerpSpeed,
  showGrid: props.grid,
  showBadge: props.badge,
  showMomentum: showMomentum.value,
  momentumOverride: momentumOverride.value,
  showFill: props.fill,
  referenceLine: props.referenceLine,
  formatValue: props.formatValue ?? defaultFormatValue,
  formatTime: props.formatTime ?? defaultFormatTime,
  padding: resolvedPadding.value,
  onHover: (point) => emit('hover', point),
  showPulse: props.pulse,
  scrub: props.scrub,
  exaggerate: props.exaggerate,
  degenOptions: degenOptions.value,
  badgeTail: props.badgeTail,
  badgeVariant: props.badgeVariant as BadgeVariant,
  tooltipY: props.tooltipY,
  tooltipOutline: props.tooltipOutline,
  valueMomentumColor: props.valueMomentumColor,
  valueDisplayRef: valueDisplayRef,
  orderbookData: props.orderbook,
  loading: props.loading,
  paused: props.paused,
  emptyText: props.emptyText,
  multiSeries: multiSeriesConfig.value,
  isMultiSeries: isMultiSeries.value,
  hiddenSeriesIds: hiddenSeriesIds.value,
})

// Watch all props and update config
watch(
  () => [
    props.data, props.value, props.color, props.theme, props.window,
    props.grid, props.badge, props.momentum, props.fill, props.referenceLine,
    props.formatValue, props.formatTime, props.padding, props.pulse, props.scrub,
    props.exaggerate, props.degen, props.badgeTail, props.badgeVariant,
    props.tooltipY, props.tooltipOutline, props.valueMomentumColor,
    props.orderbook, props.loading, props.paused, props.emptyText,
    props.series, props.lerpSpeed, props.lineWidth,
  ],
  () => {
    engineConfig.value = {
      data: props.data,
      value: props.value,
      palette: palette.value,
      windowSecs: props.window,
      lerpSpeed: props.lerpSpeed,
      showGrid: props.grid,
      showBadge: props.badge,
      showMomentum: showMomentum.value,
      momentumOverride: momentumOverride.value,
      showFill: props.fill,
      referenceLine: props.referenceLine,
      formatValue: props.formatValue ?? defaultFormatValue,
      formatTime: props.formatTime ?? defaultFormatTime,
      padding: resolvedPadding.value,
      onHover: (point) => emit('hover', point),
      showPulse: props.pulse,
      scrub: props.scrub,
      exaggerate: props.exaggerate,
      degenOptions: degenOptions.value,
      badgeTail: props.badgeTail,
      badgeVariant: props.badgeVariant as BadgeVariant,
      tooltipY: props.tooltipY,
      tooltipOutline: props.tooltipOutline,
      valueMomentumColor: props.valueMomentumColor,
      valueDisplayRef: valueDisplayRef,
      orderbookData: props.orderbook,
      loading: props.loading,
      paused: props.paused,
      emptyText: props.emptyText,
      multiSeries: multiSeriesConfig.value,
      isMultiSeries: isMultiSeries.value,
      hiddenSeriesIds: hiddenSeriesIds.value,
    }
  },
  { deep: true },
)

// Initialize engine
useLivelineEngine(canvasRef, containerRef, engineConfig)

// Window change handler
const activeWindowSecs = ref(props.window)
watch(() => props.window, (newVal) => {
  activeWindowSecs.value = newVal
})

function handleWindowChange(secs: number) {
  activeWindowSecs.value = secs
  emit('update:window', secs)
  if (props.onWindowChange) {
    props.onWindowChange(secs)
  }
}

// Series toggle handler
function toggleSeries(id: string) {
  const newSet = new Set(hiddenSeriesIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
    emit('seriesToggle', id, true)
    if (props.onSeriesToggle) props.onSeriesToggle(id, true)
  } else {
    newSet.add(id)
    emit('seriesToggle', id, false)
    if (props.onSeriesToggle) props.onSeriesToggle(id, false)
  }
  hiddenSeriesIds.value = newSet
}

const isDark = computed(() => props.theme === 'dark')
const showSeriesToggle = computed(() => props.series && props.series.length > 1)

const cursorStyle = computed(() => props.scrub ? props.cursor : 'default')
const activeColor = computed(() => isDark.value ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)')
const inactiveColor = computed(() => isDark.value ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)')
</script>

<template>
  <div class="liveline-wrapper" :class="isDark ? 'dark' : 'light'">
    <!-- Live value display -->
    <span
      v-if="showValue"
      ref="valueDisplayRef"
      class="liveline-value"
      :style="{
        paddingLeft: `${resolvedPadding.left}px`,
        color: isDark ? 'rgba(255,255,255,0.85)' : '#111',
      }"
    />

    <!-- Control bars row -->
    <div
      v-if="(windows && windows.length > 0) || showSeriesToggle"
      class="liveline-controls"
      :style="{ marginLeft: `${resolvedPadding.left}px` }"
    >
      <!-- Time window controls -->
      <div
        v-if="windows && windows.length > 0"
        class="liveline-windows"
        :class="[windowStyle || 'default', isDark ? 'dark' : 'light']"
      >
        <button
          v-for="w in windows"
          :key="w.secs"
          class="liveline-window-btn"
          :class="{ active: w.secs === activeWindowSecs }"
          :style="{
            color: w.secs === activeWindowSecs ? activeColor : inactiveColor,
          }"
          @click="handleWindowChange(w.secs)"
        >
          {{ w.label }}
        </button>
      </div>

      <!-- Series toggle -->
      <div v-if="showSeriesToggle" class="liveline-series-toggle">
        <button
          v-for="s in series"
          :key="s.id"
          class="liveline-series-btn"
          :class="{ hidden: hiddenSeriesIds.has(s.id) }"
          @click="toggleSeries(s.id)"
        >
          <span
            class="liveline-series-dot"
            :style="{ backgroundColor: s.color || SERIES_COLORS[series!.indexOf(s) % SERIES_COLORS.length] }"
          />
          <span v-if="!seriesToggleCompact && s.label" class="liveline-series-label">
            {{ s.label }}
          </span>
        </button>
      </div>
    </div>

    <!-- Chart container -->
    <div ref="containerRef" class="liveline-container" :style="{ cursor: cursorStyle }">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>

<style scoped>
.liveline-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.liveline-value {
  display: block;
  font-size: 20px;
  font-weight: 500;
  font-family: "SF Mono", Menlo, monospace;
  transition: color 0.3s;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
  padding-top: 4px;
}

.liveline-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.liveline-windows {
  position: relative;
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
}

.liveline-windows.dark {
  background: rgba(255, 255, 255, 0.03);
}

.liveline-windows.light {
  background: rgba(0, 0, 0, 0.02);
}

.liveline-windows.rounded {
  border-radius: 999px;
  padding: 3px;
  gap: 2px;
}

.liveline-windows.text {
  background: transparent;
  padding: 0;
  gap: 4px;
}

.liveline-window-btn {
  position: relative;
  z-index: 1;
  font-size: 11px;
  padding: 3px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
  font-family: inherit;
}

.liveline-windows.text .liveline-window-btn {
  padding: 2px 6px;
}

.liveline-window-btn:hover {
  opacity: 0.8;
}

.liveline-series-toggle {
  display: flex;
  gap: 4px;
}

.liveline-series-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 1;
  transition: opacity 0.2s, background 0.15s, color 0.2s;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.7);
}

.liveline-wrapper.light .liveline-series-btn {
  background: rgba(0, 0, 0, 0.035);
  color: rgba(0, 0, 0, 0.55);
}

.liveline-series-btn.hidden {
  opacity: 0.4;
  background: transparent;
  color: rgba(255, 255, 255, 0.25);
}

.liveline-wrapper.light .liveline-series-btn.hidden {
  color: rgba(0, 0, 0, 0.22);
}

.liveline-series-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.liveline-series-btn.hidden .liveline-series-dot {
  opacity: 0.4;
}

.liveline-series-label {
  font-size: 11px;
}

.liveline-container {
  position: relative;
  flex: 1;
  min-height: 0;
}

.liveline-container canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
