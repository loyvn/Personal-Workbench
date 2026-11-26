/**
 * 文件：src/utils/misc.ts
 * 说明：通用小工具。提供 id 生成、ISO 时间、深拷贝、数字夹取、字节格式化和空值判断。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const nowISO = (): string => new Date().toISOString()

export const clamp = (n: number, a: number, b: number): number => Math.max(a, Math.min(b, n))

export function sum<T>(arr: T[], f: (item: T) => number = (x) => Number(x)): number {
  return arr.reduce((acc, item) => acc + (Number(f(item)) || 0), 0)
}

export const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr))

import type { TaskDomain } from '@/types'

export const TASK_DOMAIN_OPTIONS: Array<{ value: TaskDomain; label: string }> = [
  { value: 'dev', label: '开发' },
  { value: 'video', label: '视频' },
  { value: 'novel', label: '小说' },
  { value: 'media', label: '自媒体' }
]

export const domainLabel = (d: string): string => ({ dev: '开发', video: '视频', novel: '小说', media: '自媒体' } as Record<string, string>)[d] || '开发'

const STATUS_LABEL: Record<string, string> = {
  idea: '选题',
  script: '脚本',
  produce: '制作',
  published: '已发',
  todo: '待学',
  doing: '学习中',
  mastered: '已掌握',
  backlog: '待办',
  verify: '待验证',
  done: '完成',
  active: '进行中',
  paused: '暂停',
  finished: '完结',
  want: '想看',
  watching: '在看',
  dropped: '弃',
  open: '未回收',
  recovered: '已回收',
  outline: '仅大纲'
}

export const statusLabel = (s: string): string => STATUS_LABEL[s] || s

const STATUS_TONE: Record<string, string> = {
  published: 'ok',
  done: 'ok',
  mastered: 'ok',
  recovered: 'ok',
  doing: 'blue',
  watching: 'blue',
  produce: 'amber',
  verify: 'amber',
  outline: 'amber',
  blocked: 'red',
  open: 'red',
  dropped: 'red',
  paused: 'red'
}

export const statusTone = (s: string): string => STATUS_TONE[s] || ''

export const ticketTypeLabel: Record<string, string> = { feature: '功能', bug: '缺陷', chore: '杂项' }

export const leisureTypeLabel: Record<string, string> = { movie: '电影', series: '剧', anime: '番', book: '书', game: '游戏' }
