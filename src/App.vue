<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { Liveline } from './core'
import type { LivelinePoint, LivelineSeries } from './core'

// --- Types ---
type Volatility = 'calm' | 'normal' | 'spiky' | 'chaos'
type Scenario = 'loading' | 'loading-hold' | 'live' | 'empty'
type TabType = 'single' | 'multi'

// --- Constants ---
const TIME_WINDOWS = [
  { label: '10s', secs: 10 },
  { label: '30s', secs: 30 },
  { label: '1m', secs: 60 },
  { label: '5m', secs: 300 },
]

const TICK_RATES = [
  { label: '50ms', ms: 50 },
  { label: '100ms', ms: 100 },
  { label: '300ms', ms: 300 },
  { label: '1s', ms: 1000 },
]

const VOLATILITIES: Volatility[] = ['calm', 'normal', 'spiky', 'chaos']

const SIZE_VARIANTS = [
  { w: 320, h: 180, label: '320×180' },
  { w: 240, h: 120, label: '240×120' },
  { w: 160, h: 100, label: '160×100' },
  { w: 120, h: 80, label: '120×80' },
]

const SERIES_PRESETS = [
  { id: 'price', label: 'Price', color: '#3b82f6', base: 100 },
  { id: 'volume', label: 'Volume', color: '#22c55e', base: 50 },
  { id: 'trades', label: 'Trades', color: '#f59e0b', base: 200 },
  { id: 'depth', label: 'Depth', color: '#ec4899', base: 80 },
]

// --- Data Generator ---
function generatePoint(prev: number, time: number, volatility: Volatility, baseValue = 100): LivelinePoint {
  const v: Record<Volatility, number> = { calm: 0.15, normal: 0.8, spiky: 3, chaos: 8 }
  const bias: Record<Volatility, number> = { calm: 0.49, normal: 0.48, spiky: 0.47, chaos: 0.45 }
  const priceScale = baseValue / 100
  const scale = v[volatility] * priceScale
  const spike = (volatility === 'spiky' || volatility === 'chaos') && Math.random() < 0.08
    ? (Math.random() - 0.5) * scale * 3
    : 0
  const delta = (Math.random() - bias[volatility]) * scale + spike
  return { time, value: prev + delta }
}

// --- Tab State ---
const activeTab = ref<TabType>('single')

// --- Single Series State ---
const scenario = ref<Scenario>('loading')
const data = ref<LivelinePoint[]>([])
const value = ref(100)
const paused = ref(false)

// Chart options
const theme = ref<'dark' | 'light'>('dark')
const color = ref('#3b82f6')
const windowSecs = ref(30)
const volatility = ref<Volatility>('normal')
const tickRate = ref(300)

// Features
const grid = ref(true)
const scrub = ref(true)
const badge = ref(true)
const fill = ref(true)
const momentum = ref(true)
const pulse = ref(true)
const exaggerate = ref(false)

// Internal refs
let lastValue = 100
let intervalId: number | null = null
const maxTicks = 1200

// --- Multi Series State ---
const multiScenario = ref<Scenario>('loading')
const multiPaused = ref(false)
const enabledSeries = ref<string[]>(['price', 'volume'])
const seriesData = ref<Record<string, LivelinePoint[]>>({
  price: [],
  volume: [],
  trades: [],
  depth: [],
})
const seriesValues = ref<Record<string, number>>({
  price: 100,
  volume: 50,
  trades: 200,
  depth: 80,
})
let multiLastValues: Record<string, number> = { price: 100, volume: 50, trades: 200, depth: 80 }
let multiIntervalId: number | null = null

// --- Computed ---
const isDark = computed(() => theme.value === 'dark')

const cssVars = computed(() => {
  const fgBase = isDark.value ? '255,255,255' : '0,0,0'
  return {
    '--fg-02': `rgba(${fgBase},0.02)`,
    '--fg-06': `rgba(${fgBase},0.06)`,
    '--fg-08': `rgba(${fgBase},0.08)`,
    '--fg-20': `rgba(${fgBase},0.2)`,
    '--fg-25': `rgba(${fgBase},0.25)`,
    '--fg-30': `rgba(${fgBase},0.3)`,
    '--fg-35': `rgba(${fgBase},0.35)`,
    '--fg-45': `rgba(${fgBase},0.45)`,
  }
})

const activeSeries = computed<LivelineSeries[]>(() => {
  return SERIES_PRESETS
    .filter(s => enabledSeries.value.includes(s.id))
    .map(s => ({
      id: s.id,
      label: s.label,
      color: s.color,
      data: seriesData.value[s.id],
      value: seriesValues.value[s.id],
    }))
})

