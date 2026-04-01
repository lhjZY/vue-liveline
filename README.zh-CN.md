# Vue Liveline

**[在线演示](https://lhjzy.github.io/vue-liveline/)** | [English](./README.md)

一个美观、高性能的 Vue 3 实时数据可视化组件。适用于金融图表、监控仪表盘和实时数据展示。

## 特性

- **实时更新** - 流畅的实时数据流动画
- **多种模式** - 支持单系列和多系列图表
- **丰富交互** - 十字光标、悬停提示、时间窗口控制
- **高度定制** - 主题、颜色、网格、标签、动量指示器
- **高性能** - 基于 Canvas 渲染，60fps 流畅动画
- **TypeScript 支持** - 完整的类型定义
- **轻量级** - 压缩后约 15KB

## 安装

```bash
npm install vue-liveline
```

## 快速开始

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

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `data` | `LivelinePoint[]` | 必填 | 数据点数组 `{ time: number, value: number }` |
| `value` | `number` | 必填 | 当前实时值 |
| `color` | `string` | `'#3b82f6'` | 主题颜色 |
| `theme` | `'light' \| 'dark'` | `'dark'` | 颜色主题 |
| `window` | `number` | `30` | 时间窗口（秒） |
| `grid` | `boolean` | `true` | 显示网格线 |
| `badge` | `boolean` | `true` | 显示价格标签 |
| `momentum` | `boolean \| Momentum` | `true` | 显示动量指示器 |
| `fill` | `boolean` | `true` | 显示填充渐变 |
| `loading` | `boolean` | `false` | 显示加载动画 |
| `paused` | `boolean` | `false` | 暂停图表更新 |
| `scrub` | `boolean` | `true` | 启用十字光标 |
| `pulse` | `boolean` | `true` | 显示实时点脉冲动画 |
| `exaggerate` | `boolean` | `false` | 紧凑 Y 轴范围 |

### 多系列

```vue
<Liveline
  :data="[]"
  :value="0"
  :series="[
    { id: 'price', data: priceData, value: priceValue, color: '#3b82f6', label: '价格' },
    { id: 'volume', data: volumeData, value: volumeValue, color: '#f59e0b', label: '成交量' },
  ]"
/>
```

### 时间窗口

```vue
<Liveline
  :data="data"
  :value="value"
  :windows="[
    { label: '30秒', secs: 30 },
    { label: '1分钟', secs: 60 },
    { label: '5分钟', secs: 300 },
  ]"
  window-style="rounded"
/>
```

### 参考线

```vue
<Liveline
  :data="data"
  :value="value"
  :reference-line="{ value: 100, label: '目标' }"
/>
```

### 自定义格式化

```vue
<Liveline
  :data="data"
  :value="value"
  :format-value="(v) => `¥${v.toFixed(2)}`"
  :format-time="(t) => new Date(t * 1000).toLocaleTimeString('zh-CN')"
/>
```

## 事件

| 事件 | 参数 | 描述 |
|------|------|------|
| `hover` | `HoverPoint \| null` | 悬停在图表上时触发 |
| `update:window` | `number` | 时间窗口改变时触发 |
| `seriesToggle` | `(id: string, visible: boolean)` | 系列可见性改变时触发 |

## 高级功能

### Degen 模式（粒子 & 震动）

```vue
<Liveline
  :data="data"
  :value="value"
  :degen="{ scale: 1.5, downMomentum: true }"
/>
```

### 订单簿叠加

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

## 浏览器支持

- Chrome（最新版）
- Firefox（最新版）
- Safari（最新版）
- Edge（最新版）

## 许可证

MIT
