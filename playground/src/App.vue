<script setup lang="ts">
import { Liveline } from 'vue-liveline'
import { useLivelineDemo, type Scenario } from './demo/useLivelineDemo'

const {
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
} = useLivelineDemo()
</script>

<template>
  <div
    class="demo-page"
    :class="{ dark: isDark }"
    :style="cssVars"
  >
    <h1 class="title">Vue Liveline</h1>
    <p class="subtitle">Real-time data visualization component for Vue 3 / Vue 3 实时数据可视化组件</p>

    <!-- Tab Switcher -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'single' }"
        @click="activeTab = 'single'"
      >
        Single Series (单系列)
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'multi' }"
        @click="activeTab = 'multi'"
      >
        Multi Series (多系列)
      </button>
    </div>

    <!-- Single Series Tab -->
    <template v-if="activeTab === 'single'">
      <!-- State Controls -->
      <section class="control-section">
        <span class="section-label">STATE (状态)</span>
        <div class="control-group">
          <button
            v-for="s in (['loading', 'loading-hold', 'live', 'empty'] as Scenario[])"
            :key="s"
            class="btn"
            :class="{ active: scenario === s }"
            @click="scenario = s"
          >
            {{ s === 'loading' ? 'Loading → Live (加载→实时)' : s === 'loading-hold' ? 'Loading (加载中)' : s === 'live' ? 'Live (实时)' : 'No Data (无数据)' }}
          </button>
          <div class="sep" />
          <button class="btn" :class="{ active: paused }" @click="paused = !paused">
            {{ paused ? '▶ Play (播放)' : '⏸ Pause (暂停)' }}
          </button>
        </div>
      </section>

      <!-- Data Controls -->
      <section class="control-section">
        <span class="section-label">DATA (数据)</span>
        <div class="control-group">
          <span class="label">Volatility (波动):</span>
          <button
            v-for="v in VOLATILITIES"
            :key="v"
            class="btn"
            :class="{ active: volatility === v }"
            @click="volatility = v"
          >
            {{ v === 'calm' ? 'calm (平稳)' : v === 'normal' ? 'normal (正常)' : v === 'spiky' ? 'spiky (尖峰)' : 'chaos (混乱)' }}
          </button>
          <div class="sep" />
          <span class="label">Tick rate (刷新率):</span>
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
        <span class="section-label">WINDOW (窗口)</span>
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
        <span class="section-label">THEME (主题)</span>
        <div class="control-group">
          <button class="btn" :class="{ active: theme === 'dark' }" @click="theme = 'dark'">Dark (深色)</button>
          <button class="btn" :class="{ active: theme === 'light' }" @click="theme = 'light'">Light (浅色)</button>
          <div class="sep" />
          <span class="label">Color (颜色):</span>
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
        <span class="section-label">FEATURES (特性)</span>
        <div class="control-group">
          <button class="toggle-btn" :class="{ on: grid }" @click="grid = !grid">Grid (网格)</button>
          <button class="toggle-btn" :class="{ on: scrub }" @click="scrub = !scrub">Scrub (十字线)</button>
          <button class="toggle-btn" :class="{ on: badge }" @click="badge = !badge">Badge (徽章)</button>
          <button class="toggle-btn" :class="{ on: fill }" @click="fill = !fill">Fill (填充)</button>
          <button class="toggle-btn" :class="{ on: momentum }" @click="momentum = !momentum">Momentum (动量)</button>
          <button class="toggle-btn" :class="{ on: pulse }" @click="pulse = !pulse">Pulse (脉冲)</button>
          <button class="toggle-btn" :class="{ on: exaggerate }" @click="exaggerate = !exaggerate">Exaggerate (夸张)</button>
          <button class="toggle-btn" :class="{ on: degen }" @click="degen = !degen">Degen (粒子)</button>
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
          :degen="degen"
        />
      </div>

      <!-- Size Variants -->
      <p class="variants-label">Size variants (尺寸变体)</p>
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
              :degen="degen"
            />
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <span>ticks (数据点): {{ data.length }}</span>
        <span>loading (加载): {{ scenario === 'loading' || scenario === 'loading-hold' }}</span>
        <span>paused (暂停): {{ paused }}</span>
        <span>value (值): {{ value.toFixed(2) }}</span>
        <span>window (窗口): {{ windowSecs }}s</span>
        <span>tick (刷新): {{ tickRate }}ms</span>
        <span>volatility (波动): {{ volatility }}</span>
      </div>
    </template>

    <!-- Multi Series Tab -->
    <template v-else>
      <!-- State Controls -->
      <section class="control-section">
        <span class="section-label">STATE (状态)</span>
        <div class="control-group">
          <button
            v-for="s in (['loading', 'loading-hold', 'live', 'empty'] as Scenario[])"
            :key="s"
            class="btn"
            :class="{ active: multiScenario === s }"
            @click="multiScenario = s"
          >
            {{ s === 'loading' ? 'Loading → Live (加载→实时)' : s === 'loading-hold' ? 'Loading (加载中)' : s === 'live' ? 'Live (实时)' : 'No Data (无数据)' }}
          </button>
          <div class="sep" />
          <button class="btn" :class="{ active: multiPaused }" @click="multiPaused = !multiPaused">
            {{ multiPaused ? '▶ Play (播放)' : '⏸ Pause (暂停)' }}
          </button>
        </div>
      </section>

      <!-- Series Selection -->
      <section class="control-section">
        <span class="section-label">SERIES (系列)</span>
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
            {{ s.id === 'price' ? 'Price (价格)' : s.id === 'volume' ? 'Volume (成交量)' : s.id === 'trades' ? 'Trades (交易)' : 'Depth (深度)' }}
          </button>
        </div>
      </section>

      <!-- Data Controls -->
      <section class="control-section">
        <span class="section-label">DATA (数据)</span>
        <div class="control-group">
          <span class="label">Volatility (波动):</span>
          <button
            v-for="v in VOLATILITIES"
            :key="v"
            class="btn"
            :class="{ active: volatility === v }"
            @click="volatility = v"
          >
            {{ v === 'calm' ? 'calm (平稳)' : v === 'normal' ? 'normal (正常)' : v === 'spiky' ? 'spiky (尖峰)' : 'chaos (混乱)' }}
          </button>
          <div class="sep" />
          <span class="label">Tick rate (刷新率):</span>
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
        <span class="section-label">WINDOW (窗口)</span>
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
        <span class="section-label">THEME (主题)</span>
        <div class="control-group">
          <button class="btn" :class="{ active: theme === 'dark' }" @click="theme = 'dark'">Dark (深色)</button>
          <button class="btn" :class="{ active: theme === 'light' }" @click="theme = 'light'">Light (浅色)</button>
        </div>
      </section>

      <!-- Feature Toggles -->
      <section class="control-section">
        <span class="section-label">FEATURES (特性)</span>
        <div class="control-group">
          <button class="toggle-btn" :class="{ on: grid }" @click="grid = !grid">Grid (网格)</button>
          <button class="toggle-btn" :class="{ on: scrub }" @click="scrub = !scrub">Scrub (十字线)</button>
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
          <span class="series-name">{{ s.id === 'price' ? 'Price (价格)' : s.id === 'volume' ? 'Volume (成交量)' : s.id === 'trades' ? 'Trades (交易)' : 'Depth (深度)' }}:</span>
          <span class="series-val">{{ formatValue(seriesValues[s.id]) }}</span>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <span>series (系列): {{ enabledSeries.length }}</span>
        <span>ticks (数据点): {{ seriesData.price?.length ?? 0 }}</span>
        <span>price (价格): {{ formatValue(seriesValues.price) }}</span>
        <span>loading (加载): {{ multiScenario === 'loading' || multiScenario === 'loading-hold' }}</span>
        <span>paused (暂停): {{ multiPaused }}</span>
        <span>window (窗口): {{ windowSecs }}s</span>
        <span>tick (刷新): {{ tickRate }}ms</span>
        <span>volatility (波动): {{ volatility }}</span>
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