// Format value safely to avoid NaN
function formatValue(v: number | undefined): string {
  if (v == null || isNaN(v)) return '--'
  return v.toFixed(2)
}

// --- Single Series Methods ---
function startLive() {
  if (intervalId) clearInterval(intervalId)

  const now = Date.now() / 1000
  const seedCount = 500
  const seed: LivelinePoint[] = []
  let v = 100

  for (let i = seedCount; i >= 0; i--) {
    const pt = generatePoint(v, now - i * 0.3, volatility.value, 100)
    seed.push(pt)
    v = pt.value
  }

  data.value = seed
  value.value = v
  lastValue = v

  intervalId = window.setInterval(() => {
    if (paused.value) return
    const now = Date.now() / 1000
    const pt = generatePoint(lastValue, now, volatility.value, 100)
    lastValue = pt.value
    value.value = pt.value
    data.value = [...data.value.slice(-maxTicks), pt]
  }, tickRate.value)
}

function stopInterval() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// --- Multi Series Methods ---
function startMultiLive() {
  if (multiIntervalId) clearInterval(multiIntervalId)

  const now = Date.now() / 1000
  const seedCount = 500

  // Seed all series - build complete new objects
  const newData: Record<string, LivelinePoint[]> = {}
  const newValues: Record<string, number> = {}
  
  for (const s of SERIES_PRESETS) {
    const seed: LivelinePoint[] = []
    let v = s.base
    for (let i = seedCount; i >= 0; i--) {
      const pt = generatePoint(v, now - i * 0.3, volatility.value, s.base)
      seed.push(pt)
      v = pt.value
    }
    newData[s.id] = seed
    newValues[s.id] = v
    multiLastValues[s.id] = v
  }
  
  // Assign all at once to trigger reactivity
  seriesData.value = newData
  seriesValues.value = newValues
  console.log('[startMultiLive] Initial values:', JSON.stringify(newValues))

  multiIntervalId = window.setInterval(() => {
    if (multiPaused.value) return
    const now = Date.now() / 1000

    for (const s of SERIES_PRESETS) {
      const pt = generatePoint(multiLastValues[s.id], now, volatility.value, s.base)
      multiLastValues[s.id] = pt.value
      // Update values directly for reactivity
      seriesValues.value[s.id] = pt.value
      seriesData.value[s.id] = [...seriesData.value[s.id].slice(-maxTicks), pt]
    }
    
    // Trigger reactivity by reassigning
    seriesValues.value = { ...seriesValues.value }
    seriesData.value = { ...seriesData.value }
    
    console.log('[interval] Updated values:', seriesValues.value.price?.toFixed(2))
  }, tickRate.value)
}

function stopMultiInterval() {
  if (multiIntervalId) {
    clearInterval(multiIntervalId)
    multiIntervalId = null
  }
}

function toggleSeries(id: string) {
  const idx = enabledSeries.value.indexOf(id)
  if (idx >= 0) {
    if (enabledSeries.value.length > 1) {
      enabledSeries.value = enabledSeries.value.filter(s => s !== id)
    }
  } else {
    enabledSeries.value = [...enabledSeries.value, id]
  }
}

// --- Watchers ---
watch(scenario, (s) => {
  stopInterval()
  
  if (s === 'loading') {
    data.value = []
    setTimeout(() => {
      scenario.value = 'live'
    }, 2000)
  } else if (s === 'loading-hold') {
    data.value = []
  } else if (s === 'empty') {
    data.value = []
  } else if (s === 'live') {
    startLive()
  }
}, { immediate: true })

watch(multiScenario, (s) => {
  console.log('[watch multiScenario]', s)
  stopMultiInterval()
  
  const emptyData: Record<string, LivelinePoint[]> = {
    price: [],
    volume: [],
    trades: [],
    depth: [],
  }
  
  if (s === 'loading') {
    seriesData.value = { ...emptyData }
    setTimeout(() => {
      multiScenario.value = 'live'
    }, 2000)
  } else if (s === 'loading-hold') {
    seriesData.value = { ...emptyData }
  } else if (s === 'empty') {
    seriesData.value = { ...emptyData }
  } else if (s === 'live') {
    startMultiLive()
  }
}, { immediate: true })

watch(tickRate, () => {
  if (scenario.value === 'live') {
    startLive()
  }
  if (multiScenario.value === 'live') {
    startMultiLive()
  }
})

