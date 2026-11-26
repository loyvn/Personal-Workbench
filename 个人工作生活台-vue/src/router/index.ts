/**
 * 文件：src/router/index.ts
 * 说明：Hash 路由表与访问守卫。注册 17 个页面路由，按 meta.key 匹配模块开关，隐藏模块访问时回落首页。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import TasksView from '@/views/TasksView.vue'
import FocusView from '@/views/FocusView.vue'
import MusicView from '@/views/MusicView.vue'
import HabitsView from '@/views/HabitsView.vue'
import FitnessView from '@/views/FitnessView.vue'
import MediaView from '@/views/MediaView.vue'
import NovelView from '@/views/NovelView.vue'
import OutputView from '@/views/OutputView.vue'
import LearningView from '@/views/LearningView.vue'
import ReadingView from '@/views/ReadingView.vue'
import IdeasView from '@/views/IdeasView.vue'
import FavoritesView from '@/views/FavoritesView.vue'
import LeisureView from '@/views/LeisureView.vue'
import SettingsView from '@/views/SettingsView.vue'
import DataView from '@/views/DataView.vue'
import { useDeskStore } from '@/stores/desk'
import type { PageKey } from '@/constants/nav'

/**
 * 页面路由表。
 * 统一使用 hash 路由，保证 Express/静态目录/直接双击 index.html 都能工作；
 * meta.key 对齐 constants/nav 的 PageKey，供导航与模块开关守卫复用。
 * /learning 与 /dev 共用 LearningView，通过 meta.domain 决定视频线或开发线。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { key: 'home' } },
    { path: '/tasks', name: 'tasks', component: TasksView, meta: { key: 'tasks' } },
    { path: '/focus', name: 'focus', component: FocusView, meta: { key: 'focus' } },
    { path: '/music', name: 'music', component: MusicView, meta: { key: 'music' } },
    { path: '/habits', name: 'habits', component: HabitsView, meta: { key: 'habits' } },
    { path: '/fitness', name: 'fitness', component: FitnessView, meta: { key: 'fitness' } },
    { path: '/media', name: 'media', component: MediaView, meta: { key: 'media' } },
    { path: '/novel', name: 'novel', component: NovelView, meta: { key: 'novel' } },
    { path: '/output', name: 'output', component: OutputView, meta: { key: 'output' } },
    { path: '/learning', name: 'learning', component: LearningView, meta: { key: 'learning', domain: 'video' } },
    { path: '/dev', name: 'dev', component: LearningView, meta: { key: 'dev', domain: 'dev' } },
    { path: '/reading', name: 'reading', component: ReadingView, meta: { key: 'reading' } },
    { path: '/ideas', name: 'ideas', component: IdeasView, meta: { key: 'ideas' } },
    { path: '/favorites', name: 'favorites', component: FavoritesView, meta: { key: 'favorites' } },
    { path: '/leisure', name: 'leisure', component: LeisureView, meta: { key: 'leisure' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { key: 'settings' } },
    { path: '/data', name: 'data', component: DataView, meta: { key: 'data' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

/**
 * 模块开关守卫。
 * 只拦截非首页：被关闭的模块不能通过地址栏直接进入，但数据仍保留，
 * 重新打开模块开关后即可恢复访问；未知地址由路由表最后一条兜底回首页。
 */
router.beforeEach((to) => {
  const store = useDeskStore()
  const key = to.meta.key as PageKey | undefined
  if (key && key !== 'home' && store.data.modules[key] === 0) {
    return { name: 'home' }
  }
  return true
})

export default router
