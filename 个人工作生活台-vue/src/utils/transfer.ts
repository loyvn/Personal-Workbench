/**
 * 文件：src/utils/transfer.ts
 * 说明：导入导出与合并工具。生成导出文件、校验外部 JSON，并按 id/更新时间、打卡并集、专注去重、设置以本机为准的规则合并。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, ImportReport, Task, Goal, Habit, Idea, Summary, Leisure, MediaItem } from '@/types'
import { APP_ID, STATE_VERSION, normalizeState } from '@/data/state'
import { nowISO } from '@/utils/misc'

export interface ExportFile {
  app: string
  version: number
  exportedAt: string
  data: AppState
}

/**
 * 生成导出文件外壳。
 * 保留 app/version 是为了导入时能识别文件来源与兼容旧版本，
 * 真正数据放在 data 字段，避免顶层 metadata 与业务字段混在一起。
 */
export function buildExport(state: AppState): ExportFile {
  return { app: APP_ID, version: STATE_VERSION, exportedAt: nowISO(), data: state }
}

export function exportFileName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `工作生活台-备份-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

/**
 * 导入校验。
 * 先做来源和版本两道闸，再交给 normalizeState 做字段级容错；
 * 不能直接把外部对象强转成 AppState，否则页面会读到不存在的关系和枚举值。
 */
export function validateImport(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') throw new Error('文件内容不是 JSON 对象')
  const o = raw as Partial<ExportFile> & { data?: unknown }
  if (o.app && o.app !== APP_ID) throw new Error('这不是本应用的备份文件')
  if (typeof o.version === 'number' && o.version > STATE_VERSION) throw new Error('备份版本比当前应用更新，请先升级应用')
  const candidate = 'data' in o ? o.data : raw
  if (!candidate || typeof candidate !== 'object') throw new Error('备份里没有可用的数据')
  const next = normalizeState(candidate)
  if (!Array.isArray(next.tasks) || !Array.isArray(next.ideas)) throw new Error('数据结构不完整')
  return next
}

type VersionedKey =
  | 'updatedAt'
  | 'capturedAt'
  | 'createdAt'
  | 'date'

interface MergeRule {
  get: (s: AppState) => Array<Record<string, unknown>>
  set: (s: AppState, list: Array<Record<string, unknown>>) => void
  version?: VersionedKey
}

/**
 * 可合并实体的声明表。
 * 用 get/set 适配不同层级的数组，避免为 30 多个集合写重复循环；
 * version 指定该实体的时间字段，缺失版本字段的实体在 id 冲突时保守跳过，不覆盖本机数据。
 */
const rules: MergeRule[] = [
  { get: (s) => s.tasks as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.tasks = v as unknown as Task[] }, version: 'updatedAt' },
  { get: (s) => s.goals as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.goals = v as unknown as Goal[] }, version: 'updatedAt' },
  { get: (s) => s.habits as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.habits = v as unknown as Habit[] }, version: 'updatedAt' },
  { get: (s) => s.fitness.split as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.fitness.split = v as never } },
  { get: (s) => s.fitness.exercises as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.fitness.exercises = v as never } },
  { get: (s) => s.fitness.sessions as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.fitness.sessions = v as never }, version: 'date' },
  { get: (s) => s.fitness.metrics as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.fitness.metrics = v as never }, version: 'date' },
  { get: (s) => s.media.items as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.media.items = v as unknown as MediaItem[] }, version: 'updatedAt' },
  { get: (s) => s.media.topics as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.media.topics = v as never } },
  { get: (s) => s.novel.works as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.novel.works = v as never }, version: 'updatedAt' },
  { get: (s) => s.novel.chapters as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.novel.chapters = v as never }, version: 'updatedAt' },
  { get: (s) => s.novel.settings as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.novel.settings = v as never } },
  { get: (s) => s.novel.foreshadows as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.novel.foreshadows = v as never }, version: 'updatedAt' },
  { get: (s) => s.output.projects as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.output.projects = v as never }, version: 'updatedAt' },
  { get: (s) => s.output.shots as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.output.shots = v as never }, version: 'updatedAt' },
  { get: (s) => s.output.prompts as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.output.prompts = v as never } },
  { get: (s) => s.output.iterations as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.output.iterations = v as never } },
  { get: (s) => s.output.tickets as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.output.tickets = v as never }, version: 'updatedAt' },
  { get: (s) => s.learning.tracks as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.learning.tracks = v as never } },
  { get: (s) => s.learning.stages as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.learning.stages = v as never }, version: 'createdAt' },
  { get: (s) => s.learning.topics as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.learning.topics = v as never }, version: 'updatedAt' },
  { get: (s) => s.learning.logs as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.learning.logs = v as never }, version: 'createdAt' },
  { get: (s) => s.learning.resources as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.learning.resources = v as never } },
  { get: (s) => s.ideas as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.ideas = v as unknown as Idea[] }, version: 'capturedAt' },
  { get: (s) => s.summaries as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.summaries = v as unknown as Summary[] }, version: 'createdAt' },
  { get: (s) => s.favorites.folders as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.favorites.folders = v as unknown as AppState['favorites']['folders'] }, version: 'updatedAt' },
  { get: (s) => s.favorites.items as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.favorites.items = v as unknown as AppState['favorites']['items'] }, version: 'updatedAt' },
  { get: (s) => s.reading.books as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.reading.books = v as unknown as AppState['reading']['books'] }, version: 'updatedAt' },
  { get: (s) => s.reading.logs as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.reading.logs = v as unknown as AppState['reading']['logs'] }, version: 'createdAt' },
  { get: (s) => s.leisure as unknown as Array<Record<string, unknown>>, set: (s, v) => { s.leisure = v as unknown as Leisure[] }, version: 'updatedAt' }
]

/**
 * 合并两份库。
 * 1. 以本机为基底做深拷贝，保证失败不会污染当前状态；
 * 2. 普通实体按 id 建索引，远端版本字段更新时间更晚才替换，否则计入 skipped；
 * 3. 打卡按日期并集、专注记录按 id 去重、小说字数取每日较大值（跨设备不会把进度改小）；
 * 4. 设备/主题/外观/模块开关等设置始终以本机为准，避免换机导入后界面被远端改变。
 */
export function mergeStates(local: AppState, remote: AppState): { state: AppState; report: ImportReport } {
  const next: AppState = JSON.parse(JSON.stringify(local)) as AppState
  const report: ImportReport = { added: 0, updated: 0, skipped: 0 }

  rules.forEach((rule) => {
    const target = rule.get(next)
    const incoming = rule.get(remote)
    const index = new Map<string, Record<string, unknown>>()
    target.forEach((x) => index.set(String(x.id), x))
    const out = target.slice()
    incoming.forEach((item) => {
      const id = String(item.id || '')
      if (!id) {
        report.skipped += 1
        return
      }
      const exists = index.get(id)
      if (!exists) {
        out.push(item)
        index.set(id, item)
        report.added += 1
        return
      }
      if (!rule.version) {
        report.skipped += 1
        return
      }
      const a = String(exists[rule.version] || '')
      const b = String(item[rule.version] || '')
      if (b && b > a) {
        const pos = out.findIndex((x) => String(x.id) === id)
        if (pos >= 0) out[pos] = item
        report.updated += 1
      } else {
        report.skipped += 1
      }
    })
    rule.set(next, out)
  })

  Object.entries(remote.checkins || {}).forEach(([hid, dates]) => {
    const cur = next.checkins[hid] || []
    const merged = Array.from(new Set([...cur, ...dates])).sort()
    if (merged.length !== cur.length) report.updated += 1
    next.checkins[hid] = merged
  })

  const localFocusIds = new Set(next.focus.sessions.map((x) => x.id))
  remote.focus.sessions.forEach((x) => {
    if (!localFocusIds.has(x.id)) {
      next.focus.sessions.push(x)
      report.added += 1
    } else {
      report.skipped += 1
    }
  })
  next.focus.sessions.sort((a, b) => b.endedAt.localeCompare(a.endedAt))

  Object.entries(remote.novel.wordLog || {}).forEach(([d, n]) => {
    const cur = next.novel.wordLog[d] || 0
    if (n > cur) {
      next.novel.wordLog[d] = n
      report.updated += 1
    }
  })

  remote.media.platforms.forEach((p) => {
    if (!next.media.platforms.some((x) => x.id === p.id)) next.media.platforms.push(p)
  })

  // 设置以本机为准，不让远端覆盖
  next.deviceName = local.deviceName
  next.theme = local.theme
  next.general = local.general
  next.appearance = local.appearance
  next.dataPrefs = local.dataPrefs
  next.modules = local.modules
  next.meta = local.meta
  next.app = APP_ID
  next.version = STATE_VERSION
  return { state: next, report }
}
