<!--
  文件：src/components/PageHeader.vue
  说明：页面标题组件。统一标题、副标题和右侧操作插槽。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="page-head">
    <h1>{{ title }}</h1>
    <div v-if="subtitle" class="sub">{{ subtitle }}</div>
    <div class="spacer" />
    <div class="page-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
