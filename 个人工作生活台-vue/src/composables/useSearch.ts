/**
 * 文件：src/composables/useSearch.ts
 * 说明：全局搜索聚合器。跨任务、目标、灵感、摘要、收藏、学习、阅读、娱乐等实体生成可跳转搜索结果。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { PageKey } from '@/constants/nav'
import { useDeskStore } from '@/stores/desk'

export interface SearchHit {
  page: PageKey
  title: string
  extra: string
}

/**
 * 跨模块关键词搜索。
 * 不建立独立索引，直接遍历当前状态，适合个人库的数据量（万级以内）；
 * 每条结果只带页面 key 和展示文案，点击后由 TopBar 跳转到对应路由。
 * 学习类结果按所属 track.domain 分流到 /learning 或 /dev；最后截断 40 条，避免下拉过长。
 */
export function searchAll(keyword: string): SearchHit[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return []
  const s = useDeskStore().data
  const hits: SearchHit[] = []
  const like = (text?: string | null) => (text || '').toLowerCase().includes(q)

  s.tasks.forEach((t) => {
    if (like(t.title) || like(t.note)) hits.push({ page: 'tasks', title: t.title, extra: '任务' })
  })
  s.goals.forEach((g) => {
    if (like(g.title)) hits.push({ page: 'tasks', title: g.title, extra: '阶段目标' })
  })
  s.habits.forEach((h) => {
    if (like(h.name)) hits.push({ page: 'habits', title: h.name, extra: '习惯' })
  })
  s.fitness.exercises.forEach((e) => {
    if (like(e.name)) hits.push({ page: 'fitness', title: e.name, extra: '动作' })
  })
  s.media.items.forEach((i) => {
    if (like(i.title)) hits.push({ page: 'media', title: i.title, extra: '内容' })
  })
  s.media.topics.forEach((t) => {
    if (like(t.title)) hits.push({ page: 'media', title: t.title, extra: '选题' })
  })
  s.novel.works.forEach((w) => {
    if (like(w.title)) hits.push({ page: 'novel', title: w.title, extra: '作品' })
  })
  s.novel.chapters.forEach((c) => {
    if (like(c.title) || like(c.outline)) hits.push({ page: 'novel', title: c.title, extra: `第 ${c.no} 章` })
  })
  s.novel.settings.forEach((n) => {
    if (like(n.name)) hits.push({ page: 'novel', title: n.name, extra: '设定' })
  })
  s.output.projects.forEach((p) => {
    if (like(p.name) || like(p.goal)) hits.push({ page: 'output', title: p.name, extra: p.domain === 'video' ? '视频项目' : '开发项目' })
  })
  s.output.shots.forEach((x) => {
    if (like(x.desc)) hits.push({ page: 'output', title: `镜号 ${x.no}`, extra: '分镜' })
  })
  s.output.tickets.forEach((t) => {
    if (like(t.title)) hits.push({ page: 'output', title: t.title, extra: '需求/缺陷' })
  })
  const learningPage = (trackId: string) =>
    s.learning.tracks.find((x) => x.id === trackId)?.domain === 'dev' ? 'dev' : 'learning'
  s.learning.topics.forEach((t) => {
    if (like(t.title)) hits.push({ page: learningPage(t.trackId), title: t.title, extra: '知识点' })
  })
  s.learning.resources.forEach((r) => {
    if (like(r.title)) hits.push({ page: learningPage(r.trackId), title: r.title, extra: '资源' })
  })
  s.reading.books.forEach((b) => {
    if (like(b.title) || like(b.author) || like(b.category) || like(b.review)) {
      hits.push({ page: 'reading', title: b.title, extra: b.author ? `书籍 · ${b.author}` : '书籍' })
    }
  })
  s.ideas.forEach((i) => {
    const title = i.title || i.text || i.url || '图片'
    const fields = [
      i.text,
      i.title,
      i.url,
      ...i.categories,
      ...i.subcategories,
      ...i.keywords,
      ...(i.bindings || []).map((b) => b.title)
    ]
    if (fields.some((x) => x && like(x))) hits.push({ page: 'ideas', title: title.slice(0, 40), extra: '灵感' })
  })
  s.favorites.items.forEach((x) => {
    const fields = [x.title, x.summary, x.note, x.text, x.url, x.fileName, ...(x.tags || [])]
    if (fields.some((v) => v && like(v))) {
      const kinds = { text: '文字收藏', link: '链接收藏', image: '图片收藏', file: '文件收藏' }
      hits.push({ page: 'favorites', title: x.title || x.fileName || '未命名收藏', extra: kinds[x.kind] })
    }
  })
  s.leisure.forEach((l) => {
    if (like(l.title)) hits.push({ page: 'leisure', title: l.title, extra: '娱乐' })
  })

  return hits.slice(0, 40)
}
