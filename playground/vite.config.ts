import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages: https://<user>.github.io/vue-liveline/
export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? '/vue-liveline/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
