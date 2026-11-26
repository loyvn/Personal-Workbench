<!--
  文件：src/views/MediaView.vue
  说明：自媒体页。以本周排期和内容流水线为核心，管理选题库、平台数据与从选题到发布的状态推进。
  结构：页头统计 → 本周排期七列 → 内容流水线 → 选题库 → 平台数据
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import BoundIdeas from '@/components/BoundIdeas.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { FormField } from '@/stores/ui'
import { relDay, shiftYMD, todayStr, weekRange } from '@/utils/date'
import { nowISO, sum, uid } from '@/utils/misc'
import type { MediaItem, MediaStatus } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()

const STATUS: Array<{ key: MediaStatus; label: string }> = [
  { key: 'idea', label: '选题' },
  { key: 'script', label: '脚本' },
  { key: 'produce', label: '制作' },
  { key: 'published', label: '已发布' }
]
const statusLabel = (k: MediaStatus) => STATUS.find((x) => x.key === k)?.label || k

const filterStatus = ref<'' | MediaStatus>('')
const filterPlatform = ref('')

const items = computed(() =>
  s.value.media.items
    .filter((x) => (filterStatus.value ? x.status === filterStatus.value : true))
    .filter((x) => (filterPlatform.value ? x.platformIds.includes(filterPlatform.value) : true))
    .slice()
    .sort((a, b) => (a.planDate || '9999').localeCompare(b.planDate || '9999'))
)

const pipeline = computed(() =>
  STATUS.map((st) => ({ ...st, n: s.value.media.items.filter((x) => x.status === st.key).length }))
)

const published = computed(() => s.value.media.items.filter((x) => x.status === 'published'))
const totalStats = computed(() => ({
  read: sum(published.value, (x) => x.stats.read),
  like: sum(published.value, (x) => x.stats.like),
  fav: sum(published.value, (x) => x.stats.fav),
  comment: sum(published.value, (x) => x.stats.comment)
}))

const week = weekRange()
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => shiftYMD(week.start, i)))

function itemsOn(date: string) {
  return s.value.media.items.filter((x) => x.planDate === date)
}

function platformName(id: string) {
  return s.value.media.platforms.find((p) => p.id === id)?.name || '未选'
}

const mediaFields = (): FormField[] => [
  { key: 'title', label: '标题', placeholder: '这条内容讲什么' },
  { key: 'topic', label: '选题', placeholder: '这条内容的具体选题 / 切入角度' },
  { key: 'positioning', label: '内容定位', placeholder: '给谁看、解决什么问题' },
  { key: 'style', label: '风格', placeholder: '如：口语化、干货、纪实、轻松' },
  { key: 'highlights', label: '亮点', placeholder: '最吸引人的点、钩子或记忆点' },
  { key: 'goal', label: '目标', placeholder: '如：涨粉、播放量、收藏、引流' },
  {
    key: 'platformIds',
    label: '平台',
    type: 'multi',
    options: s.value.media.platforms.map((p) => ({ value: p.id, label: p.name }))
  },
  { key: 'planDate', label: '计划发布日', type: 'date' },
  { key: 'topicId', label: '关联选题库', type: 'select', options: [{ value: '', label: '不关联' }, ...s.value.media.topics.filter((x) => !x.used).map((x) => ({ value: x.id, label: x.title }))] },
  { key: 'note', label: '备注 / 脚本要点', type: 'textarea' }
]

function briefFields(item: MediaItem) {
  return [
    { label: '选题', value: item.topic },
    { label: '定位', value: item.positioning },
    { label: '风格', value: item.style },
    { label: '亮点', value: item.highlights },
    { label: '目标', value: item.goal }
  ].filter((x) => String(x.value || '').trim())
}

function openItem(item?: MediaItem) {
  ui.openForm({
    title: item ? '编辑内容' : '新建内容',
    fields: mediaFields(),
    values: item
      ? {
          title: item.title,
          topic: item.topic || '',
          positioning: item.positioning || '',
          style: item.style || '',
          highlights: item.highlights || '',
          goal: item.goal || '',
          platformIds: item.platformIds,
          planDate: item.planDate,
          topicId: item.topicId || '',
          note: item.note
        }
      : {
          title: '',
          topic: '',
          positioning: '',
          style: '',
          highlights: '',
          goal: '',
          platformIds: [],
          planDate: shiftYMD(t, 2),
          topicId: '',
          note: ''
        },
    onSubmit(v) {
      const title = String(v.title || '').trim()
      if (!title) {
        ui.toast('标题不能为空', 'err')
        return false
      }
      const platformIds = Array.isArray(v.platformIds) ? v.platformIds.map(String) : []
      const details = {
        topic: String(v.topic || '').trim(),
        positioning: String(v.positioning || '').trim(),
        style: String(v.style || '').trim(),
        highlights: String(v.highlights || '').trim(),
        goal: String(v.goal || '').trim()
      }
      store.commit((st) => {
        if (item) {
          const x = st.media.items.find((i) => i.id === item.id)
          if (!x) return
          Object.assign(x, {
            title,
            ...details,
            platformIds,
            planDate: String(v.planDate || ''),
            topicId: v.topicId ? String(v.topicId) : null,
            note: String(v.note || ''),
            updatedAt: nowISO()
          })
        } else {
          st.media.items.push({
            id: uid(),
            title,
            ...details,
            topicId: v.topicId ? String(v.topicId) : null,
            platformIds,
            status: 'idea',
            planDate: String(v.planDate || ''),
            publishedAt: null,
            stats: { read: 0, like: 0, fav: 0, comment: 0 },
            note: String(v.note || ''),
            updatedAt: nowISO()
          })
        }
      })
      ui.toast('已保存')
    }
  })
}

/**
 * 把内容推进到下一个流水线状态；已发布时补 publishedAt。
 */
function advance(item: MediaItem) {
  const idx = STATUS.findIndex((x) => x.key === item.status)
  if (idx < 0 || idx >= STATUS.length - 1) return
  const next = STATUS[idx + 1].key
  store.commit((st) => {
    const x = st.media.items.find((i) => i.id === item.id)
    if (!x) return
    x.status = next
    if (next === 'published') x.publishedAt = t
    x.updatedAt = nowISO()
  })
  if (next === 'published') promptStats(item)
}

/**
 * 解析内容关联提示词的使用情况，供流水线卡片展示。
 */
function promptStats(item: MediaItem) {
  ui.openForm({
    title: '填写发布数据',
    fields: [
      { key: 'read', label: '阅读 / 播放', type: 'number', min: 0 },
      { key: 'like', label: '点赞', type: 'number', min: 0 },
      { key: 'fav', label: '收藏', type: 'number', min: 0 },
      { key: 'comment', label: '评论', type: 'number', min: 0 }
    ],
    values: { ...item.stats },
    onSubmit(v) {
      store.commit((st) => {
        const x = st.media.items.find((i) => i.id === item.id)
        if (!x) return
        x.stats = {
          read: Number(v.read) || 0,
          like: Number(v.like) || 0,
          fav: Number(v.fav) || 0,
          comment: Number(v.comment) || 0
        }
        x.updatedAt = nowISO()
      })
      ui.toast('数据已记下')
    }
  })
}

