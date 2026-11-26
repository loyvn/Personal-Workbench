<!--
  文件：src/views/DataView.vue
  说明：数据页壳层。渲染数据面板，展示设备、存储模式、导出导入、快照与清空等数据安全能力。
  结构：页头设备与存储模式 → 数据面板（体积/导出导入/快照/自动快照/示例与清空）
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import DataPanel from '@/views/settings/DataPanel.vue'
import { useDeskStore } from '@/stores/desk'

const store = useDeskStore()
</script>

<template>
  <PageHeader
    title="数据"
    :subtitle="`${store.data.deviceName} · 备份、快照与导入导出 · ${store.modeLabel.includes('express') ? '数据落在本机服务端' : '数据落在浏览器本地'}`"
  />
  <DataPanel />
</template>
