/**
 * 文件：src/api/contract.ts
 * 说明：前后端共享的 DeskApi 数据契约。定义状态读写、重置、清空、快照和音乐代理等方法，mock 与 express 两套实现必须保持一致。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, SnapshotMeta } from '@/types'

export interface SaveResult {
  savedAt: string
  bytes: number
}

export interface PingResult {
  mode: 'mock' | 'server'
  label: string
  ok: boolean
}

/**
 * 前后端唯一契约：先由 mock 实现，接口调试完成后由 express 实现，
 * 前端只依赖这层接口，不改业务代码。
 */
export interface DeskApi {
  ping(): Promise<PingResult>
  getState(): Promise<AppState>
  putState(state: AppState): Promise<SaveResult>
  resetState(options?: { demo?: boolean }): Promise<AppState>
  listSnapshots(): Promise<SnapshotMeta[]>
  createSnapshot(label: string): Promise<SnapshotMeta | null>
  restoreSnapshot(key: string): Promise<AppState>
  clearAll(): Promise<AppState>
}
