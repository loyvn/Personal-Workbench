<!--
  文件：src/components/SideNav.vue
  说明：桌面侧边导航。按 NAV_GROUPS 渲染分组，支持折叠为图标栏、分组浮层、模块隐藏和当前页高亮。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { NAV_GROUPS, PAGE_MAP } from '@/constants/nav'
import { useDeskStore } from '@/stores/desk'
import Icon from '@/components/Icon.vue'
import { navState, toggleGroup, toggleRail } from '@/utils/navPrefs'
import type { PageKey } from '@/constants/nav'

const store = useDeskStore()
const route = useRoute()
const router = useRouter()

/**
 * 导航分组按模块开关过滤。
 * 关闭的页面从导航移除但仍保留数据；整组都被关闭时该分组不渲染，
 * 避免侧栏出现空标题或点了会被路由守卫弹回首页的入口。
 */
const groups = computed(() =>
  NAV_GROUPS.map((g) => ({
    name: g.name,
    pages: g.pages.filter((p) => store.data.modules[p] !== 0) as PageKey[]
  })).filter((g) => g.pages.length)
)

const activeKey = computed<PageKey>(() => (route.meta.key as PageKey) || 'home')

const path = (key: string) => (key === 'home' ? '/' : `/${key}`)

/** 图标栏里当前展开的二级分组（同时只有一个） */
const railOpen = ref<string | null>(null)

/**
 * 图标栏模式的分组点击。
 * 单页分组直接跳转；多页分组展开浮层，同时只允许一个分组展开；
 * 再次点击同一分组则收起，形成简单的手风琴交互。
 */
function toggleRailGroup(group: { name: string; pages: PageKey[] }): void {
  if (group.pages.length === 1) {
    railOpen.value = null
    void router.push(path(group.pages[0]))
    return
  }
  railOpen.value = railOpen.value === group.name ? null : group.name
}

watch(
  () => route.fullPath,
  () => {
    railOpen.value = null
  }
)

watch(
  () => navState.rail,
  (rail) => {
    if (!rail) railOpen.value = null
  }
)

/** 点击浮层与分组按钮之外关闭二级菜单，保证 rail 模式不会同时弹多个层 */
function onDocDown(e: PointerEvent): void {
  if (!railOpen.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.rail-flyout') || target?.closest('.rail-group')) return
  railOpen.value = null
}

onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))
</script>

<template>
  <aside class="side" :class="{ rail: navState.rail }">
    <div class="side-top">
      <RouterLink v-if="!navState.rail" to="/" class="brand">
        <div class="bt">个人工作生活台</div>
        <div class="bs">PERSONAL DESK</div>
      </RouterLink>
      <button
        class="rail-toggle"
        :title="navState.rail ? '展开导航' : '收起导航'"
        :aria-label="navState.rail ? '展开导航' : '收起导航'"
        :aria-expanded="!navState.rail"
        @click="toggleRail"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path
            :d="navState.rail ? 'M9 5 L16 12 L9 19' : 'M15 5 L8 12 L15 19'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <template v-for="(g, gi) in groups" :key="g.name">
      <div v-if="navState.rail && gi > 0" class="group-divider" />

      <div v-if="navState.rail" class="rail-slot">
        <button
          class="nav-item rail-group"
          :class="{ on: g.pages.includes(activeKey) }"
          :title="`${g.name} · ${g.pages.length} 项`"
          :aria-expanded="railOpen === g.name"
          @click.stop="toggleRailGroup(g)"
        >
          <Icon :name="g.pages[0]" :size="15" />
          <span class="rg-count">{{ g.pages.length }}</span>
        </button>
        <div v-if="railOpen === g.name" class="rail-flyout" @click.stop>
          <div class="rf-h">
            <span>{{ g.name }}</span>
            <span class="rf-c">{{ g.pages.length }} 项</span>
          </div>
          <RouterLink
            v-for="p in g.pages"
            :key="p"
            :to="path(p)"
            class="rf-item"
            exact-active-class="on"
            @click="railOpen = null"
          >
            <Icon :name="p" :size="14" />
            <span>{{ PAGE_MAP[p].title }}</span>
          </RouterLink>
        </div>
      </div>

      <template v-else>
        <button
          class="nav-group"
          :class="{ closed: navState.closed[g.name], 'has-on': g.pages.includes(activeKey) && navState.closed[g.name] }"
          :aria-expanded="!navState.closed[g.name]"
          @click="toggleGroup(g.name)"
        >
          <span class="ng-name">{{ g.name }}</span>
          <span class="ng-count">{{ g.pages.length }}</span>
          <svg class="ng-chev" :class="{ closed: navState.closed[g.name] }" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path d="M7 10 L12 15 L17 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <template v-if="!navState.closed[g.name]">
          <RouterLink
            v-for="p in g.pages"
            :key="p"
            :to="path(p)"
            class="nav-item"
            :title="PAGE_MAP[p].title"
            exact-active-class="on"
          >
            <Icon :name="p" :size="15" />
            <span>{{ PAGE_MAP[p].title }}</span>
          </RouterLink>
        </template>
      </template>
    </template>

    <div v-if="!navState.rail" class="side-foot">数据存在本机，靠接口读写<br />记得定期导出备份</div>
  </aside>
</template>
