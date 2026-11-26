/**
 * 文件：src/api/http.ts
 * 说明：真实接口实现层。统一封装 fetch、JSON 解析、{ ok, data, error } 响应解包与错误抛出，只依赖 contract 中定义的接口形状。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, SnapshotMeta } from '@/types'
import type { DeskApi, PingResult, SaveResult } from '@/api/contract'
import { normalizeState } from '@/data/state'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { message?: string }
}

/**
 * 统一请求入口。
 * 服务端始终返回 { ok, data?, error? }，HTTP 状态码只表达传输层结果；
 * 这里把两层错误都转成异常，页面只需 try/catch，不必到处判断 body.ok。
 * 状态类响应在调用处再做 normalizeState，以便兼容旧版本数据。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  if (!res.ok) throw new Error(`接口 ${path} 返回 ${res.status}`)
  const body = (await res.json()) as Envelope<T>
  if (!body.ok) throw new Error(body.error?.message || `接口 ${path} 失败`)
  return body.data as T
}

export const httpApi: DeskApi = {
  ping(): Promise<PingResult> {
    return request<PingResult>('/ping')
  },

  async getState(): Promise<AppState> {
    const data = await request<AppState>('/state')
    return normalizeState(data)
  },

  putState(state: AppState): Promise<SaveResult> {
    return request<SaveResult>('/state', { method: 'PUT', body: JSON.stringify(state) })
  },

  async resetState(options): Promise<AppState> {
    const data = await request<AppState>('/state/reset', {
      method: 'POST',
      body: JSON.stringify({ demo: !!options?.demo })
    })
    return normalizeState(data)
  },

  listSnapshots(): Promise<SnapshotMeta[]> {
    return request<SnapshotMeta[]>('/snapshots')
  },

  createSnapshot(label: string): Promise<SnapshotMeta | null> {
    return request<SnapshotMeta | null>('/snapshots', { method: 'POST', body: JSON.stringify({ label }) })
  },

  async restoreSnapshot(key: string): Promise<AppState> {
    const data = await request<AppState>('/snapshots/restore', { method: 'POST', body: JSON.stringify({ key }) })
    return normalizeState(data)
  },

  async clearAll(): Promise<AppState> {
    const data = await request<AppState>('/state', { method: 'DELETE' })
    return normalizeState(data)
  }
}
