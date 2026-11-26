/**
 * 文件：src/services/focus.ts
 * 说明：专注计时状态机。维护番茄/不限时/自定义三种模式、阶段流转、时间戳校准、暂停/继续和专注记录落库。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { reactive } from 'vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { FocusMode, FocusPhase } from '@/types'
import { uid, nowISO } from '@/utils/misc'
import { todayStr } from '@/utils/date'
import { chime } from '@/services/noise'
import { startForFocus } from '@/services/music'

export const RING_CIRC = 2 * Math.PI * 104

export const focusState = reactive({
  phase: 'work' as FocusPhase,
  mode: 'pomodoro' as FocusMode,
  taskId: null as string | null,
  round: 0,
  running: false,
  paused: false,
  totalMs: 0,
  remainMs: 0,
  elapsedMs: 0,
  startedAt: null as string | null
})

/**
 * 计时基准。
 * 不用"每 tick 减 1 秒"的累减方式，而是记录绝对时间戳：
 * - 倒计时：endAt = 开始/继续时刻 + 剩余毫秒；
 * - 正计时：openStartAt = 开始时刻 - 已累计毫秒。
 * 浏览器在后台会节流甚至暂停 setInterval，累减会走慢；按 Date.now() 校准则切页/锁屏回来后仍然准确。
 */
let endAt = 0
let openStartAt = 0
let ticker: number | null = null

function settings() {
  return useDeskStore().data.focus.settings
}

export function minutesOf(phase: FocusPhase): number {
  const s = settings()
  if (phase !== 'work') return phase === 'short' ? s.short : s.long
  return focusState.mode === 'custom' ? s.customWork : s.work
}

/** 页面重新进入时，如果计时器空闲，按已保存的档位初始化显示 */
export function initFocusTimer(): void {
  if (focusState.running || focusState.paused) return
  resetPhase('work')
}

export function resetPhase(phase: FocusPhase = 'work'): void {
  focusState.mode = settings().mode
  focusState.phase = phase
  focusState.running = false
  focusState.paused = false
  focusState.startedAt = null
  focusState.elapsedMs = 0
  focusState.totalMs = focusState.mode === 'open' ? 0 : minutesOf(phase) * 60000
  focusState.remainMs = focusState.totalMs
  stopTick()
}

/** 切换档位：已保存到设置，并重置到该档位的起点 */
export function applyMode(mode: FocusMode): void {
  const store = useDeskStore()
  store.commit((s) => {
    s.focus.settings.mode = mode
  })
  resetPhase('work')
}

function stopTick(): void {
  if (ticker) {
    window.clearInterval(ticker)
    ticker = null
  }
}

/**
 * 250ms 刷新一次显示。
 * 只读时间戳算差值，tick 本身不做状态写入；真正的完成判定在 remainMs 归零时触发一次，
 * 因此即使 interval 延迟，也不会重复记录或提前结束。
 */
function tick(): void {
  if (!focusState.running) return
  if (focusState.mode === 'open') {
    focusState.elapsedMs = Math.max(0, Date.now() - openStartAt)
    focusState.remainMs = focusState.elapsedMs
    return
  }
  focusState.remainMs = Math.max(0, endAt - Date.now())
  if (focusState.remainMs <= 0) complete()
}

function startTick(): void {
  stopTick()
  ticker = window.setInterval(tick, 250)
}

/**
 * 开始或继续专注。
 * 传入 taskId 才更新绑定；undefined 表示沿用上次选择，null 表示明确不绑定任务。
 * 倒计时剩余为 0 时先重置当前阶段，避免用已结束的 remainMs 算出过去的 endAt。
 */
export function startFocus(taskId?: string | null): void {
  const store = useDeskStore()
  if (taskId !== undefined) focusState.taskId = taskId || null
  if (focusState.mode === 'open') {
    openStartAt = Date.now() - focusState.elapsedMs
  } else {
    if (focusState.remainMs <= 0 || focusState.totalMs <= 0) resetPhase(focusState.phase)
    endAt = Date.now() + focusState.remainMs
  }
  focusState.running = true
  focusState.paused = false
  if (!focusState.startedAt) focusState.startedAt = nowISO()
  startTick()
  if (store.data.music.settings.autoStartWithFocus) void startForFocus()
}

export function pauseFocus(): void {
  if (!focusState.running) return
  if (focusState.mode === 'open') {
    focusState.elapsedMs = Math.max(0, Date.now() - openStartAt)
  } else {
    focusState.remainMs = Math.max(0, endAt - Date.now())
  }
  focusState.running = false
  focusState.paused = true
  stopTick()
}

export function resumeFocus(): void {
  if (focusState.running) return
  if (focusState.mode === 'open') {
    openStartAt = Date.now() - focusState.elapsedMs
  } else {
    endAt = Date.now() + focusState.remainMs
  }
  focusState.running = true
  focusState.paused = false
  startTick()
}

/**
 * 写入一条专注记录。
 * 只有 work 阶段才记账，休息不计入；plannedMin 对不限时是 0，
 * actualMin 优先使用调用方传入的实际分钟（手动结束/中断），否则按开始时间估算。
 * task 找不到时 domain 回退到 dev，保证统计维度始终有值。
 */
