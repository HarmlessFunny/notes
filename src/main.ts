import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import axios from 'axios'

// Element Plus 暗色模式 CSS 变量
import 'element-plus/theme-chalk/dark/css-vars.css'

declare global {
  interface Window { __API_BASE__?: string }
}

const API_BASE = window.__API_BASE__ || 'http://127.0.0.1:5000'
window.__API_BASE__ = API_BASE
axios.defaults.baseURL = API_BASE
const origFetch = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && (input.startsWith('/api/') || input.startsWith('/uploads/'))) {
    input = API_BASE + input
  }
  return origFetch(input, init)
}

const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.mount('#app')

// 全局样式
const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after {
    box-sizing: border-box;
  }
  html {
    background-color: var(--el-bg-color);
  }
  body {
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    background-color: var(--el-bg-color);
  }



  /* 切换主题时临时禁用过渡，防止 el 自带 transition 产生动画（排除 switch，保持按钮手感） */
  .no-transition, .no-transition *:not(.el-switch):not(.el-switch *) {
    transition-duration: 0s !important;
  }

  .dark .markdown-body {
    color-scheme: dark;
    --color-canvas-default: transparent;
  }
  .dark img {
    opacity: 0.85;
  }
  .dark img:hover {
    opacity: 1;
  }
  .dark .el-image-viewer__img {
    opacity: 1;
  }

  /* 暗色模式下降低按钮亮度，避免在深色背景上刺眼 */
  .dark .el-button--primary,
  .dark .el-button--success,
  .dark .el-button--warning,
  .dark .el-button--danger {
    filter: brightness(0.82);
  }

`
document.head.appendChild(style)
