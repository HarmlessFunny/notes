import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = parseInt(env.FRONTEND_PORT || '5173', 10)
  const backendPort = parseInt(env.BACKEND_PORT || '5000', 10)
  const backendTarget = `http://localhost:${backendPort}`

  return {
    plugins: [
      vue(),
      vueDevTools(),
      AutoImport({ resolvers: [ElementPlusResolver()] }),
      Components({ resolvers: [ElementPlusResolver()] }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      port: frontendPort,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path,
        },
        '/assets': {
          target: backendTarget,
          changeOrigin: true,
        }
      },
    },
    build: {
      outDir: './backend/dist',
      assetsDir: 'assets',
      emptyOutDir: true,
    },
  }
})