function recordSession(completed: boolean, actualMinOverride?: number): void {
  if (focusState.phase !== 'work') return
  const store = useDeskStore()
  const plannedMin = focusState.mode === 'open' ? 0 : Math.round(focusState.totalMs / 60000)
  const actualMin =
    actualMinOverride ?? (completed ? plannedMin : Math.max(1, Math.round((Date.now() - new Date(focusState.startedAt || nowISO()).getTime()) / 60000)))
  const task = store.data.tasks.find((t) => t.id === focusState.taskId)
  store.commit((s) => {
    s.focus.sessions.unshift({
      id: uid(),
      taskId: focusState.taskId,
      domain: task?.domain || 'dev',
      plannedMin,
      actualMin,
      startedAt: focusState.startedAt || nowISO(),
      endedAt: nowISO(),
      completed,
      interrupted: !completed
    })
  })
}

/**
 * 自然到点后的阶段流转。
 * - 休息结束：不记账，按设置决定是否自动开始下一轮专注；
 * - 不限时/自定义：只完成一次独立专注，不进入番茄休息循环；
 * - 番茄：完成后 round+1，每 roundsBeforeLong 轮进长休，其余进短休。
 * 状态先落定再 resetPhase，防止 toast 或自动开始读到旧的 running 值。
 */
export function complete(): void {
  const store = useDeskStore()
  const ui = useUiStore()
  const wasWork = focusState.phase === 'work'
  if (!wasWork) {
    stopTick()
    focusState.running = false
    focusState.paused = false
    focusState.startedAt = null
    if (store.data.focus.settings.soundOn) chime('break')
    ui.toast('休息结束，继续')
    resetPhase('work')
    if (store.data.focus.settings.autoStartNextWork) window.setTimeout(() => startFocus(), 20)
    return
  }

  if (focusState.mode !== 'pomodoro') {
    const minutes = Math.max(1, Math.round(focusState.totalMs / 60000))
    stopTick()
    recordSession(true)
    if (store.data.focus.settings.soundOn) chime('work')
    focusState.running = false
    focusState.paused = false
    focusState.startedAt = null
    ui.toast(`完成 ${minutes} 分钟专注，已记录`)
    resetPhase('work')
    return
  }

  stopTick()
  recordSession(true)
  focusState.round += 1
  focusState.running = false
  focusState.paused = false
  focusState.startedAt = null
  const s = store.data.focus.settings
  if (s.soundOn) chime('work')
  const next: FocusPhase = focusState.round % s.roundsBeforeLong === 0 ? 'long' : 'short'
  ui.toast(next === 'long' ? '番茄完成，进入长休' : '番茄完成，休息一下')
  resetPhase(next)
  if (s.autoStartBreak) window.setTimeout(() => startFocus(), 20)
}

/**
 * 手动收尾（不限时 / 自定义）。
 * 先按当前时间校准已专注时长，再四舍五入到分钟；不足 1 分钟不落库，
 * 避免误点开始又立刻结束产生大量 0 分钟记录。
 */
export function finishSession(): number | null {
  if (focusState.phase !== 'work' || !(focusState.running || focusState.paused)) return null
  if (focusState.mode === 'open') {
    if (focusState.running) focusState.elapsedMs = Math.max(0, Date.now() - openStartAt)
  } else if (focusState.running) {
    focusState.remainMs = Math.max(0, endAt - Date.now())
  }
  const focusedMs = focusState.mode === 'open' ? focusState.elapsedMs : Math.max(0, focusState.totalMs - focusState.remainMs)
  const minutes = Math.round(focusedMs / 60000)
  stopTick()
  focusState.running = false
  focusState.paused = false
  if (minutes < 1) {
    focusState.startedAt = null
    resetPhase('work')
    useUiStore().toast('不足 1 分钟，这次没有记录')
    return null
  }
  recordSession(true, minutes)
  if (useDeskStore().data.focus.settings.soundOn) chime('work')
  focusState.startedAt = null
  useUiStore().toast(`已记录 ${minutes} 分钟专注`)
  resetPhase('work')
  return minutes
}

/**
 * 跳过当前阶段：专注中跳过要记一笔中断，休息中跳过不记账。
 * 番茄的跳过只切换 work ↔ short，不推进 round，也不触发长休。
 */
export function skipPhase(): void {
  useUiStore().toast('已跳过当前阶段')
  if (focusState.phase === 'work' && focusState.running) recordSession(false)
  const next: FocusPhase = focusState.phase === 'work' ? 'short' : 'work'
  resetPhase(next)
}

/**
 * 彻底停止（如页面卸载/关闭专注）。
 * 与 skipPhase 不同：工作中会先记录一次 interrupted 会话，再清空计时器与阶段状态，
 * 防止用户关页后仍留下一个永远 running 的悬浮条。
 */
export function stopAll(): void {
  if (focusState.phase === 'work' && (focusState.running || focusState.paused)) {
    const actual = focusState.mode === 'open' ? Math.max(1, Math.round(focusState.elapsedMs / 60000)) : undefined
    recordSession(false, actual)
  }
  stopTick()
  focusState.running = false
  focusState.paused = false
  focusState.startedAt = null
  resetPhase('work')
}

export function progressPercent(): number {
  if (focusState.mode === 'open' || !focusState.totalMs) return 0
  const ratio = Math.max(0, Math.min(1, focusState.remainMs / focusState.totalMs))
  return 1 - ratio
}

export function todayFocusStats(): { count: number; minutes: number } {
  const store = useDeskStore()
  const t = todayStr()
  const list = store.data.focus.sessions.filter((s) => s.completed && s.endedAt.slice(0, 10) === t)
  return { count: list.length, minutes: list.reduce((a, s) => a + s.actualMin, 0) }
}
