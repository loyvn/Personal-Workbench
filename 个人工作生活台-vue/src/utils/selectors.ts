/**
 * 文件：src/utils/selectors.ts
 * 说明：跨页面业务选择器。集中计算未完成任务、任务番茄投入、首页摘要、习惯连续天数、健身容量等派生数据。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, FitnessSession } from '@/types'
import { shiftYMD, todayStr, weekdayMon0 } from '@/utils/date'
import { sum } from '@/utils/misc'

/** 某习惯在某天是否已打卡；日期用 YMD 字符串直接查集合 */
export const isChecked = (s: AppState, habitId: string, date: string): boolean =>
  (s.checkins[habitId] || []).includes(date)

/**
 * 某天因执行日排期而应做的习惯。
 * weekdays 为空表示每天；星期使用 0=周一，和页面的“执行日”选择保持一致。
 */
export function habitsDueOn(s: AppState, date: string) {
  const wd = weekdayMon0(date)
  return s.habits.filter((h) => h.active !== 0 && (!h.weekdays.length || h.weekdays.includes(wd)))
}

export function todayHabits(s: AppState) {
  return habitsDueOn(s, todayStr())
}

/**
 * 连续打卡天数。
 * 从今天往前逐日回溯；如果今天还没打卡，则从昨天开始算，
 * 这样早上打开页面不会因为“今天尚未完成”把连续记录清零。
 */
export function streakOf(s: AppState, habitId: string): number {
  const arr = s.checkins[habitId] || []
  let cursor = todayStr()
  if (!arr.includes(cursor)) cursor = shiftYMD(cursor, -1)
  let n = 0
  while (arr.includes(cursor) && n < 2000) {
    n += 1
    cursor = shiftYMD(cursor, -1)
  }
  return n
}

export const maxStreak = (s: AppState): number =>
  s.habits.reduce((best, h) => Math.max(best, streakOf(s, h.id)), 0)

/** 今日应做的分化计划；同一天绑定多个分化时取第一个 */
export function todaySplit(s: AppState) {
  const wd = weekdayMon0(todayStr())
  return s.fitness.split.find((p) => p.weekday.includes(wd)) || null
}

/** 训练容量：Σ(重量×次数)，自重/计时动作按 0 计，不把组数混进容量 */
export function sessionVolume(session: FitnessSession): number {
  return sum(session.entries, (e) => sum(e.sets, (st) => st.weight * st.reps))
}

export interface FocusItem {
  kind: 'task' | 'media' | 'fitness' | 'habit'
  id: string
  title: string
  page: 'tasks' | 'media' | 'fitness' | 'habits'
  tag: string
}

/**
 * 首页「今日焦点」候选。
 * 顺序：逾期任务 → 今日到期任务（最多 2）→ 今日媒体排期 → 今日训练 → 未打卡习惯；
 * 最终只取 3 条，保证首页是“今天最该处理的”，而不是把所有模块堆上来。
 */
export function focusItems(s: AppState): FocusItem[] {
  const t = todayStr()
  const items: FocusItem[] = []
  const overdue = s.tasks.find((x) => !x.done && x.dueDate && x.dueDate < t)
  if (overdue) {
    const days = Math.round((new Date(t).getTime() - new Date(overdue.dueDate).getTime()) / 86400000)
    items.push({ kind: 'task', id: overdue.id, title: overdue.title, page: 'tasks', tag: `逾期 ${days} 天` })
  }
  s.tasks
    .filter((x) => !x.done && x.dueDate === t)
    .slice(0, 2)
    .forEach((x) => items.push({ kind: 'task', id: x.id, title: x.title, page: 'tasks', tag: '今日到期' }))
  const mediaToday = s.media.items.find((i) => i.planDate === t && i.status !== 'published')
  if (mediaToday) items.push({ kind: 'media', id: mediaToday.id, title: mediaToday.title, page: 'media', tag: '今日排期' })
  const split = todaySplit(s)
  if (split && !s.fitness.sessions.some((x) => x.date === t)) {
    items.push({ kind: 'fitness', id: split.id, title: `${split.name} 训练日`, page: 'fitness', tag: '训练' })
  }
  const habit = todayHabits(s).find((h) => !isChecked(s, h.id, t))
  if (habit) items.push({ kind: 'habit', id: habit.id, title: habit.name, page: 'habits', tag: '打卡' })
  return items.slice(0, 3)
}

/** 指定日期区间内完成的任务数，用 doneAt 的日期部分比较，避免时区偏移 */
export function weekTaskStats(s: AppState, start: string, end: string) {
  const doneCount = s.tasks.filter((t) => t.doneAt && t.doneAt.slice(0, 10) >= start && t.doneAt.slice(0, 10) <= end).length
  return doneCount
}
