import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vueSetupExtend from 'vite-plugin-vue-setup-extend'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    vueSetupExtend(),
    AutoImport({resolvers: [ElementPlusResolver()]}),
    Components({resolvers: [ElementPlusResolver()]}),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/static': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    },
  },
  build: {
    outDir: './dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
})
