<!--
  文件：src/components/StatusTag.vue
  说明：状态标签。按状态码映射中文文案与颜色，统一任务、内容、作品等状态呈现。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { statusLabel, statusTone } from '@/utils/misc'
const props = defineProps<{ status: string; text?: string }>()
</script>

<template>
  <span class="tag" :class="statusTone(props.status)">{{ text || statusLabel(props.status) }}</span>
</template>
