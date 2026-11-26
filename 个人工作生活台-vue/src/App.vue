<!--
  文件：src/App.vue
  说明：应用外壳与页面装配层。负责挂载侧栏、移动导航、顶栏、全局专注条、路由视图、全局音乐条与各类弹窗；同时同步主题、背景、纯色色系与减少动画等全局 DOM 状态。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import SideNav from '@/components/SideNav.vue'
import MobileNav from '@/components/MobileNav.vue'
import TopBar from '@/components/TopBar.vue'
import FocusBar from '@/components/FocusBar.vue'
import GlobalMusicBar from '@/components/GlobalMusicBar.vue'
import ToastHost from '@/components/ToastHost.vue'
import FormModal from '@/components/FormModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { NAV_GROUPS, PAGE_MAP } from '@/constants/nav'
import { useMedia } from '@/composables/useMedia'
import { navState } from '@/utils/navPrefs'
import { initMusic } from '@/services/music'
import { colorSaturation } from '@/utils/color'
import type { PageKey } from '@/constants/nav'

const store = useDeskStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const isMobile = useMedia('(max-width: 900px)')

const pageKey = computed(() => (route.meta.key as PageKey) || 'home')
const musicBarRoom = computed(
  () => Boolean(store.data.music.currentId) && store.data.music.settings.showGlobalBar !== false
)
const group = computed(() => NAV_GROUPS.find((g) => g.pages.includes(pageKey.value)))
/**
 * 顶栏的二级页面胶囊。
 * 桌面展开导航时由侧栏承担跳转，只有侧栏折叠成 rail 或移动端才需要这排胶囊；
 * 同时过滤掉被模块开关隐藏的页面，避免出现可点击但会被路由守卫弹回首页的入口。
 */
const chips = computed(() => {
  if (!group.value) return []
  if (!isMobile.value && !navState.rail) return []
  const pages = group.value.pages.filter((p) => p === 'home' || store.data.modules[p] !== 0)
  return pages.length > 1 ? pages : []
})

const bg = computed(() => store.data.appearance.background)
const hasImage = computed(() => bg.value.kind === 'image' && bg.value.image.length > 0)

/**
 * 纯色背景下卡片的同色系混色比例。
 * 高饱和背景如果直接大比例混入，会让整页糊成一片；因此按 HSL 饱和度反向取值，
 * 饱和度越高混色越低（28%），低饱和/近白背景则提高到 44%，保留卡片的层次。
 */
function toneMixFor(color: string): string {
  const saturation = colorSaturation(color)
  if (saturation === null) return '38%'
  const percent = Math.round(Math.max(28, Math.min(44, 51 - saturation * 34)))
  return `${percent}%`
}

/** 系统深浅色，仅在「跟随系统」时参与取值 */
const systemDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)
let themeMql: MediaQueryList | null = null

const resolvedTheme = computed<'light' | 'dark'>(() => {
  if (store.data.theme === 'auto') return systemDark.value ? 'dark' : 'light'
  return store.data.theme
})

/**
 * 把主题与背景设置投影到 <html> 的 data 属性和 CSS 变量。
 * 页面样式只读 data-theme / data-bg / --bg-selected / --tone-mix，不直接依赖 store，
 * 这样构建产物里的 CSS 与运行时状态解耦，切换设置时无需重渲染整棵组件树。
 * 纯色背景在浅/深主题下各记住一套颜色，切换主题时会把 color 同步到对应槽位。
 */
watchEffect(() => {
  const theme = resolvedTheme.value
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.bg = hasImage.value ? 'image' : bg.value.kind === 'image' ? 'paper' : bg.value.kind
  if (bg.value.kind === 'color') {
    const selected = bg.value.color || '#efede7'
    document.documentElement.style.setProperty('--bg-selected', selected)
    document.documentElement.style.setProperty('--tone-mix', toneMixFor(selected))
  } else {
    document.documentElement.style.removeProperty('--bg-selected')
    document.documentElement.style.removeProperty('--tone-mix')
  }
  if (bg.value.kind !== 'color') return
  const target = theme === 'dark' ? bg.value.darkColor : bg.value.lightColor
  if (target && bg.value.color.toLowerCase() !== target.toLowerCase()) {
    store.commit((st) => {
      st.appearance.background.color = target
    })
  }
})

const reduceMotion = computed(() => store.data.appearance.reduceMotion)
watchEffect(() => {
  if (reduceMotion.value) document.documentElement.dataset.motion = 'reduce'
  else document.documentElement.removeAttribute('data-motion')
})

const bgBaseStyle = computed(() => ({
  backgroundColor: bg.value.kind === 'color' ? bg.value.color : 'var(--paper)'
}))

/**
 * 背景图使用 CSS background-image 实现。
 * dataURL / 远程 URL 里可能带引号或空白，直接拼进 CSS 会截断声明，因此先做最小转义；
 * 高斯模糊会把边缘拉出透明缝，所以同时放大 1.06 倍覆盖视口。
 */
const bgImageStyle = computed(() => {
  if (!hasImage.value) return {}
  const src = bg.value.image.replace(/"/g, '%22').replace(/\s/g, '')
  return {
    backgroundImage: `url("${src}")`,
    filter: bg.value.blur > 0 ? `blur(${bg.value.blur}px)` : 'none',
    transform: bg.value.blur > 0 ? 'scale(1.06)' : 'none'
  }
})

const bgToneStyle = computed(() => (hasImage.value ? { opacity: bg.value.dim / 100 } : { display: 'none' }))

function onSchemeChange(e: MediaQueryListEvent): void {
  systemDark.value = e.matches
}

onMounted(() => {
  themeMql = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = themeMql.matches
  themeMql.addEventListener('change', onSchemeChange)
  if (store.ready) initMusic()
})

onBeforeUnmount(() => {
  themeMql?.removeEventListener('change', onSchemeChange)
})

function goExport() {
  void router.push('/data')
  ui.toast('在「数据」里可以立即导出备份')
}
</script>

<template>
  <div class="app">
    <div class="app-bg" aria-hidden="true" :style="bgBaseStyle">
      <div v-if="hasImage" class="app-bg-img" :style="bgImageStyle" />
      <div v-if="hasImage" class="app-bg-tone" :style="bgToneStyle" />
    </div>
    <SideNav />
    <div class="main">
      <div v-if="store.error" class="storage-alert">
        <span>{{ store.error }}</span>
        <button class="mini" @click="goExport">去导出</button>
        <button class="mini" @click="store.flush()">重试写入</button>
      </div>
      <TopBar />
      <FocusBar />
      <div class="view" :class="{ 'with-musicbar': musicBarRoom }">
        <div v-if="chips.length" class="pagechips">
          <RouterLink
            v-for="p in chips"
            :key="p"
            :to="p === 'home' ? '/' : `/${p}`"
            class="chip"
            :class="{ on: p === pageKey }"
            style="text-decoration: none"
          >
            {{ PAGE_MAP[p].title }}
          </RouterLink>
        </div>
        <RouterView v-if="store.ready" />
        <div v-else class="empty">
          <div class="et">正在读取本地数据</div>
          <div>第一次打开会初始化一份空白库</div>
        </div>
      </div>
      <MobileNav />
    </div>
    <GlobalMusicBar />
    <FormModal />
    <ConfirmModal />
    <ToastHost />
  </div>
</template>
