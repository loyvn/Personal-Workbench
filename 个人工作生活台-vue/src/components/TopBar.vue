<!--
  文件：src/components/TopBar.vue
  说明：顶部栏。显示面包屑、全局搜索、导出快捷入口、主题切换和专注/音乐状态入口。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV_GROUPS, PAGE_MAP } from '@/constants/nav'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { daysBetween } from '@/utils/date'
import { searchAll } from '@/composables/useSearch'
import type { SearchHit } from '@/composables/useSearch'
import Icon from '@/components/Icon.vue'
import type { PageKey } from '@/constants/nav'

const store = useDeskStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const query = ref('')
const open = ref(false)

const pageKey = computed(() => (route.meta.key as PageKey) || 'home')
const groupName = computed(() => NAV_GROUPS.find((g) => g.pages.includes(pageKey.value))?.name || '日常')

const results = computed(() => searchAll(query.value))
/**
 * 搜索结果按页面分组。
 * 全局搜索本身返回扁平命中列表，这里按 PAGE_MAP 的标题聚合；
 * 每组最多 4 条，避免某个模块命中太多把下拉撑爆，用户可点任意一条跳到该页。
 */
const grouped = computed(() => {
  const map = new Map<PageKey, SearchHit[]>()
  results.value.forEach((h) => {
    const list = map.get(h.page) || []
    list.push(h)
    map.set(h.page, list)
  })
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    title: PAGE_MAP[key].title,
    items: items.slice(0, 4)
  }))
})

const backupDays = computed(() => {
  const d = daysBetween(store.data.meta.lastExportAt)
  return d === null ? null : d
})

const remindDays = computed(() => store.data.general.backupRemindDays)

/**
 * 备份提醒。
 * 从未导出时 backupDays 为 null，按钮仍显示但提示“还没有导出过”；
 * 设置为 0 表示关闭提醒，只有距上次导出严格超过阈值才亮红点。
 */
const needRemind = computed(() => {
  if (remindDays.value === 0) return false
  return backupDays.value !== null && backupDays.value > remindDays.value
})

const effectiveTheme = computed<'light' | 'dark'>(() => {
  if (store.data.theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return store.data.theme
})

function pick(page: PageKey): void {
  open.value = false
  query.value = ''
  void router.push(page === 'home' ? '/' : `/${page}`)
}

function toggleTheme() {
  store.toggleTheme()
}

function goSettings() {
  void router.push('/data')
  ui.toast(store.data.meta.lastExportAt ? `上次导出：${store.data.meta.lastExportAt.slice(0, 10)}` : '还没有导出过，建议现在导出一份')
}

/**
 * 延迟关闭搜索下拉。
 * 点击结果用 mousedown.prevent 先于 input 的 blur 触发；
 * 这里再等 180ms，让键盘/鼠标点击都能完成跳转，不会出现“还没点就消失”。
 */
function onBlur() {
  window.setTimeout(() => (open.value = false), 180)
}
</script>

<template>
  <header class="topbar">
    <div class="crumb"><b>{{ groupName }}</b> / {{ PAGE_MAP[pageKey].title }}</div>
    <div class="search-wrap">
      <input
        v-model="query"
        type="text"
        placeholder="搜索全部内容"
        autocomplete="off"
        @focus="open = true"
        @input="open = true"
        @keydown.esc="query = ''; open = false"
        @blur="onBlur"
      />
      <div v-if="open && query.trim()" class="gres">
        <template v-if="grouped.length">
          <template v-for="g in grouped" :key="g.key">
            <div class="grp-t">{{ g.title }}</div>
            <button v-for="(h, i) in g.items" :key="i" @mousedown.prevent="pick(g.key)">
              <span style="color: var(--muted); font-size: 11px; margin-right: 6px">{{ h.extra }}</span>{{ h.title }}
            </button>
          </template>
        </template>
        <div v-else class="grp-t">没有匹配</div>
      </div>
    </div>
    <button
      class="icon-btn"
      :title="backupDays === null ? '还没有导出过备份' : `距上次导出 ${backupDays} 天${remindDays ? `（超过 ${remindDays} 天提醒）` : ''}`"
      @click="goSettings"
    >
      <span v-if="needRemind" class="badge" />
      <Icon name="backup" />
    </button>
    <button class="icon-btn" title="切换主题" @click="toggleTheme">
      <Icon :name="effectiveTheme === 'dark' ? 'sun' : 'moon'" />
    </button>
  </header>
</template>