onUnmounted(() => {
  stopInterval()
  stopMultiInterval()
})

// Color presets
const colorPresets = [
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Orange', value: '#f59e0b' },
  { label: 'Pink', value: '#ec4899' },
]
</script>

<template>
  <div
    class="demo-page"
    :class="{ dark: isDark }"
    :style="cssVars"
  >
    <h1 class="title">Vue Liveline</h1>
    <p class="subtitle">Real-time data visualization component for Vue 3</p>

    <!-- Tab Switcher -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'single' }"
        @click="activeTab = 'single'"
      >
        Single Series
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'multi' }"
        @click="activeTab = 'multi'"
      >
        Multi Series
      </button>
    </div>

    <!-- Single Series Tab -->
    <template v-if="activeTab === 'single'">
      <!-- State Controls -->
      <section class="control-section">
        <span class="section-label">STATE</span>
        <div class="control-group">
          <button
            v-for="s in (['loading', 'loading-hold', 'live', 'empty'] as Scenario[])"
            :key="s"
            class="btn"
            :class="{ active: scenario === s }"
            @click="scenario = s"
          >
            {{ s === 'loading' ? 'Loading → Live' : s === 'loading-hold' ? 'Loading' : s === 'live' ? 'Live' : 'No Data' }}
          </button>
          <div class="sep" />
          <button class="btn" :class="{ active: paused }" @click="paused = !paused">
            {{ paused ? '▶ Play' : '⏸ Pause' }}
          </button>
        </div>
      </section>

      <!-- Data Controls -->
      <section class="control-section">
        <span class="section-label">DATA</span>
        <div class="control-group">
          <span class="label">Volatility:</span>
          <button
            v-for="v in VOLATILITIES"
            :key="v"
            class="btn"
            :class="{ active: volatility === v }"
            @click="volatility = v"
          >
            {{ v }}
          </button>
          <div class="sep" />
          <span class="label">Tick rate:</span>
          <button
            v-for="t in TICK_RATES"
            :key="t.ms"
            class="btn"
            :class="{ active: tickRate === t.ms }"
            @click="tickRate = t.ms"
          >
            {{ t.label }}
          </button>
        </div>
      </section>

      <!-- Window Controls -->
      <section class="control-section">
        <span class="section-label">WINDOW</span>
        <div class="control-group">
          <button
            v-for="w in TIME_WINDOWS"
            :key="w.secs"
            class="btn"
            :class="{ active: windowSecs === w.secs }"
            @click="windowSecs = w.secs"
          >
            {{ w.label }}
          </button>
        </div>
      </section>

      <!-- Theme & Color -->
      <section class="control-section">
        <span class="section-label">THEME</span>
        <div class="control-group">
          <button class="btn" :class="{ active: theme === 'dark' }" @click="theme = 'dark'">Dark</button>
          <button class="btn" :class="{ active: theme === 'light' }" @click="theme = 'light'">Light</button>
          <div class="sep" />
          <span class="label">Color:</span>
          <button
            v-for="c in colorPresets"
            :key="c.value"
            class="color-btn"
            :class="{ active: color === c.value }"
            :style="{ background: c.value }"
            @click="color = c.value"
          />
        </div>
      </section>

      <!-- Feature Toggles -->
      <section class="control-section">
        <span class="section-label">FEATURES</span>
        <div class="control-group">
          <button class="toggle-btn" :class="{ on: grid }" @click="grid = !grid">Grid</button>
          <button class="toggle-btn" :class="{ on: scrub }" @click="scrub = !scrub">Scrub</button>
          <button class="toggle-btn" :class="{ on: badge }" @click="badge = !badge">Badge</button>
          <button class="toggle-btn" :class="{ on: fill }" @click="fill = !fill">Fill</button>
          <button class="toggle-btn" :class="{ on: momentum }" @click="momentum = !momentum">Momentum</button>
          <button class="toggle-btn" :class="{ on: pulse }" @click="pulse = !pulse">Pulse</button>
          <button class="toggle-btn" :class="{ on: exaggerate }" @click="exaggerate = !exaggerate">Exaggerate</button>
        </div>
      </section>

      <!-- Main Chart -->
      <div class="main-chart">
        <Liveline
          :data="data"
          :value="value"
          :loading="scenario === 'loading' || scenario === 'loading-hold'"
          :paused="paused"
          :theme="theme"
          :color="color"
          :window="windowSecs"
          :grid="grid"
          :scrub="scrub"
          :badge="badge"
          :fill="fill"
          :momentum="momentum"
          :pulse="pulse"
          :exaggerate="exaggerate"
        />
      </div>

      <!-- Size Variants -->
      <p class="variants-label">Size variants</p>
      <div class="size-variants">
        <div v-for="size in SIZE_VARIANTS" :key="size.label" class="variant-item">
          <span class="variant-label">{{ size.label }}</span>
          <div
            class="variant-chart"
            :style="{ width: size.w + 'px', height: size.h + 'px' }"
          >
            <Liveline
              :data="data"
              :value="value"
              :loading="scenario === 'loading' || scenario === 'loading-hold'"
              :paused="paused"
              :theme="theme"
              :color="color"
              :window="windowSecs"
              :grid="grid && size.w >= 200"
              :scrub="scrub"
              :badge="false"
              :fill="fill"
            />
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <span>ticks: {{ data.length }}</span>
        <span>loading: {{ scenario === 'loading' || scenario === 'loading-hold' }}</span>
        <span>paused: {{ paused }}</span>
        <span>value: {{ value.toFixed(2) }}</span>
        <span>window: {{ windowSecs }}s</span>
        <span>tick: {{ tickRate }}ms</span>
        <span>volatility: {{ volatility }}</span>
      </div>
    </template>

    <!-- Multi Series Tab -->
    <template v-else>
      <!-- State Controls -->
      <section class="control-section">
        <span class="section-label">STATE</span>
        <div class="control-group">
          <button
            v-for="s in (['loading', 'loading-hold', 'live', 'empty'] as Scenario[])"
            :key="s"
            class="btn"
            :class="{ active: multiScenario === s }"
            @click="multiScenario = s"
          >
            {{ s === 'loading' ? 'Loading → Live' : s === 'loading-hold' ? 'Loading' : s === 'live' ? 'Live' : 'No Data' }}
          </button>
          <div class="sep" />
          <button class="btn" :class="{ active: multiPaused }" @click="multiPaused = !multiPaused">
            {{ multiPaused ? '▶ Play' : '⏸ Pause' }}
          </button>
        </div>
      </section>

      <!-- Series Selection -->
      <section class="control-section">
        <span class="section-label">SERIES</span>
        <div class="control-group">
          <button
            v-for="s in SERIES_PRESETS"
            :key="s.id"
            class="series-btn"
            :class="{ active: enabledSeries.includes(s.id) }"
            :style="{
              '--series-color': s.color,
              borderColor: enabledSeries.includes(s.id) ? s.color : undefined,
              background: enabledSeries.includes(s.id) ? s.color + '20' : undefined,
            }"
            @click="toggleSeries(s.id)"
          >
            <span class="series-dot" :style="{ background: s.color }" />
            {{ s.label }}
          </button>
        </div>
      </section>

      <!-- Data Controls -->
      <section class="control-section">
        <span class="section-label">DATA</span>
        <div class="control-group">
          <span class="label">Volatility:</span>
          <button
            v-for="v in VOLATILITIES"
            :key="v"
            class="btn"
            :class="{ active: volatility === v }"
            @click="volatility = v"
          >
            {{ v }}
          </button>
          <div class="sep" />
          <span class="label">Tick rate:</span>
          <button
            v-for="t in TICK_RATES"
            :key="t.ms"
            class="btn"
            :class="{ active: tickRate === t.ms }"
            @click="tickRate = t.ms"
          >
            {{ t.label }}
          </button>
        </div>
      </section>

      <!-- Window Controls -->
      <section class="control-section">
        <span class="section-label">WINDOW</span>
        <div class="control-group">
          <button
            v-for="w in TIME_WINDOWS"
            :key="w.secs"
            class="btn"
            :class="{ active: windowSecs === w.secs }"
            @click="windowSecs = w.secs"
          >
            {{ w.label }}
          </button>
        </div>
      </section>

      <!-- Theme -->
      <section class="control-section">
        <span class="section-label">THEME</span>
        <div class="control-group">
          <button class="btn" :class="{ active: theme === 'dark' }" @click="theme = 'dark'">Dark</button>
          <button class="btn" :class="{ active: theme === 'light' }" @click="theme = 'light'">Light</button>
        </div>
      </section>

      <!-- Feature Toggles -->
      <section class="control-section">
        <span class="section-label">FEATURES</span>
        <div class="control-group">
          <button class="toggle-btn" :class="{ on: grid }" @click="grid = !grid">Grid</button>
          <button class="toggle-btn" :class="{ on: scrub }" @click="scrub = !scrub">Scrub</button>
          <button class="toggle-btn" :class="{ on: fill }" @click="fill = !fill">Fill</button>
        </div>
      </section>

      <!-- Main Chart -->
      <div class="main-chart tall">
        <Liveline
          :data="[]"
          :value="0"
          :series="activeSeries"
          :loading="multiScenario === 'loading' || multiScenario === 'loading-hold'"
          :paused="multiPaused"
          :theme="theme"
          :window="windowSecs"
          :grid="grid"
          :scrub="scrub"
          :fill="fill"
        />
      </div>

      <!-- Series Values -->
      <div class="series-values">
        <div
          v-for="s in SERIES_PRESETS.filter(s => enabledSeries.includes(s.id))"
          :key="s.id"
          class="series-value-item"
        >
          <span class="series-dot" :style="{ background: s.color }" />
          <span class="series-name">{{ s.label }}:</span>
          <span class="series-val">{{ formatValue(seriesValues[s.id]) }}</span>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <span>series: {{ enabledSeries.length }}</span>
        <span>ticks: {{ seriesData.price?.length ?? 0 }}</span>
        <span>price: {{ formatValue(seriesValues.price) }}</span>
        <span>loading: {{ multiScenario === 'loading' || multiScenario === 'loading-hold' }}</span>
        <span>paused: {{ multiPaused }}</span>
        <span>window: {{ windowSecs }}s</span>
        <span>tick: {{ tickRate }}ms</span>
        <span>volatility: {{ volatility }}</span>
      </div>
    </template>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
}
</style>

