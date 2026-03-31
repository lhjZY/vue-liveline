export interface LivelinePoint {
  time: number
  value: number
}

export type Momentum = 'up' | 'down' | 'flat'
export type ThemeMode = 'light' | 'dark'
export type BadgeVariant = 'default' | 'minimal'
export type WindowStyle = 'default' | 'rounded' | 'text'

export interface ReferenceLine {
  value: number
  label?: string
}

export interface HoverPoint {
  time: number
  value: number
  x: number
  y: number
}

export interface Padding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface WindowOption {
  label: string
  secs: number
}

export interface LivelineSeries {
  id: string
  data: LivelinePoint[]
  value: number
  color: string
  label?: string
}

export interface OrderbookData {
  bids: [number, number][]  // [price, size][]
  asks: [number, number][]  // [price, size][]
}

export interface DegenOptions {
  /** Multiplier for particle count and size (default 1) */
  scale?: number
  /** Show particles on down-momentum swings (default false) */
  downMomentum?: boolean
}

export interface LivelineProps {
  data: LivelinePoint[]
  value: number

  // Multi-series mode — when provided, overrides data/value/color
  series?: LivelineSeries[]

  // Appearance
  theme?: ThemeMode
  color?: string

  // Time
  window?: number

  // Feature flags
  grid?: boolean
  badge?: boolean
  momentum?: boolean | Momentum
  fill?: boolean
  loading?: boolean
  paused?: boolean
  emptyText?: string
  scrub?: boolean
  exaggerate?: boolean
  showValue?: boolean
  valueMomentumColor?: boolean
  degen?: boolean | DegenOptions
  badgeTail?: boolean
  badgeVariant?: BadgeVariant
  pulse?: boolean

  // Time window buttons
  windows?: WindowOption[]
  onWindowChange?: (secs: number) => void
  windowStyle?: WindowStyle

  // Crosshair
  tooltipY?: number
  tooltipOutline?: boolean

  // Orderbook
  orderbook?: OrderbookData

  // Optional
  referenceLine?: ReferenceLine
  formatValue?: (value: number) => string
  formatTime?: (time: number) => string
  lerpSpeed?: number
  padding?: Padding
  onHover?: (point: HoverPoint | null) => void
  cursor?: string
  lineWidth?: number
  onSeriesToggle?: (id: string, visible: boolean) => void
  seriesToggleCompact?: boolean
}

export interface LivelinePalette {
  line: string
  lineWidth: number
  fillTop: string
  fillBottom: string
  gridLine: string
  gridLabel: string
  dotUp: string
  dotDown: string
  dotFlat: string
  glowUp: string
  glowDown: string
  glowFlat: string
  badgeOuterBg: string
  badgeOuterShadow: string
  badgeBg: string
  badgeText: string
  dashLine: string
  refLine: string
  refLabel: string
  timeLabel: string
  crosshairLine: string
  tooltipBg: string
  tooltipText: string
  tooltipBorder: string
  bgRgb: [number, number, number]
  labelFont: string
  valueFont: string
  badgeFont: string
}

export interface ChartLayout {
  w: number
  h: number
  pad: Required<Padding>
  chartW: number
  chartH: number
  leftEdge: number
  rightEdge: number
  minVal: number
  maxVal: number
  valRange: number
  toX: (time: number) => number
  toY: (value: number) => number
}
