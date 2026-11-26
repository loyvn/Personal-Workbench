/**
 * 文件：src/composables/useMedia.ts
 * 说明：响应式媒体查询 composable。返回响应式布尔值并自动注册/清理 change 监听。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useMedia(query: string) {
  const matches = ref(false)
  let mql: MediaQueryList | null = null

  const update = (e: MediaQueryListEvent | MediaQueryList) => {
    matches.value = e.matches
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    update(mql)
    mql.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', update)
  })

  return matches
}