<style scoped>
.demo-page {
  padding: 32px;
  max-width: 960px;
  margin: 0 auto;
  min-height: 100vh;
  transition: background 0.3s, color 0.3s;
}

.demo-page.dark {
  background: #111;
  color: #fff;
}

.demo-page:not(.dark) {
  background: #f5f5f5;
  color: #111;
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 12px;
  color: var(--fg-30);
  margin-bottom: 16px;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  padding: 4px;
  background: var(--fg-02);
  border-radius: 10px;
  width: fit-content;
}

.tab-btn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 20px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--fg-35);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--fg-45);
}

.tab-btn.active {
  background: var(--fg-08);
  color: #3b82f6;
}

/* Control Sections */
.control-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.section-label {
  font-size: 10px;
  color: var(--fg-30);
  width: 60px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.label {
  font-size: 10px;
  color: var(--fg-20);
  margin-right: 2px;
}

.sep {
  width: 1px;
  height: 16px;
  background: var(--fg-08);
  margin: 0 4px;
}

/* Buttons */
.btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--fg-08);
  background: var(--fg-02);
  color: var(--fg-45);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn:hover {
  border-color: var(--fg-20);
}

.btn.active {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.toggle-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 5px;
  border: 1px solid var(--fg-06);
  background: transparent;
  color: var(--fg-35);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.toggle-btn.on {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.color-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.color-btn.active {
  border-color: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

/* Series Buttons */
.series-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--fg-08);
  background: var(--fg-02);
  color: var(--fg-45);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.series-btn:hover {
  border-color: var(--fg-20);
}

.series-btn.active {
  color: var(--series-color);
}

.series-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Charts */
.main-chart {
  height: 320px;
  background: var(--fg-02);
  border-radius: 12px;
  border: 1px solid var(--fg-06);
  padding: 8px;
  overflow: hidden;
  margin-top: 16px;
}

.main-chart.tall {
  height: 400px;
}

.variants-label {
  font-size: 12px;
  color: var(--fg-30);
  margin-top: 24px;
  margin-bottom: 8px;
}

.size-variants {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.variant-item {
  display: flex;
  flex-direction: column;
}

.variant-label {
  font-size: 10px;
  color: var(--fg-25);
  margin-bottom: 4px;
}

.variant-chart {
  background: var(--fg-02);
  border-radius: 8px;
  border: 1px solid var(--fg-06);
  overflow: hidden;
}

/* Series Values */
.series-values {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.series-value-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fg-45);
}

.series-name {
  opacity: 0.8;
}

.series-val {
  font-family: 'SF Mono', Menlo, monospace;
  font-weight: 500;
}

/* Status Bar */
.status-bar {
  margin-top: 16px;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, monospace;
  color: var(--fg-25);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .demo-page {
    padding: 16px;
  }

  .section-label {
    width: 100%;
    margin-bottom: 4px;
  }

  .control-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .tab-bar {
    width: 100%;
  }

  .tab-btn {
    flex: 1;
  }
}
</style>
