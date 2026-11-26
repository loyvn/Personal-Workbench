/**
 * 文件：src/utils/navPrefs.ts
 * 说明：导航偏好持久化。使用 localStorage 保存侧栏折叠状态和各分组展开/收起状态。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { reactive, watch } from 'vue'

const LS_KEY = 'desk.sidenav.v1'

interface NavPrefs {
  rail: boolean
  closed: Record<string, boolean>
}

/**
 * 读取导航偏好。
 * 旧值/手工改坏的 JSON 不应影响启动：字段类型不对时回落到默认展开侧栏，
 * closed 只保留对象形态，避免把数组/字符串当成分组状态。
 */
function readPrefs(): NavPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { rail: false, closed: {} }
    const parsed = JSON.parse(raw) as Partial<NavPrefs>
    return {
      rail: Boolean(parsed.rail),
      closed: parsed.closed && typeof parsed.closed === 'object' ? parsed.closed : {}
    }
  } catch {
    return { rail: false, closed: {} }
  }
}

const prefs = readPrefs()

/** 侧栏偏好跨组件共享：rail（收成图标栏）、closed（各分组是否折叠） */
export const navState = reactive<NavPrefs>({ rail: prefs.rail, closed: { ...prefs.closed } })

/** 任意折叠状态变化都同步 localStorage；写入失败只影响下次启动，不阻断当前操作 */
watch(
  navState,
  () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ rail: navState.rail, closed: { ...navState.closed } }))
    } catch {
      /* 存不了就只在本次会话生效 */
    }
  },
  { deep: true }
)

export function toggleRail(): void {
  navState.rail = !navState.rail
}

export function toggleGroup(name: string): void {
  navState.closed[name] = !navState.closed[name]
}
