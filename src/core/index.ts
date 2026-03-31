// 组件导出
export { default as Liveline } from './components/Liveline.vue'
export { default as LivelineComponent } from './components/Liveline.vue'

// 组合式函数导出
export { useLivelineEngine } from './useLivelineEngine'

// 主题导出
export { resolveTheme, resolveSeriesPalettes, parseColorRgb, SERIES_COLORS } from './theme'

// 绘制模块导出
export {
  drawFrame,
  drawMultiFrame,
  drawGrid,
  drawLine,
  drawDot,
  drawArrows,
  drawSimpleDot,
  drawMultiDot,
  drawCrosshair,
  drawMultiCrosshair,
  drawReferenceLine,
  drawTimeAxis,
  drawOrderbook,
  drawParticles,
  spawnOnSwing,
  drawEmpty,
  drawLoading,
  createGridState,
  createTimeAxisState,
  createOrderbookState,
  createParticleState,
  createShakeState,
  createArrowState,
  FADE_EDGE_WIDTH,
} from './draw'

// 数学工具导出
export { lerp } from './math/lerp'
export { computeRange } from './math/range'
export { detectMomentum } from './math/momentum'
export { interpolateAtTime } from './math/interpolate'
export { niceTimeInterval } from './math/intervals'
export { drawSpline } from './math/spline'

// Canvas工具导出
export { getDpr, applyDpr } from './canvas/dpr'

// 类型导出
export type {
  LivelineProps,
  LivelinePoint,
  LivelineSeries,
  LivelinePalette,
  ChartLayout,
  ReferenceLine,
  Momentum,
  ThemeMode,
  HoverPoint,
  Padding,
  WindowOption,
  WindowStyle,
  BadgeVariant,
  OrderbookData,
  DegenOptions,
} from './types'

export type {
  GridState,
  TimeAxisState,
  OrderbookState,
  ParticleState,
  ShakeState,
  ArrowState,
  MultiSeriesHoverEntry,
} from './draw'

export type { EngineConfig } from './useLivelineEngine'

// 插件安装
import type { App } from 'vue'
import Liveline from './components/Liveline.vue'

export default {
  install(app: App) {
    app.component('Liveline', Liveline)
    app.component('LivelineComponent', Liveline)
  },
}
