import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Demo page configuration for GitHub Pages
export default defineConfig({
  plugins: [vue()],
  base: '/vue-liveline/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-demo',
  },
})
