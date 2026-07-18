import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { existsSync, readdirSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

function katexFontOptimizer(): Plugin {
  return {
    name: 'katex-font-optimizer',
    closeBundle() {
      const assetsDir = resolve(__dirname, 'dist', 'assets')
      if (!existsSync(assetsDir)) return
      const files = readdirSync(assetsDir)
      for (const file of files) {
        if (file.endsWith('.ttf') || file.endsWith('.woff')) {
          unlinkSync(resolve(assetsDir, file))
        }
      }
      for (const file of files) {
        if (file.endsWith('.css')) {
          let css = readFileSync(resolve(assetsDir, file), 'utf-8')
          css = css.replace(/,\s*url\([^)]+\.woff\)\s*format\("woff"\)/gi, '')
          css = css.replace(/,\s*url\([^)]+\.ttf\)\s*format\("truetype"\)/gi, '')
          writeFileSync(resolve(assetsDir, file), css, 'utf-8')
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    katexFontOptimizer(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
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
