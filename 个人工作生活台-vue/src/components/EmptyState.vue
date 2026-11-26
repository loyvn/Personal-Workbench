<!--
  文件：src/components/EmptyState.vue
  说明：通用空态占位。统一空态标题、说明与可选行动按钮的视觉。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
withDefaults(defineProps<{ title: string; desc?: string; action?: string }>(), { desc: '', action: '' })
defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <div class="empty">
    <div class="et">{{ title }}</div>
    <div v-if="desc">{{ desc }}</div>
    <div v-if="action" class="eb">
      <button class="btn btn-primary" @click="$emit('action')">{{ action }}</button>
    </div>
  </div>
</template>
