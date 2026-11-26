<!--
  文件：src/components/MobileNav.vue
  说明：窄屏底部导航。按模块开关过滤五个一级分组，高亮当前分组。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { NAV_GROUPS } from '@/constants/nav'
import { useDeskStore } from '@/stores/desk'
import Icon from '@/components/Icon.vue'
import type { PageKey } from '@/constants/nav'

const store = useDeskStore()
const route = useRoute()

const groups = computed(() =>
  NAV_GROUPS.map((g) => ({
    name: g.name,
    pages: g.pages.filter((p) => (p === 'home' ? true : store.data.modules[p] !== 0))
  })).filter((g) => g.pages.length)
)

const activeKey = computed<PageKey>(() => (route.meta.key as PageKey) || 'home')
</script>

<template>
  <nav class="mobilenav">
    <RouterLink
      v-for="g in groups"
      :key="g.name"
      :to="g.pages[0] === 'home' ? '/' : `/${g.pages[0]}`"
      :class="{ on: g.pages.includes(activeKey) }"
    >
      <Icon :name="g.pages[0]" :size="19" />
      <span>{{ g.name }}</span>
    </RouterLink>
  </nav>
</template>
