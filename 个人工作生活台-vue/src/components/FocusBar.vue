<!--
  文件：src/components/FocusBar.vue
  说明：全局专注悬浮条。计时或暂停时在页面顶部显示任务、阶段和剩余时间，支持暂停/继续与返回专注页。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { focusState, pauseFocus, resumeFocus } from '@/services/focus'
import { useDeskStore } from '@/stores/desk'
import { fmtClock } from '@/utils/date'

const store = useDeskStore()
const router = useRouter()

const visible = computed(() => focusState.running || focusState.paused)
const taskTitle = computed(() => store.data.tasks.find((t) => t.id === focusState.taskId)?.title || '')
const phaseLabel = computed(() => {
  if (focusState.mode === 'open') return '不限时'
  if (focusState.mode === 'custom') return '自定义专注'
  return focusState.phase === 'work' ? '专注' : focusState.phase === 'short' ? '短休' : '长休'
})
const timeLabel = computed(() => fmtClock(focusState.mode === 'open' ? focusState.elapsedMs : focusState.remainMs))

function toggle() {
  if (focusState.paused) resumeFocus()
  else pauseFocus()
}
</script>

<template>
  <div v-if="visible" class="focusbar">
    <span class="t">{{ timeLabel }}</span>
    <span class="n">{{ phaseLabel }}<template v-if="taskTitle"> · {{ taskTitle }}</template></span>
    <button @click="toggle">{{ focusState.paused ? '继续' : '暂停' }}</button>
    <button @click="router.push('/focus')">打开</button>
  </div>
</template>
