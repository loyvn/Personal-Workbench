/**
 * 文件：src/utils/bindings.ts
 * 说明：灵感与业务实体的绑定工具。维护绑定目标类型、转化目标与实体标题解析，支撑转任务/选题/知识点及详情页展示。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { AppState, BindModule, ContentBinding } from '@/types'

export interface BindingTarget extends ContentBinding {
  key: string
}

/** 绑定唯一键：module + id，用于去重与 Set 查找 */
export function bindingKey(b: Pick<ContentBinding, 'module' | 'id'>): string {
  return `${b.module}:${b.id}`
}

/**
 * 汇总所有可被灵感绑定的目标。
 * 只收录自媒体内容、小说作品、产出项目三类，任务/习惯不参与绑定，
 * 避免灵感面板变成第二个全局选择器。
 */
export function listBindingTargets(state: AppState): BindingTarget[] {
  const out: BindingTarget[] = []
  for (const item of state.media.items) {
    out.push({ module: 'media', id: item.id, title: item.title, group: '自媒体', key: bindingKey({ module: 'media', id: item.id }) })
  }
  for (const work of state.novel.works) {
    out.push({ module: 'novel', id: work.id, title: work.title, group: '小说', key: bindingKey({ module: 'novel', id: work.id }) })
  }
  for (const p of state.output.projects) {
    out.push({
      module: 'output',
      id: p.id,
      title: p.name,
      group: p.domain === 'video' ? '视频' : '开发',
      key: bindingKey({ module: 'output', id: p.id })
    })
  }
  return out
}

/**
 * 取绑定目标的当前标题。
 * 绑定里存了标题快照，但目标改名后应以实时数据为准；目标被删除时显示「已删除」，
 * 不静默变成空白，让用户知道这条绑定已经失效。
 */
export function currentBindingTitle(state: AppState, binding: ContentBinding): string {
  if (binding.module === 'media') {
    return state.media.items.find((x) => x.id === binding.id)?.title || `${binding.title}（已删除）`
  }
  if (binding.module === 'novel') {
    return state.novel.works.find((x) => x.id === binding.id)?.title || `${binding.title}（已删除）`
  }
  return state.output.projects.find((x) => x.id === binding.id)?.name || `${binding.title}（已删除）`
}

/** 显示绑定分组；历史数据没有 group 时按 module 兜底 */
export function bindingGroup(binding: ContentBinding): string {
  if (binding.group) return binding.group
  return binding.module === 'media' ? '自媒体' : binding.module === 'novel' ? '小说' : '作品'
}

/** 查询某业务实体关联的全部灵感与摘要，详情页只读展示 */
export function boundTo(state: AppState, module: BindModule, id: string) {
  return {
    ideas: state.ideas.filter((x) => (x.bindings || []).some((b) => b.module === module && b.id === id)),
    summaries: state.summaries.filter((x) => (x.bindings || []).some((b) => b.module === module && b.id === id))
  }
}
