/**
 * 文件：src/api/mock.ts
 * 说明：浏览器 localStorage 数据实现。用于 VITE_USE_MOCK=true 的开发/静态部署模式，模拟状态、重置、清空与快照行为。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, SnapshotMeta } from '@/types'
import type { DeskApi, PingResult, SaveResult } from '@/api/contract'
import { blankState, demoState, normalizeState } from '@/data/state'
import { nowISO } from '@/utils/misc'

const K_STATE = 'desk.v2.state'
const K_SNAP = 'desk.v2.snap.'
const SNAP_MAX = 5
const memoryStore = new Map<string, string>()
let memoryMode = false

function safeGet(key: string): string | null {
  if (memoryMode) return memoryStore.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    memoryMode = true
    return memoryStore.get(key) ?? null
  }
}

/**
 * 写 localStorage 并在失败时降级到内存。
 * 浏览器可能因隐私模式、配额耗尽或策略禁止写入而抛异常；
 * 此时返回 false，同时把整个 mock 切到 memoryMode，后续读写都走 Map，
 * 让应用仍能运行，但页面会通过 bytes=0 提示用户导出备份。
 */
function safeSet(key: string, value: string): boolean {
  if (memoryMode) {
    memoryStore.set(key, value)
    return true
  }
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    memoryMode = true
    memoryStore.set(key, value)
    return false
  }
}

function safeRemove(key: string): void {
  memoryStore.delete(key)
  if (memoryMode) return
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function snapKeys(): string[] {
  if (memoryMode) {
    return Array.from(memoryStore.keys()).filter((k) => k.startsWith(K_SNAP)).sort((a, b) => Number(b.slice(K_SNAP.length)) - Number(a.slice(K_SNAP.length)))
  }
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(K_SNAP)) keys.push(k)
    }
  } catch {
    /* ignore */
  }
  return keys.sort((a, b) => Number(b.slice(K_SNAP.length)) - Number(a.slice(K_SNAP.length)))
}

function bootState(): AppState {
  const raw = safeGet(K_STATE)
  if (!raw) {
    const fresh = blankState()
    safeSet(K_STATE, JSON.stringify(fresh))
    return fresh
  }
  try {
    return normalizeState(JSON.parse(raw))
  } catch {
    return blankState()
  }
}

function persist(state: AppState): SaveResult {
  const json = JSON.stringify(state)
  const ok = safeSet(K_STATE, json)
  return { savedAt: nowISO(), bytes: ok ? json.length : 0 }
}

const delay = (ms = 120): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const mockApi: DeskApi = {
  async ping(): Promise<PingResult> {
    await delay(40)
    return { mode: 'mock', label: memoryMode ? 'mock · 内存模式' : 'mock · 浏览器本地存储', ok: true }
  },

  async getState(): Promise<AppState> {
    await delay()
    return bootState()
  },

  async putState(state: AppState): Promise<SaveResult> {
    await delay(60)
    return persist(state)
  },

  async resetState(options): Promise<AppState> {
    await delay()
    const next = options?.demo ? demoState() : blankState()
    persist(next)
    return next
  },

  async listSnapshots(): Promise<SnapshotMeta[]> {
    await delay(60)
    return snapKeys().map((key) => {
      const raw = safeGet(key) || ''
      try {
        const o = JSON.parse(raw) as { label?: string; at?: string }
        return { key, label: o.label || '快照', at: o.at || '', size: raw.length }
      } catch {
        return { key, label: '损坏的快照', at: '', size: raw.length }
      }
    })
  },

  async createSnapshot(label: string): Promise<SnapshotMeta | null> {
    await delay(80)
    const state = bootState()
    const key = `${K_SNAP}${Date.now()}`
    const at = nowISO()
    const raw = JSON.stringify({ label, at, data: state })
    if (!safeSet(key, raw)) return null
    snapKeys().slice(SNAP_MAX).forEach((k) => safeRemove(k))
    return { key, label, at, size: raw.length }
  },

  async restoreSnapshot(key: string): Promise<AppState> {
    await delay(100)
    const raw = safeGet(key)
    if (!raw) throw new Error('快照不存在')
    const o = JSON.parse(raw) as { data?: unknown }
    if (!o.data) throw new Error('快照内容不可用')
    const next = normalizeState(o.data)
    persist(next)
    return next
  },

  async clearAll(): Promise<AppState> {
    await delay(80)
    const next = blankState()
    persist(next)
    return next
  }
}
