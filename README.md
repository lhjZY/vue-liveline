# Vue Liveline

[中文文档](./README.zh-CN.md)

A beautiful, high-performance real-time data visualization component for Vue 3. Perfect for financial charts, monitoring dashboards, and live data displays.

## Features

- **Real-time Updates** - Smooth animations for live data streaming
- **Multiple Modes** - Single series, multi-series support
- **Rich Interactions** - Crosshair, hover tooltips, time window controls
- **Customizable** - Themes, colors, grid, badges, momentum indicators
- **High Performance** - Canvas-based rendering with 60fps animations
- **TypeScript Ready** - Full type definitions included
- **Lightweight** - ~15KB gzipped

## Installation

```bash
npm install vue-liveline
```

## Quick Start

```vue
<script setup>
import { ref } from 'vue'
import { Liveline } from 'vue-liveline'
import 'vue-liveline/dist/vue-liveline.css'

const data = ref([
  { time: Date.now() / 1000 - 60, value: 100 },
  { time: Date.now() / 1000 - 30, value: 105 },
  { time: Date.now() / 1000, value: 102 },
])
const value = ref(102)
</script>

<template>
  <div style="height: 300px">
    <Liveline :data="data" :value="value" color="#3b82f6" />
  </div>
</template>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `LivelinePoint[]` | Required | Array of data points `{ time: number, value: number }` |
| `value` | `number` | Required | Current live value |
| `color` | `string` | `'#3b82f6'` | Primary accent color |
| `theme` | `'light' \| 'dark'` | `'dark'` | Color theme |
| `window` | `number` | `30` | Time window in seconds |
| `grid` | `boolean` | `true` | Show grid lines |
| `badge` | `boolean` | `true` | Show price badge |
| `momentum` | `boolean \| Momentum` | `true` | Show momentum indicators |
| `fill` | `boolean` | `true` | Show fill gradient |
| `loading` | `boolean` | `false` | Show loading animation |
| `paused` | `boolean` | `false` | Pause chart updates |
| `scrub` | `boolean` | `true` | Enable crosshair scrubbing |
| `pulse` | `boolean` | `true` | Show pulse animation on live dot |
| `exaggerate` | `boolean` | `false` | Tight Y-axis range |

### Multi-Series

```vue
<Liveline
  :data="[]"
  :value="0"
  :series="[
    { id: 'price', data: priceData, value: priceValue, color: '#3b82f6', label: 'Price' },
    { id: 'volume', data: volumeData, value: volumeValue, color: '#f59e0b', label: 'Volume' },
  ]"
/>
```

### Time Windows

```vue
<Liveline
  :data="data"
  :value="value"
  :windows="[
    { label: '30s', secs: 30 },
    { label: '1m', secs: 60 },
    { label: '5m', secs: 300 },
  ]"
  window-style="rounded"
/>
```

### Reference Line

```vue
<Liveline
  :data="data"
  :value="value"
  :reference-line="{ value: 100, label: 'Target' }"
/>
```

### Custom Formatting

```vue
<Liveline
  :data="data"
  :value="value"
  :format-value="(v) => `$${v.toFixed(2)}`"
  :format-time="(t) => new Date(t * 1000).toLocaleTimeString()"
/>
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `hover` | `HoverPoint \| null` | Fired when hovering over the chart |
| `update:window` | `number` | Fired when time window changes |
| `seriesToggle` | `(id: string, visible: boolean)` | Fired when series visibility changes |

## Advanced Features

### Degen Mode (Particles & Shake)

```vue
<Liveline
  :data="data"
  :value="value"
  :degen="{ scale: 1.5, downMomentum: true }"
/>
```

### Orderbook Overlay

```vue
<Liveline
  :data="data"
  :value="value"
  :orderbook="{
    bids: [[99, 100], [98, 200]],
    asks: [[101, 150], [102, 250]],
  }"
/>
```

## TypeScript

```typescript
import type {
  LivelinePoint,
  LivelineProps,
  LivelineSeries,
  Momentum,
  HoverPoint,
} from 'vue-liveline'
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT
