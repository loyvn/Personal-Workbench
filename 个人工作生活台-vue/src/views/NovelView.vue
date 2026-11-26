<!--
  文件：src/views/NovelView.vue
  说明：小说创作页。管理作品总纲、故事线、章节、设定、伏笔和日更字数，按当前作品切换上下文。
  结构：页头当前作品与字数 → 作品切换/新建 → 总纲 → 故事线 → 章节表 → 设定库 → 伏笔台账 → 日更字数
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import BoundIdeas from '@/components/BoundIdeas.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { FormField } from '@/stores/ui'
import { todayStr } from '@/utils/date'
import { nowISO, sum, uid } from '@/utils/misc'
import type { Chapter, Foreshadow, NovelOutlineFile, NovelSetting, StoryNode, StoryNodeType, Work } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'
const outlineFileInput = ref<HTMLInputElement | null>(null)
const outlineUploading = ref(false)
const activeNodeId = ref('')

const activeId = ref<string>(s.value.novel.works[0]?.id || '')
watch(
  () => s.value.novel.works.length,
  () => {
    if (!activeId.value || !s.value.novel.works.some((w) => w.id === activeId.value)) {
      activeId.value = s.value.novel.works[0]?.id || ''
    }
  }
)

const work = computed<Work | null>(() => s.value.novel.works.find((w) => w.id === activeId.value) || null)
const chapters = computed(() =>
  s.value.novel.chapters.filter((c) => c.workId === activeId.value).slice().sort((a, b) => a.no - b.no)
)
const totalWords = computed(() => sum(chapters.value, (c) => c.words))
const todayWords = computed(() => s.value.novel.wordLog[t] || 0)
const progress = computed(() => {
  if (!work.value?.targetWords) return 0
  return Math.min(100, Math.round((totalWords.value / work.value.targetWords) * 100))
})
const openFores = computed(() => s.value.novel.foreshadows.filter((f) => f.workId === activeId.value && f.status === 'open'))
const doneFores = computed(() => s.value.novel.foreshadows.filter((f) => f.workId === activeId.value && f.status === 'recovered'))
const storyNodes = computed(() =>
  (s.value.novel.storyNodes || [])
    .filter((n) => n.workId === activeId.value)
    .slice()
    .sort((a, b) => a.chapter - b.chapter || a.updatedAt.localeCompare(b.updatedAt))
)
const CHART_W = 1000
const CHART_H = 220
const CHART_PAD_X = 46
const CHART_PAD_TOP = 22
const CHART_PAD_BOTTOM = 26
const storyPoints = computed(() =>
  storyNodes.value.map((node, index, list) => {
    const tension = Math.max(0, Math.min(100, Number(node.tension) || 0))
    return {
      ...node,
      tension,
      x: list.length === 1 ? CHART_W / 2 : CHART_PAD_X + index * ((CHART_W - CHART_PAD_X * 2) / (list.length - 1)),
      y: CHART_PAD_TOP + (1 - tension / 100) * (CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM)
    }
  })
)
const storyPolyline = computed(() => storyPoints.value.map((p) => `${p.x},${p.y}`).join(' '))
const storyArea = computed(() => {
  if (!storyPoints.value.length) return ''
  const first = storyPoints.value[0]
  const last = storyPoints.value[storyPoints.value.length - 1]
  return `${first.x},${CHART_H} ${storyPolyline.value} ${last.x},${CHART_H}`
})
const gridLines = [0, 25, 50, 75, 100].map((v) => ({
  v,
  y: CHART_PAD_TOP + (1 - v / 100) * (CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM)
}))
const NODE_TYPES: Array<{ key: StoryNodeType; label: string; color: string }> = [
  { key: 'setup', label: '铺垫', color: '#9a8f7e' },
  { key: 'turn', label: '转折', color: '#c07b3a' },
  { key: 'climax', label: '高潮', color: '#b4452f' },
  { key: 'ending', label: '结局', color: '#4e7a46' }
]
function nodeType(type: StoryNodeType) {
  return NODE_TYPES.find((x) => x.key === type) || NODE_TYPES[0]
}
function nodeTagClass(type: StoryNodeType) {
  return type === 'climax' ? 'red' : type === 'turn' ? 'amber' : type === 'ending' ? 'ok' : ''
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
const settingGroups = computed(() => {
  const list = s.value.novel.settings.filter((x) => x.workId === activeId.value)
  return [
    { key: 'character' as const, label: '人物', items: list.filter((x) => x.type === 'character') },
    { key: 'place' as const, label: '地点', items: list.filter((x) => x.type === 'place') },
    { key: 'faction' as const, label: '势力', items: list.filter((x) => x.type === 'faction') },
    { key: 'item' as const, label: '物件', items: list.filter((x) => x.type === 'item') }
  ]
})

function switchWork(id: string) {
  activeId.value = id
  activeNodeId.value = ''
}

function editOutline() {
  if (!work.value) {
    ui.toast('先建一本作品', 'err')
    return
  }
  ui.openForm({
    title: '编辑总纲',
    fields: [
      {
        key: 'outline',
        label: '总纲',
        type: 'textarea',
        placeholder: '世界观、主线、人物弧光、阶段冲突、结局方向…'
      }
    ],
    values: { outline: work.value.outline || '' },
    onSubmit(v) {
      store.commit((st) => {
        const w = st.novel.works.find((x) => x.id === activeId.value)
        if (!w) return
        w.outline = String(v.outline || '')
        w.updatedAt = nowISO()
      })
      ui.toast('总纲已保存')
    }
  })
}

function pickOutlineFile() {
  if (!work.value || outlineUploading.value) return
  outlineFileInput.value?.click()
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 读取总纲原文件：校验扩展名/体积，转 dataURL 并写入作品附件列表。
 */
async function onOutlineFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !work.value) return
  if (file.size > 8 * 1024 * 1024) {
    ui.toast('文档不能超过 8MB', 'err')
    return
  }
  outlineUploading.value = true
  try {
    const data = await fileToDataURL(file)
    const response = await fetch(`${API_BASE}/novel/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, type: file.type, data })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message || `上传失败（${response.status}）`)
    }
    const meta = body.data as NovelOutlineFile
    const text = /\.(txt|md|markdown)$/i.test(file.name) && file.size <= 2 * 1024 * 1024 ? (await file.text()).trim() : ''
    store.commit((st) => {
      const w = st.novel.works.find((x) => x.id === activeId.value)
      if (!w) return
      w.outlineFiles = [...(w.outlineFiles || []), meta]
      if (text) w.outline = [String(w.outline || '').trim(), `## ${file.name}\n${text}`].filter(Boolean).join('\n\n')
      w.updatedAt = nowISO()
    })
    ui.toast(text ? '文档已上传，正文已导入总纲' : '文档已上传')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '上传失败', 'err')
  } finally {
    outlineUploading.value = false
  }
}

/**
 * 从作品附件中移除原文件，仅删元信息，不触碰服务端其他作品文件。
 */
function removeOutlineFile(file: NovelOutlineFile) {
  ui.askConfirm({
    title: '移除总纲文档',
    message: `「${file.name}」会从总纲附件中移除。`,
    confirmText: '移除',
    onConfirm() {
      store.commit((st) => {
        const w = st.novel.works.find((x) => x.id === activeId.value)
        if (w) w.outlineFiles = (w.outlineFiles || []).filter((x) => x.id !== file.id)
      })
      fetch(`${API_BASE}/novel/files/${file.id}`, { method: 'DELETE' }).catch(() => undefined)
      ui.toast('文档已移除')
    }
  })
}

function openStoryNode(node?: StoryNode) {
  if (!work.value) {
    ui.toast('先建一本作品', 'err')
    return
  }
  const nextNo = chapters.value.length ? chapters.value[chapters.value.length - 1].no : 1
  ui.openForm({
    title: node ? '编辑关键节点' : '新增关键节点',
    fields: [
      { key: 'chapter', label: '章节', type: 'number', min: 1 },
      { key: 'title', label: '节点标题', placeholder: '例如：身世真相揭开' },
      {
        key: 'type',
        label: '节点类型',
        type: 'select',
        options: NODE_TYPES.map((x) => ({ value: x.key, label: x.label }))
      },
      { key: 'tension', label: '故事张力 0–100', type: 'number', min: 0, max: 100 },
      { key: 'note', label: '节点描述 / 大事记', type: 'textarea', placeholder: '这一刻发生了什么，为什么是高潮或转折' }
    ],
    values: node
      ? { chapter: node.chapter, title: node.title, type: node.type, tension: node.tension, note: node.note }
      : { chapter: nextNo, title: '', type: 'turn', tension: 60, note: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('节点标题不能为空', 'err')
        return false
      }
      const id = node?.id || uid()
      const value = {
        chapter: Math.max(1, Number(v.chapter) || 1),
        title: String(v.title).trim(),
        type: (v.type as StoryNodeType) || 'turn',
        tension: Math.max(0, Math.min(100, Number(v.tension) || 0)),
        note: String(v.note || '').trim(),
        updatedAt: nowISO()
      }
      store.commit((st) => {
        if (node) {
          const item = st.novel.storyNodes.find((x) => x.id === node.id)
          if (item) Object.assign(item, value)
        } else {
          st.novel.storyNodes.push({ id, workId: activeId.value, ...value })
        }
      })
      activeNodeId.value = id
      ui.toast(node ? '节点已保存' : '关键节点已加入故事线')
    }
  })
}

function removeStoryNode(node: StoryNode) {
  ui.askConfirm({
    title: '删除关键节点',
    message: `「${node.title}」会从故事线中移除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.novel.storyNodes = st.novel.storyNodes.filter((x) => x.id !== node.id)
      })
      if (activeNodeId.value === node.id) activeNodeId.value = ''
      ui.toast('已删除')
    }
  })
}

function createWork() {
  ui.openForm({
    title: '新建作品',
    fields: [
      { key: 'title', label: '书名', placeholder: '暂定名也行' },
      { key: 'genre', label: '类型', placeholder: '悬疑 / 都市 / 幻想' },
      { key: 'targetWords', label: '目标字数', type: 'number', min: 1000 }
    ],
    values: { title: '', genre: '', targetWords: 200000 },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('书名不能为空', 'err')
        return false
      }
      const id = uid()
      store.commit((st) => {
        st.novel.works.push({
          id,
          title: String(v.title).trim(),
          genre: String(v.genre || '未定'),
          targetWords: Number(v.targetWords) || 200000,
          status: 'active',
          createdAt: nowISO(),
          updatedAt: nowISO()
        })
      })
      activeId.value = id
      ui.toast('作品已建立')
    }
  })
}

function chapterFields(c?: Chapter): FormField[] {
  void c
  return [
    { key: 'no', label: '章号', type: 'number', min: 1 },
    { key: 'title', label: '章节名', placeholder: '例如：第三章 停电' },
    {
      key: 'status',
      label: '状态',
      type: 'select',
      options: [
        { value: 'outline', label: '列大纲' },
        { value: 'doing', label: '在写' },
        { value: 'done', label: '已完成' }
      ]
    },
    { key: 'words', label: '字数', type: 'number', min: 0 },
    { key: 'plot', label: '主要情节', type: 'textarea', placeholder: '这一章发生什么、冲突怎么推进' },
    { key: 'characters', label: '人物梳理', type: 'textarea', placeholder: '谁出场、关系变化、人物状态' },
    { key: 'highlights', label: '亮点', type: 'textarea', placeholder: '最值得看的一幕、反转或记忆点' },
    { key: 'foreshadow', label: '伏笔', type: 'textarea', placeholder: '本章埋下或回收了什么' },
    { key: 'outline', label: '大纲 / 要点', type: 'textarea' }
  ]
}

function openChapter(c?: Chapter) {
  if (!work.value) {
    ui.toast('先建一本作品', 'err')
    return
  }
  const nextNo = chapters.value.length ? chapters.value[chapters.value.length - 1].no + 1 : 1
  ui.openForm({
    title: c ? '编辑章节' : '新增章节',
    fields: chapterFields(c),
    values: c
      ? {
          no: c.no,
          title: c.title,
          status: c.status,
          words: c.words,
          plot: c.plot || '',
          characters: c.characters || '',
          highlights: c.highlights || '',
          foreshadow: c.foreshadow || '',
          outline: c.outline
        }
      : { no: nextNo, title: '', status: 'outline', words: 0, plot: '', characters: '', highlights: '', foreshadow: '', outline: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('章节名不能为空', 'err')
        return false
      }
      const oldWords = c ? c.words : 0
      const newWords = Math.max(0, Number(v.words) || 0)
      const delta = newWords - oldWords
      const detail = {
        plot: String(v.plot || '').trim(),
        characters: String(v.characters || '').trim(),
        highlights: String(v.highlights || '').trim(),
        foreshadow: String(v.foreshadow || '').trim()
      }
      store.commit((st) => {
        if (c) {
          const item = st.novel.chapters.find((x) => x.id === c.id)
          if (!item) return
          Object.assign(item, {
            no: Number(v.no) || item.no,
            title: String(v.title).trim(),
            status: v.status as Chapter['status'],
            words: newWords,
            ...detail,
            outline: String(v.outline || ''),
            updatedAt: nowISO()
          })
        } else {
          st.novel.chapters.push({
            id: uid(),
            workId: activeId.value,
            no: Number(v.no) || nextNo,
            title: String(v.title).trim(),
            status: (v.status as Chapter['status']) || 'outline',
            words: newWords,
            ...detail,
            outline: String(v.outline || ''),
            updatedAt: nowISO()
          })
        }
        if (delta > 0) st.novel.wordLog[t] = (st.novel.wordLog[t] || 0) + delta
        const w = st.novel.works.find((x) => x.id === activeId.value)
        if (w) w.updatedAt = nowISO()
      })
      ui.toast(delta > 0 ? `已记录，今日 +${delta} 字` : '已保存')
    }
  })
}

function removeChapter(c: Chapter) {
  ui.askConfirm({
    title: '删除章节',
    message: `「${c.title}」会从作品里移除，部分伏笔可能失去锚点。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.novel.chapters = st.novel.chapters.filter((x) => x.id !== c.id)
      })
    }
  })
}

function openForeshadow(f?: Foreshadow) {
  if (!work.value) {
    ui.toast('先建一本作品', 'err')
    return
  }
  ui.openForm({
    title: f ? '编辑伏笔' : '埋一个伏笔',
    fields: [
      { key: 'title', label: '伏笔内容', placeholder: '例如：母亲留下的半块玉佩' },
      { key: 'plantedChapter', label: '埋在哪一章', type: 'number', min: 1 },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        options: [
          { value: 'open', label: '未回收' },
          { value: 'recovered', label: '已回收' }
        ]
      },
      { key: 'recoveredChapter', label: '回收章节', type: 'number', min: 1 }
    ],
    values: f
      ? { title: f.title, plantedChapter: f.plantedChapter ?? 1, status: f.status, recoveredChapter: f.recoveredChapter ?? '' }
      : { title: '', plantedChapter: chapters.value.length || 1, status: 'open', recoveredChapter: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('先写伏笔内容', 'err')
        return false
      }
      const rec = v.recoveredChapter === '' ? null : Number(v.recoveredChapter)
      const status: Foreshadow['status'] = rec ? 'recovered' : 'open'
      store.commit((st) => {
        if (f) {
          const item = st.novel.foreshadows.find((x) => x.id === f.id)
          if (!item) return
          Object.assign(item, {
            title: String(v.title).trim(),
            plantedChapter: Number(v.plantedChapter) || null,
            recoveredChapter: rec,
            status,
            updatedAt: nowISO()
          })
        } else {
          st.novel.foreshadows.push({
            id: uid(),
            workId: activeId.value,
            title: String(v.title).trim(),
            plantedChapter: Number(v.plantedChapter) || null,
            recoveredChapter: rec,
            status,
            updatedAt: nowISO()
          })
        }
      })
      ui.toast(status === 'recovered' ? '已标记回收' : '伏笔已记下')
    }
  })
}

/**
 * 标记伏笔已回收并记录回收章节；未回收项继续置顶。
 */
function recover(f: Foreshadow) {
  ui.openForm({
    title: '回收伏笔',
    fields: [{ key: 'chapter', label: '在第几章回收', type: 'number', min: 1 }],
    values: { chapter: chapters.value.length || 1 },
    onSubmit(v) {
      const n = Number(v.chapter) || null
      store.commit((st) => {
        const item = st.novel.foreshadows.find((x) => x.id === f.id)
        if (!item) return
        item.recoveredChapter = n
        item.status = 'recovered'
        item.updatedAt = nowISO()
      })
      ui.toast('已回收')
    }
  })
}

function removeForeshadow(f: Foreshadow) {
  store.commit((st) => {
    st.novel.foreshadows = st.novel.foreshadows.filter((x) => x.id !== f.id)
  })
}

function openSetting(type: NovelSetting['type']) {
  if (!work.value) {
    ui.toast('先建一本作品', 'err')
    return
  }
  ui.openForm({
    title: '新增设定',
    fields: [
      { key: 'name', label: '名称' },
      {
        key: 'type',
        label: '类别',
        type: 'select',
        options: [
          { value: 'character', label: '人物' },
          { value: 'place', label: '地点' },
          { value: 'faction', label: '势力' },
          { value: 'item', label: '物件' }
        ]
      },
      { key: 'k1', label: '属性名 1', placeholder: '年龄' },
      { key: 'v1', label: '属性值 1', placeholder: '29' },
      { key: 'k2', label: '属性名 2', placeholder: '职业' },
      { key: 'v2', label: '属性值 2', placeholder: '夜班编辑' },
      { key: 'note', label: '备注', type: 'textarea' }
    ],
    values: { name: '', type, k1: '', v1: '', k2: '', v2: '', note: '' },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('名称不能为空', 'err')
        return false
      }
      const attrs = [
        { k: String(v.k1 || '').trim(), v: String(v.v1 || '').trim() },
        { k: String(v.k2 || '').trim(), v: String(v.v2 || '').trim() }
      ].filter((a) => a.k)
      store.commit((st) => {
        st.novel.settings.push({
          id: uid(),
          workId: activeId.value,
          type: (v.type as NovelSetting['type']) || type,
          name: String(v.name).trim(),
          attrs,
          note: String(v.note || '')
        })
      })
      ui.toast('设定已加入')
    }
  })
}

function editSetting(item: NovelSetting) {
  ui.openForm({
    title: '编辑设定',
    fields: [
      { key: 'name', label: '名称' },
      { key: 'note', label: '备注', type: 'textarea' }
    ],
    values: { name: item.name, note: item.note },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        const x = st.novel.settings.find((o) => o.id === item.id)
        if (!x) return
        x.name = String(v.name).trim()
        x.note = String(v.note || '')
      })
      ui.toast('已保存')
    }
  })
}

function removeSetting(item: NovelSetting) {
  ui.askConfirm({
    title: '删除设定',
    message: `「${item.name}」会从设定库移除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.novel.settings = st.novel.settings.filter((x) => x.id !== item.id)
      })
    }
  })
}

/**
 * 把设定库的自定义属性对拼成可读文本，空值不展示。
 */
function attrText(item: NovelSetting) {
  return item.attrs.map((a) => `${a.k}：${a.v}`).join(' · ') || '暂无属性'
}

/**
 * 切换作品连载状态，暂停/完结不影响已有章节和字数。
 */
function switchStatus(w: Work, status: Work['status']) {
  if (w.status === status) return
  store.commit((st) => {
    const x = st.novel.works.find((o) => o.id === w.id)
    if (x) {
      x.status = status
      x.updatedAt = nowISO()
    }
  })
}

function onStatusChange(e: Event) {
  if (!work.value) return
  const v = (e.target as HTMLSelectElement).value as Work['status']
  switchStatus(work.value, v)
}
</script>

<template>
  <PageHeader title="小说创作" :subtitle="work ? `${work.genre} · ${totalWords.toLocaleString()} / ${work.targetWords.toLocaleString()} 字` : '还没有作品'">
    <template #actions>
      <button class="btn btn-primary" @click="createWork">+ 新建作品</button>
    </template>
  </PageHeader>

  <input ref="outlineFileInput" type="file" accept=".txt,.md,.markdown,.doc,.docx,.pdf" hidden @change="onOutlineFile" />

  <EmptyState v-if="!s.novel.works.length" title="还没有作品" desc="建一本，先写第一章的三百字" action="新建作品" @action="createWork" />

  <template v-else>
    <div class="card" style="margin-bottom: 16px">
      <div class="chips">
        <button v-for="w in s.novel.works" :key="w.id" class="chip" :class="{ on: w.id === activeId }" @click="switchWork(w.id)">
          {{ w.title }}
        </button>
      </div>
      <div v-if="work" style="display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap">
        <span class="tag" :class="work.status === 'active' ? 'ok' : work.status === 'finished' ? '' : 'amber'">
          {{ work.status === 'active' ? '写作中' : work.status === 'finished' ? '已完结' : '暂停' }}
        </span>
        <span style="font-size: 11.5px; color: var(--muted)">今日 {{ todayWords }} 字 · 共 {{ chapters.length }} 章</span>
        <div class="spacer" />
        <select :value="work.status" style="width: auto" @change="onStatusChange">
          <option value="active">写作中</option>
          <option value="paused">暂停</option>
          <option value="finished">已完结</option>
        </select>
      </div>
      <div v-if="work" class="pbar" style="margin-top: 10px">
        <i :style="{ width: progress + '%' }" />
      </div>
      <div v-if="work" style="font-size: 11px; color: var(--muted); margin-top: 5px">进度 {{ progress }}%</div>
    </div>

    <section v-if="work" class="sect">
      <div class="sect-h novel-outline-head">
        <h2>总纲</h2>
        <span class="cnt">{{ (work.outline || '').trim() ? '已写' : '待写' }} · {{ (work.outlineFiles || []).length }} 份文档</span>
        <div class="spacer" />
        <div class="novel-head-actions">
          <button class="btn" :disabled="outlineUploading" @click="pickOutlineFile">
            {{ outlineUploading ? '上传中…' : '+ 上传文档' }}
          </button>
          <button class="btn btn-primary" @click="editOutline">编辑总纲</button>
        </div>
      </div>
      <div class="card outline-card">
        <div v-if="work.outline" class="outline-text">{{ work.outline }}</div>
        <div v-else class="outline-empty">还没写总纲。先定世界观、主线、人物弧光和结局方向，也可以直接上传文档。</div>
        <div v-if="(work.outlineFiles || []).length" class="outline-files">
          <div v-for="file in work.outlineFiles || []" :key="file.id" class="outline-file">
            <a :href="file.url" target="_blank" rel="noreferrer" class="outline-file-name">{{ file.name }}</a>
            <span class="outline-file-size">{{ formatSize(file.size) }}</span>
            <button class="mini danger" @click="removeOutlineFile(file)">移除</button>
          </div>
        </div>
        <div class="outline-hint">支持 txt、md、doc、docx、pdf，单个文档不超过 8MB；txt / md 会同时导入正文。</div>
        <BoundIdeas module="novel" :target-id="work.id" />
      </div>
    </section>

    <section v-if="work" class="sect">
      <div class="sect-h novel-story-head">
        <h2>故事线</h2>
        <span class="cnt">{{ storyNodes.length }} 个关键节点 · 大事记</span>
        <div class="spacer" />
        <div class="novel-head-actions">
          <button class="btn" @click="openStoryNode()">+ 关键节点</button>
        </div>
      </div>
      <div v-if="storyNodes.length" class="card story-card">
        <div class="story-chart">
          <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none" aria-hidden="true">
            <line
              v-for="g in gridLines"
              :key="g.v"
              x1="0"
              :x2="CHART_W"
              :y1="g.y"
              :y2="g.y"
              class="story-grid"
            />
            <polygon :points="storyArea" class="story-area" />
            <polyline :points="storyPolyline" class="story-line" />
          </svg>
          <button
            v-for="p in storyPoints"
            :key="p.id"
            type="button"
            class="story-dot"
            :class="{ active: p.id === activeNodeId }"
            :style="{ left: `${(p.x / CHART_W) * 100}%`, top: `${(p.y / CHART_H) * 100}%`, background: nodeType(p.type).color }"
            :title="`第 ${p.chapter} 章 · ${p.title}｜${nodeType(p.type).label}｜张力 ${p.tension}`"
            :aria-label="`第 ${p.chapter} 章 ${p.title}`"
            @click="activeNodeId = p.id"
          />
        </div>
        <div class="story-legend">
          <span v-for="n in NODE_TYPES" :key="n.key" class="story-legend-item">
            <i :style="{ background: n.color }" />{{ n.label }}
          </span>
          <span class="story-chart-hint">点越高冲突越强，点一下圆点会在下方定位对应大事记</span>
        </div>
        <div class="story-milestones">
          <div
            v-for="node in storyNodes"
            :key="node.id"
            class="story-node-row"
            :class="{ active: node.id === activeNodeId }"
            @click="activeNodeId = node.id"
          >
            <span class="story-node-chapter">第 {{ node.chapter }} 章</span>
            <div class="story-node-copy">
              <div class="story-node-title">
                {{ node.title }}
                <span class="tag" :class="nodeTagClass(node.type)">{{ nodeType(node.type).label }}</span>
                <span class="story-node-tension">张力 {{ node.tension }}</span>
              </div>
              <div v-if="node.note" class="story-node-note">{{ node.note }}</div>
            </div>
            <div class="story-node-actions">
              <button class="mini" @click.stop="openStoryNode(node)">改</button>
              <button class="mini danger" @click.stop="removeStoryNode(node)">删</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="card story-empty">还没有故事线。先标一个起点或高潮，再沿着章节把张力拉起来。</div>
    </section>

    <div class="home-wrap">
      <div>
        <section class="sect">
          <div class="sect-h novel-chapter-head">
            <h2>章节</h2>
            <span class="cnt">按章号 · {{ chapters.length }} 章</span>
            <div class="spacer" />
            <div class="novel-head-actions">
              <button class="btn btn-primary" :disabled="!work" @click="openChapter()">+ 新建章节</button>
            </div>
          </div>
          <template v-if="chapters.length">
            <div class="card flush tbl-wrap chapter-table">
              <table class="tbl">
                <thead><tr><th class="num">章</th><th>标题与细节</th><th>状态</th><th class="num">字数</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="c in chapters" :key="c.id">
                    <td class="num">{{ c.no }}</td>
                    <td>
                      <div>{{ c.title }}</div>
                      <div v-if="c.plot" class="chapter-detail"><b>主要情节</b>{{ c.plot }}</div>
                      <div v-if="c.characters" class="chapter-detail"><b>人物</b>{{ c.characters }}</div>
                      <div v-if="c.highlights" class="chapter-detail"><b>亮点</b>{{ c.highlights }}</div>
                      <div v-if="c.foreshadow" class="chapter-detail"><b>伏笔</b>{{ c.foreshadow }}</div>
                      <div v-if="c.outline" class="chapter-detail muted"><b>大纲</b>{{ c.outline }}</div>
                    </td>
                    <td>
                      <span class="tag" :class="c.status === 'done' ? 'ok' : c.status === 'doing' ? 'amber' : ''">
                        {{ c.status === 'done' ? '完成' : c.status === 'doing' ? '在写' : '大纲' }}
                      </span>
                    </td>
                    <td class="num">{{ c.words }}</td>
                    <td>
                      <button class="mini" @click="openChapter(c)">改</button>
                      <button class="mini danger" @click="removeChapter(c)">删</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="chapter-cards">
              <div v-for="c in chapters" :key="c.id" class="card chapter-card">
                <div class="chapter-card-head">
                  <span class="chapter-card-no">第 {{ c.no }} 章</span>
                  <span class="tag" :class="c.status === 'done' ? 'ok' : c.status === 'doing' ? 'amber' : ''">
                    {{ c.status === 'done' ? '完成' : c.status === 'doing' ? '在写' : '大纲' }}
                  </span>
                  <span class="chapter-card-words">{{ c.words }} 字</span>
                  <div class="spacer" />
                  <button class="mini" @click="openChapter(c)">改</button>
                  <button class="mini danger" @click="removeChapter(c)">删</button>
                </div>
                <div class="chapter-card-title">{{ c.title }}</div>
                <div v-if="c.plot" class="chapter-detail"><b>主要情节</b>{{ c.plot }}</div>
                <div v-if="c.characters" class="chapter-detail"><b>人物</b>{{ c.characters }}</div>
                <div v-if="c.highlights" class="chapter-detail"><b>亮点</b>{{ c.highlights }}</div>
                <div v-if="c.foreshadow" class="chapter-detail"><b>伏笔</b>{{ c.foreshadow }}</div>
                <div v-if="c.outline" class="chapter-detail muted"><b>大纲</b>{{ c.outline }}</div>
              </div>
            </div>
          </template>
          <div v-else class="card" style="color: var(--muted); font-size: 13px">还没有章节，先列第一章的大纲</div>
        </section>

        <section class="sect">
          <div class="sect-h">
            <h2>伏笔</h2>
            <span class="cnt">{{ openFores.length }} 未回收 / {{ doneFores.length }} 已回收</span>
            <div class="spacer" />
            <button class="mini" @click="openForeshadow()">+ 埋一个</button>
          </div>
          <div v-if="s.novel.foreshadows.filter((f) => f.workId === activeId).length" class="card">
            <div class="rows">
              <div v-for="f in s.novel.foreshadows.filter((x) => x.workId === activeId)" :key="f.id" class="row">
                <div class="body">
                  <div class="title">{{ f.title }}</div>
                  <div class="meta">
                    <span>{{ f.plantedChapter ? `第 ${f.plantedChapter} 章埋` : '未标章' }}</span>
                    <span v-if="f.recoveredChapter">第 {{ f.recoveredChapter }} 章回收</span>
                    <span v-else class="tag amber">悬着</span>
                  </div>
                </div>
                <div class="acts">
                  <button v-if="f.status === 'open'" class="mini" @click="recover(f)">回收</button>
                  <button class="mini" @click="openForeshadow(f)">改</button>
                  <button class="mini danger" @click="removeForeshadow(f)">删</button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="card" style="color: var(--muted); font-size: 13px">没有伏笔，故事会显得太直</div>
        </section>
      </div>

      <div>
        <section class="sect">
          <div class="sect-h"><h2>设定库</h2><span class="cnt">人物 · 地点 · 势力 · 物件</span></div>
          <div v-for="g in settingGroups" :key="g.key" style="margin-bottom: 12px">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px">
              <span style="font-size: 12px; font-weight: 600">{{ g.label }}</span>
              <span style="font-size: 11px; color: var(--muted)">{{ g.items.length }}</span>
              <div class="spacer" />
              <button class="mini" @click="openSetting(g.key)">+</button>
            </div>
            <div v-if="g.items.length" class="card card-tight">
              <div v-for="item in g.items" :key="item.id" class="row" style="padding: 6px 0">
                <div class="body">
                  <div class="title">{{ item.name }}</div>
                  <div class="meta">{{ attrText(item) }}</div>
                  <div v-if="item.note" style="font-size: 11px; color: var(--muted); margin-top: 2px">{{ item.note }}</div>
                </div>
                <div class="acts">
                  <button class="mini" @click="editSetting(item)">改</button>
                  <button class="mini danger" @click="removeSetting(item)">删</button>
                </div>
              </div>
            </div>
            <div v-else style="font-size: 11.5px; color: var(--muted)">空</div>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.novel-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}

.outline-card {
  padding: 14px;
}

.outline-text {
  max-height: 320px;
  overflow-y: auto;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink);
  white-space: pre-line;
}

.outline-empty {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--muted);
}

.outline-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
}

.outline-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11.5px;
}

.outline-file-name {
  min-width: 0;
  overflow: hidden;
  color: var(--green);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-file-size {
  flex: none;
  color: var(--muted);
  font-family: var(--mono);
}

.outline-hint {
  margin-top: 10px;
  font-size: 10.5px;
  color: var(--muted);
}

.story-card {
  padding: 14px;
}

.story-chart {
  position: relative;
  height: 220px;
  margin: 2px 10px 0;
}

.story-chart svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.story-grid {
  stroke: var(--line-soft);
  stroke-width: 1;
}

.story-area {
  fill: var(--green-soft);
  opacity: 0.5;
}

.story-line {
  fill: none;
  stroke: var(--green);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.story-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid var(--card);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(34, 32, 28, 0.25);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.story-dot:hover,
.story-dot:focus-visible {
  transform: translate(-50%, -50%) scale(1.25);
  box-shadow: 0 3px 10px rgba(34, 32, 28, 0.35);
  outline: none;
}

.story-dot.active {
  width: 19px;
  height: 19px;
  border-width: 3px;
  box-shadow: 0 0 0 3px var(--green-soft), 0 3px 10px rgba(34, 32, 28, 0.35);
}

.story-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 11px;
  color: var(--muted);
}

.story-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.story-legend-item i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.story-chart-hint {
  margin-left: auto;
}

.story-milestones {
  margin-top: 12px;
  border-top: 1px solid var(--line-soft);
}

.story-node-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 10px 6px;
  border-bottom: 1px solid var(--line-soft);
  border-radius: var(--r-xs);
  cursor: pointer;
}

.story-node-row:last-child {
  border-bottom: 0;
}

.story-node-row.active {
  background: var(--green-soft);
}

.story-node-chapter {
  padding-top: 1px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}

.story-node-copy {
  min-width: 0;
}

.story-node-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.story-node-tension {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 400;
  color: var(--muted);
}

.story-node-note {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--muted);
  white-space: pre-line;
}

.story-node-actions {
  display: flex;
  gap: 4px;
}

.story-empty {
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
}

.chapter-detail {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--muted);
  white-space: pre-line;
}

.chapter-detail b {
  margin-right: 4px;
  color: var(--ink);
  font-weight: 600;
}

.chapter-detail.muted {
  opacity: 0.82;
}

.chapter-cards {
  display: none;
  flex-direction: column;
  gap: 10px;
}

.chapter-card {
  padding: 12px;
}

.chapter-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapter-card-no {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.chapter-card-words {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--muted);
}

.chapter-card-title {
  margin-top: 5px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

@media (max-width: 560px) {
  .novel-outline-head,
  .novel-story-head,
  .novel-chapter-head {
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .novel-outline-head .spacer,
  .novel-story-head .spacer,
  .novel-chapter-head .spacer {
    display: none;
  }

  .novel-head-actions {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }

  .chapter-table {
    display: none;
  }

  .chapter-cards {
    display: flex;
  }

  .outline-card,
  .story-card {
    padding: 12px;
  }

  .story-chart {
    height: 170px;
    margin: 4px 5px 0;
  }

  .story-chart-hint {
    width: 100%;
    margin-left: 0;
  }

  .story-node-row {
    grid-template-columns: 68px minmax(0, 1fr);
    gap: 6px 8px;
    padding: 10px 4px;
  }

  .story-node-actions {
    grid-column: 2;
    justify-content: flex-end;
  }

  .outline-file {
    flex-wrap: wrap;
  }

  .outline-file-name {
    max-width: 100%;
    white-space: normal;
    word-break: break-all;
  }
}
</style>