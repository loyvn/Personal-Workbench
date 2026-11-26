<!--
  文件：src/components/KpiCard.vue
  说明：通用 KPI 卡片。展示标题、主数值、单位和可选补充说明，供首页与统计区复用。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    unit?: string
    sub?: string
    tone?: '' | 'warn'
    to?: string
  }>(),
  { unit: '', sub: '', tone: '', to: '' }
)
</script>

<template>
  <component :is="to ? 'router-link' : 'div'" :to="to || undefined" class="kpi" style="text-decoration: none; color: inherit">
    <div class="kv">{{ value }} <small v-if="unit">{{ unit }}</small></div>
    <div class="kl">{{ label }}</div>
    <div class="ks" :class="tone">{{ sub }}</div>
  </component>
</template>
