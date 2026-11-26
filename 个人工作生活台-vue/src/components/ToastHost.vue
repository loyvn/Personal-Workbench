<!--
  文件：src/components/ToastHost.vue
  说明：全局轻提示宿主。订阅 ui store 的 toast 队列，自动消失并处理多条堆叠。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
</script>

<template>
  <div v-if="ui.messages.length" class="message-host" aria-live="polite">
    <div v-for="t in ui.messages" :key="t.id" class="el-message" :class="t.kind">
      <span class="el-message-icon">{{ t.kind === 'err' ? '!' : '✓' }}</span>
      <span class="el-message-text">{{ t.message }}</span>
      <button class="el-message-close" aria-label="关闭提示" @click="ui.dismissMessage(t.id)">×</button>
    </div>
  </div>

  <div class="toast-host">
    <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.message }}</div>
  </div>
</template>
