<!--
  文件：src/views/SettingsView.vue
  说明：基础设置页壳层。承载个人称呼、主题、背景、专注偏好、音乐服务与模块开关等设置面板。
  结构：页头 → 基础设置面板（身份/主题/背景/动效/专注/音乐/模块开关）
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import PageHeader from '@/components/PageHeader.vue'
import BasicPanel from '@/views/settings/BasicPanel.vue'
import { useDeskStore } from '@/stores/desk'

const store = useDeskStore()
</script>

<template>
  <PageHeader
    title="基础设置"
    :subtitle="`${store.data.deviceName} · 主题、背景、首页与模块开关，改动即时保存`"
  />
  <BasicPanel />
</template>
