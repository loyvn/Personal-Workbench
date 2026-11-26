/**
 * 文件：src/utils/date.ts
 * 说明：日期工具。统一本地 YMD、时区安全的日期移位、周范围、月份网格、星期与相对日期展示。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

export const WEEK = ['日', '一', '二', '三', '四', '五', '六']

export const pad2 = (n: number | string): string => String(n).padStart(2, '0')

export const ymd = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export const todayStr = (): string => ymd()

/**
 * 日期移位。
 * 显式构造本地零点，再 setDate 跨月/跨年，避免用毫秒加减在夏令时或月末产生 23/25 小时偏差；
 * 输入输出均为 YYYY-MM-DD，可直接与 state 中的日期字段比较。
 */
export function shiftYMD(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return ymd(d)
}

export const weekdayOf = (dateStr: string): number =>
  new Date(`${dateStr}T00:00:00`).getDay()

/** 周一为 0，周日为 6 */
export const weekdayMon0 = (dateStr: string): number => (weekdayOf(dateStr) + 6) % 7

/** 本周一到周日；周日按上一周的周一处理，避免周边界错位 */
export function weekRange(): { start: string; end: string } {
  const now = new Date()
  const diff = now.getDay() === 0 ? 6 : now.getDay() - 1
  const start = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff))
  return { start, end: shiftYMD(start, 6) }
}

export function last7Days(): string[] {
  const t = todayStr()
  return Array.from({ length: 7 }, (_, i) => shiftYMD(t, i - 6))
}

/** 相对日期：今天/明天/昨天，其余显示为月.日，用于任务与排期列表 */
export function relDay(s: string): string {
  if (!s) return '未排期'
  const t = todayStr()
  if (s === t) return '今天'
  if (s === shiftYMD(t, 1)) return '明天'
  if (s === shiftYMD(t, -1)) return '昨天'
  return s.slice(5).replace('-', '.')
}

export const mmdd = (s: string): string => (s ? s.slice(5).replace('-', '.') : '')

export function fmtMin(m: number): string {
  if (!m) return '0 分'
  return m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分`
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`
}

export function fmtTime(iso: string | null | undefined, withDate = true): string {
  if (!iso) return '—'
  const s = iso.replace('T', ' ').replace('Z', '')
  return withDate ? s.slice(5, 16) : s.slice(11, 16)
}

export function daysBetween(fromISO: string | null): number | null {
  if (!fromISO) return null
  return Math.floor((Date.now() - new Date(fromISO).getTime()) / 86400000)
}

export interface MonthCell {
  day: number
  date: string
  inMonth: boolean
  isToday: boolean
  future: boolean
}

/** 生成当月热力格（周一为第一列，补齐前后空位） */
export function monthCells(): MonthCell[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const total = new Date(year, month + 1, 0).getDate()
  const lead = weekdayMon0(`${year}-${pad2(month + 1)}-01`)
  const t = todayStr()
  const cells: MonthCell[] = []
  for (let i = 0; i < lead; i++) cells.push({ day: 0, date: '', inMonth: false, isToday: false, future: false })
  for (let day = 1; day <= total; day++) {
    const date = `${year}-${pad2(month + 1)}-${pad2(day)}`
    cells.push({ day, date, inMonth: true, isToday: date === t, future: date > t })
  }
  return cells
}