function removeItem(item: MediaItem) {
  ui.askConfirm({
    title: '删除内容',
    message: `「${item.title}」及其数据将删除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.media.items = st.media.items.filter((x) => x.id !== item.id)
      })
      ui.toast('已删除')
    }
  })
}

function openTopic() {
  ui.openForm({
    title: '新增选题',
    fields: [
      { key: 'title', label: '选题', placeholder: '一句话写下要讲什么' },
      { key: 'category', label: '大分类', placeholder: '如：干货 / Vlog / 测评 / 剧情' },
      { key: 'description', label: '描述', type: 'textarea', placeholder: '讲什么、为什么做、想给谁看' }
    ],
    values: { title: '', category: '', description: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('先写选题', 'err')
        return false
      }
      store.commit((st) => {
        st.media.topics.push({
          id: uid(),
          title: String(v.title).trim(),
          category: String(v.category || '').trim(),
          description: String(v.description || '').trim(),
          sourceIdeaId: null,
          used: false
        })
      })
      ui.toast('选题已收下')
    }
  })
}

function dropTopic(id: string) {
  store.commit((st) => {
    st.media.topics = st.media.topics.filter((x) => x.id !== id)
  })
}

/**
 * 把选题转成内容项并标记 used，避免同一选题重复建稿。
 */
function useTopicAsItem(topicId: string) {
  const topic = s.value.media.topics.find((x) => x.id === topicId)
  if (!topic) return
  store.commit((st) => {
    st.media.items.push({
      id: uid(),
      title: topic.title,
      topic: topic.title,
      positioning: '',
      style: '',
      highlights: '',
      goal: '',
      topicId: topic.id,
      platformIds: [],
      status: 'idea',
      planDate: shiftYMD(t, 3),
      publishedAt: null,
      stats: { read: 0, like: 0, fav: 0, comment: 0 },
      note: topic.description || '',
      updatedAt: nowISO()
    })
    const tp = st.media.topics.find((x) => x.id === topicId)
    if (tp) tp.used = true
  })
  ui.toast('已转为内容，去排期')
}

function setStatus(e: Event) {
  filterStatus.value = ((e.target as HTMLSelectElement).value || '') as '' | MediaStatus
}

function setPlatform(e: Event) {
  filterPlatform.value = (e.target as HTMLSelectElement).value || ''
}
</script>

<template>
  <PageHeader title="自媒体" :subtitle="`${s.media.items.length} 条内容 · ${published.length} 条已发布`" />

  <div class="kpis" style="margin-bottom: 16px">
    <div class="kpi">
      <div class="kv">{{ pipeline.map((p) => p.n).join(':') }}</div>
      <div class="kl">选题:脚本:制作:已发布</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ totalStats.read.toLocaleString() }}</div>
      <div class="kl">累计阅读 / 播放</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ totalStats.like.toLocaleString() }}</div>
      <div class="kl">累计点赞</div>
      <div class="ks">收藏 {{ totalStats.fav }} · 评论 {{ totalStats.comment }}</div>
    </div>
  </div>

  <section class="sect">
    <div class="sect-h"><h2>本周排期</h2><span class="cnt">{{ week.start.slice(5) }} – {{ week.end.slice(5) }}</span></div>
    <div class="card">
      <div class="week-strip">
        <div v-for="d in weekDays" :key="d" class="wday" :class="{ today: d === t }">
          <div class="wd">{{ ['一', '二', '三', '四', '五', '六', '日'][weekDays.indexOf(d)] }}</div>
          <div class="wd-n">{{ d.slice(8) }}</div>
          <div class="wd-items">
            <span v-for="x in itemsOn(d).slice(0, 3)" :key="x.id" class="dot" :title="x.title" />
            <span v-if="itemsOn(d).length > 3" class="dot more">+{{ itemsOn(d).length - 3 }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h media-content-head">
      <h2>内容流水线</h2>
      <div class="spacer" />
      <div class="media-content-tools">
        <select :value="filterStatus" style="width: auto" @change="setStatus">
          <option value="">全部状态</option>
          <option v-for="x in STATUS" :key="x.key" :value="x.key">{{ x.label }}</option>
        </select>
        <select :value="filterPlatform" style="width: auto" @change="setPlatform">
          <option value="">全部平台</option>
          <option v-for="p in s.media.platforms" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="btn btn-primary" @click="openItem()">+ 新建内容</button>
      </div>
    </div>
    <div v-if="items.length" class="rows">
      <div v-for="x in items" :key="x.id" class="card card-tight">
        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start">
          <div style="min-width: 0">
            <div style="font-size: 13.5px; font-weight: 600; line-height: 1.4">{{ x.title }}</div>
            <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center">
              <span class="tag" :class="x.status === 'published' ? 'ok' : x.status === 'produce' ? 'amber' : ''">{{ statusLabel(x.status) }}</span>
              <span class="tag">{{ relDay(x.planDate) }}</span>
              <span v-for="pid in x.platformIds" :key="pid" class="tag soft">{{ platformName(pid) }}</span>
            </div>
            <div v-if="briefFields(x).length" class="media-brief">
              <span v-for="row in briefFields(x)" :key="row.label" class="brief-item">
                <span class="brief-label">{{ row.label }}</span>{{ row.value }}
              </span>
            </div>
            <div v-if="x.status === 'published'" style="font-size: 11.5px; color: var(--muted); margin-top: 5px">
              阅读 {{ x.stats.read }} · 赞 {{ x.stats.like }} · 藏 {{ x.stats.fav }} · 评 {{ x.stats.comment }}
            </div>
            <BoundIdeas module="media" :target-id="x.id" />
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end">
            <button v-if="x.status !== 'published'" class="mini" @click="advance(x)">
              推进到{{ statusLabel(STATUS[STATUS.findIndex((o) => o.key === x.status) + 1].key) }}
            </button>
            <button v-else class="mini" @click="promptStats(x)">数据</button>
            <button class="mini" @click="openItem(x)">编辑</button>
            <button class="mini danger" @click="removeItem(x)">删</button>
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-else title="还没有内容" desc="先建一条，选题库也可以直接转" action="新建内容" @action="openItem()" />
  </section>

  <section class="sect">
    <div class="sect-h">
      <h2>选题库</h2>
      <span class="cnt">{{ s.media.topics.filter((x) => !x.used).length }} 条未用</span>
      <div class="spacer" />
      <button class="btn" @click="openTopic">+ 选题</button>
    </div>
    <div v-if="s.media.topics.length" class="card">
      <div class="rows">
        <div v-for="x in s.media.topics" :key="x.id" class="row">
          <div class="body">
            <div class="topic-title-line">
              <span class="title">{{ x.title }}</span>
              <span v-if="x.category" class="tag">{{ x.category }}</span>
            </div>
            <div v-if="x.description" class="topic-desc">{{ x.description }}</div>
          </div>
          <div class="acts">
            <button v-if="!x.used" class="mini" @click="useTopicAsItem(x.id)">转内容</button>
            <span v-else class="tag ok">已用</span>
            <button class="mini danger" @click="dropTopic(x.id)">删</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card" style="color: var(--muted); font-size: 13px">选题库是空的，收几个进去</div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>平台数据</h2><span class="cnt">按已发布内容汇总</span></div>
    <div class="card flush tbl-wrap">
      <table class="tbl">
        <thead><tr><th>平台</th><th class="num">条数</th><th class="num">阅读</th><th class="num">赞</th><th class="num">藏</th><th class="num">评</th></tr></thead>
        <tbody>
          <tr v-for="p in s.media.platforms" :key="p.id">
            <td><span class="dot-color" :style="{ background: p.color }" />{{ p.name }}</td>
            <td class="num">{{ published.filter((x) => x.platformIds.includes(p.id)).length }}</td>
            <td class="num">{{ sum(published.filter((x) => x.platformIds.includes(p.id)), (x) => x.stats.read) }}</td>
            <td class="num">{{ sum(published.filter((x) => x.platformIds.includes(p.id)), (x) => x.stats.like) }}</td>
            <td class="num">{{ sum(published.filter((x) => x.platformIds.includes(p.id)), (x) => x.stats.fav) }}</td>
            <td class="num">{{ sum(published.filter((x) => x.platformIds.includes(p.id)), (x) => x.stats.comment) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.media-content-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.media-brief {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--muted);
}

.brief-item {
  min-width: 0;
}

.brief-label {
  margin-right: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink);
}

.topic-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.topic-desc {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--muted);
  white-space: pre-line;
}

.media-content-tools .btn {
  flex: none;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .media-content-head {
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  .media-content-head h2 {
    flex: none;
    white-space: nowrap;
  }

  .media-content-head .spacer {
    display: none;
  }

  .media-content-tools {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
  }

  .media-content-tools select {
    width: 100%;
    min-width: 0;
  }

  .media-content-tools .btn {
    padding: 0 10px;
  }
}
</style>