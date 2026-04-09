import { ref, computed, onUnmounted, watch } from 'vue'
import type { LivelinePoint, LivelineSeries } from '../../../src'

export type Volatility = 'calm' | 'normal' | 'spiky' | 'chaos'
export type Scenario = 'loading' | 'loading-hold' | 'live' | 'empty'
type TabType = 'single' | 'multi'

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

export const SIZE_VARIANTS = [
  { w: 320, h: 180, label: '320×180' },
  { w: 240, h: 120, label: '240×120' },
  { w: 160, h: 100, label: '160×100' },
  { w: 120, h: 80, label: '120×80' },
]

export const SERIES_PRESETS = [
  { id: 'price', label: 'Price', color: '#3b82f6', base: 100 },
  { id: 'volume', label: 'Volume', color: '#22c55e', base: 50 },
  { id: 'trades', label: 'Trades', color: '#f59e0b', base: 200 },
  { id: 'depth', label: 'Depth', color: '#ec4899', base: 80 },
]

function generatePoint(prev: number, time: number, vol: Volatility, baseValue = 100): LivelinePoint {
  const v: Record<Volatility, number> = { calm: 0.15, normal: 0.8, spiky: 3, chaos: 8 }
  const bias: Record<Volatility, number> = { calm: 0.49, normal: 0.48, spiky: 0.47, chaos: 0.45 }
  const priceScale = baseValue / 100
  const scale = v[vol] * priceScale
  const spike = (vol === 'spiky' || vol === 'chaos') && Math.random() < 0.08
    ? (Math.random() - 0.5) * scale * 3
    : 0
  const delta = (Math.random() - bias[vol]) * scale + spike
  return { time, value: prev + delta }
}

export function useLivelineDemo() {
  const activeTab = ref<TabType>('single')

  const scenario = ref<Scenario>('loading')
  const data = ref<LivelinePoint[]>([])
  const value = ref(100)
  const paused = ref(false)

  const theme = ref<'dark' | 'light'>('dark')
  const color = ref('#3b82f6')
  const windowSecs = ref(30)
  const volatility = ref<Volatility>('normal')
  const tickRate = ref(300)

  const grid = ref(true)
  const scrub = ref(true)
  const badge = ref(true)
  const fill = ref(true)
  const momentum = ref(true)
  const pulse = ref(true)
  const exaggerate = ref(false)
  const degen = ref(false)

  let lastValue = 100
  let intervalId: number | null = null
  const maxTicks = 1200

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

  function formatValue(v: number | undefined): string {
    if (v == null || isNaN(v)) return '--'
    return v.toFixed(2)
  }

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
      const t = Date.now() / 1000
      const pt = generatePoint(lastValue, t, volatility.value, 100)
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

  function startMultiLive() {
    if (multiIntervalId) clearInterval(multiIntervalId)

    const now = Date.now() / 1000
    const seedCount = 500

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

    seriesData.value = newData
    seriesValues.value = newValues
    console.log('[startMultiLive] Initial values:', JSON.stringify(newValues))

    multiIntervalId = window.setInterval(() => {
      if (multiPaused.value) return
      const t = Date.now() / 1000

      for (const s of SERIES_PRESETS) {
        const pt = generatePoint(multiLastValues[s.id], t, volatility.value, s.base)
        multiLastValues[s.id] = pt.value
        seriesValues.value[s.id] = pt.value
        seriesData.value[s.id] = [...seriesData.value[s.id].slice(-maxTicks), pt]
      }

      seriesValues.value = { ...seriesValues.value }
      seriesData.value = { ...seriesData.value }

      console.log(activeSeries.value)

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

  const colorPresets = [
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#22c55e' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Orange', value: '#f59e0b' },
    { label: 'Pink', value: '#ec4899' },
  ]

  return {
    TIME_WINDOWS,
    TICK_RATES,
    VOLATILITIES,
    SIZE_VARIANTS,
    SERIES_PRESETS,
    colorPresets,
    activeTab,
    scenario,
    data,
    value,
    paused,
    theme,
    color,
    windowSecs,
    volatility,
    tickRate,
    grid,
    scrub,
    badge,
    fill,
    momentum,
    pulse,
    exaggerate,
    degen,
    multiScenario,
    multiPaused,
    enabledSeries,
    seriesData,
    seriesValues,
    isDark,
    cssVars,
    activeSeries,
    formatValue,
    toggleSeries,
  }
}
