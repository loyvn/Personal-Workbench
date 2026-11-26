/**
 * 文件：src/main.ts
 * 说明：前端启动入口。创建 Vue 应用、安装 Pinia 与路由、初始化音乐运行态，并在挂载后启动本地数据引导流程。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import router from '@/router'
import '@/styles/main.css'
import { useDeskStore } from '@/stores/desk'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

const store = useDeskStore(pinia)

store
  .bootstrap()
  .then(() => {
    app.mount('#app')
    window.addEventListener('beforeunload', () => {
      void store.flush()
    })
  })
  .catch((e: unknown) => {
    console.error('[desk] bootstrap failed', e)
    app.mount('#app')
  })
