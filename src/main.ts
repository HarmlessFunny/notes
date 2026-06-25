import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.mount('#app')

// 全局样式：防止移动端水平溢出
const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after {
    box-sizing: border-box;
  }
  body {
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
`
document.head.appendChild(style)
