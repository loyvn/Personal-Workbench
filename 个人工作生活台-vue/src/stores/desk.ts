/**
 * 文件：src/stores/desk.ts
 * 说明：全局业务数据 store。唯一写入口为 commit(mutator)，负责加载归一化、350ms 防抖保存、失败重试、快照与主题切换。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, useMock } from '@/api'
import type { AppState, SnapshotMeta, ThemeMode } from '@/types'
import { blankState, normalizeState } from '@/data/state'
import { nowISO } from '@/utils/misc'

export const useDeskStore = defineStore('desk', () => {
  const data = ref<AppState>(blankState('未连接'))
  const ready = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saving = ref(false)
  const lastSavedAt = ref<string | null>(null)
  const modeLabel = ref(useMock ? 'mock 接口' : '真实接口')
  const snapshots = ref<SnapshotMeta[]>([])

  const deviceName = computed(() => data.value.deviceName)
  let saveTimer: number | undefined
  let pending = false

  /**
   * 首次加载：先 ping 确认后端模式，再取状态并归一化。
   * 归一化是数据安全边界：旧库、手工改过的 JSON、导入文件都会在这里补字段/裁掉非法值，
   * 因此 store 内拿到的 AppState 可以被页面按当前类型直接使用。
   */
  async function bootstrap(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const ping = await api.ping()
      modeLabel.value = ping.label
      data.value = normalizeState(await api.getState())
      ready.value = true
      lastSavedAt.value = null
      await refreshSnapshots()
    } catch (e) {
      error.value = (e as Error).message || '数据加载失败'
      ready.value = true
    } finally {
      loading.value = false
    }
  }

  /**
   * 防抖落盘：页面连续输入时只保留最后一次写请求。
   * 350ms 足以合并同一次输入/勾选产生的一串 commit，又不至于让用户关页面前丢太多数据；
   * 真正的异常重试由 flush 将 pending 置回 true 完成。
   */
  function scheduleSave(): void {
    pending = true
    saving.value = true
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      void flush()
    }, 350)
  }

  /**
   * 真正写入接口。
   * 用 JSON 深拷贝切断 Proxy 引用，避免 fetch 序列化时读到后续变更；
   * bytes=0 代表 localStorage 满或浏览器拒写，需要提示用户先导出备份；
   * 失败时把 pending 恢复为 true，下一次 scheduleSave/flush 会再次尝试。
   */
  async function flush(): Promise<void> {
    if (!pending) return
    pending = false
    saving.value = true
    try {
      const res = await api.putState(JSON.parse(JSON.stringify(data.value)) as AppState)
      lastSavedAt.value = res.savedAt
      if (res.bytes === 0) error.value = '写入失败：存储空间不足或浏览器拒绝写入，请先导出备份'
      else if (error.value && error.value.startsWith('写入失败')) error.value = null
    } catch (e) {
      pending = true
      error.value = `保存失败：${(e as Error).message}`
    } finally {
      saving.value = false
    }
  }

  /** 唯一的写入口：改数据 + 自动落盘 */
  function commit(mutator: (state: AppState) => void): void {
    mutator(data.value)
    scheduleSave()
  }

  /** 数据替换后必须走 normalizeState，避免调用方传入缺字段的 AppState 造成页面白屏 */
  function replaceState(next: AppState): void {
    data.value = normalizeState(next)
    scheduleSave()
  }

  async function resetState(demo = false): Promise<void> {
    data.value = normalizeState(await api.resetState({ demo }))
    ready.value = true
    pending = false
    lastSavedAt.value = nowISO()
  }

  async function clearAll(): Promise<void> {
    data.value = normalizeState(await api.clearAll())
    pending = false
  }

  async function refreshSnapshots(): Promise<void> {
    try {
      snapshots.value = await api.listSnapshots()
    } catch {
      snapshots.value = []
    }
  }

  async function createSnapshot(label: string): Promise<SnapshotMeta | null> {
    const meta = await api.createSnapshot(label)
    await refreshSnapshots()
    return meta
  }

  async function restoreSnapshot(key: string): Promise<void> {
    data.value = normalizeState(await api.restoreSnapshot(key))
    pending = false
  }

  function setTheme(theme: ThemeMode): void {
    commit((s) => {
      s.theme = theme
    })
  }

  /**
   * 主题切换：auto 时先按系统偏好解析出实际主题，再切到相反值。
   * 这样用户从「跟随系统」点月亮按钮，会得到一个明确的 light/dark，
   * 不会出现按钮点了但设置仍是 auto、下次系统变化又跳回去的错觉。
   */
  function toggleTheme(): void {
    const resolved = data.value.theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : data.value.theme
    setTheme(resolved === 'dark' ? 'light' : 'dark')
  }

  return {
    data, ready, loading, error, saving, lastSavedAt, modeLabel, snapshots,
    deviceName,
    bootstrap, commit, replaceState, resetState, clearAll, flush,
    refreshSnapshots, createSnapshot, restoreSnapshot,
    setTheme, toggleTheme
  }
})
