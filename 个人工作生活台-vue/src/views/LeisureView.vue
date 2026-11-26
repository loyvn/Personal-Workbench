<!--
  文件：src/views/LeisureView.vue
  说明：娱乐记录页。管理影剧番书游条目，支持在看进度、评分短评、状态流转与年度类型分布。
  结构：页头在看/年度完成/均分 → 条目列表 → 今年类型分布
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { nowISO, sum, uid } from '@/utils/misc'
import { todayStr } from '@/utils/date'
import type { Leisure, LeisureStatus } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()

const TYPE_LABEL: Record<Leisure['type'], string> = {
  movie: '电影',
  series: '剧集',
  anime: '动画',
  novel: '小说',
  shortdrama: '短剧',
  comicdrama: '漫剧',
  book: '书籍',
  game: '游戏'
}
const STATUS_LABEL: Record<LeisureStatus, string> = { want: '想看', watching: '在看', done: '看完', dropped: '弃了' }
const UNIT_LABEL: Record<Leisure['progressUnit'], string> = { ep: '集', chapter: '章', hour: '小时' }

const typeFilter = ref<'' | Leisure['type']>('')

const list = computed(() =>
  s.value.leisure
    .filter((x) => (typeFilter.value ? x.type === typeFilter.value : true))
    .slice()
    .sort((a, b) => {
      const rank: Record<LeisureStatus, number> = { watching: 0, want: 1, done: 2, dropped: 3 }
      return rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt)
    })
)

const counts = computed(() => ({
  want: s.value.leisure.filter((x) => x.status === 'want').length,
  watching: s.value.leisure.filter((x) => x.status === 'watching').length,
  done: s.value.leisure.filter((x) => x.status === 'done').length,
  dropped: s.value.leisure.filter((x) => x.status === 'dropped').length
}))

const yearDone = computed(() => s.value.leisure.filter((x) => x.status === 'done' && (x.finishedAt || '').slice(0, 4) === t.slice(0, 4)))
const totalMinutes = computed(() => sum(s.value.leisure, (x) => Number(x.minutes) || 0))
const totalDuration = computed(() => {
  if (totalMinutes.value >= 60) {
    return { value: (totalMinutes.value / 60).toFixed(1).replace(/\.0$/, ''), unit: '小时' }
  }
  return { value: String(totalMinutes.value), unit: '分钟' }
})
const avgRating = computed(() => {
  const rated = yearDone.value.filter((x) => x.rating > 0)
  return rated.length ? (sum(rated, (x) => x.rating) / rated.length).toFixed(1) : '—'
})
const typeBreakdown = computed(() =>
  (Object.keys(TYPE_LABEL) as Leisure['type'][]).map((k) => ({
    key: k,
    label: TYPE_LABEL[k],
    n: yearDone.value.filter((x) => x.type === k).length
  }))
)

function openItem(item?: Leisure) {
  ui.openForm({
    title: item ? '编辑记录' : '新增记录',
    fields: [
      { key: 'title', label: '名称' },
      {
        key: 'type',
        label: '类型',
        type: 'select',
        options: (Object.keys(TYPE_LABEL) as Leisure['type'][]).map((k) => ({ value: k, label: TYPE_LABEL[k] }))
      },
      {
        key: 'status',
        label: '状态',
        type: 'select',
        options: (Object.keys(STATUS_LABEL) as LeisureStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))
      },
      {
        key: 'progressUnit',
        label: '进度单位',
        type: 'select',
        options: [
          { value: 'ep', label: '集' },
          { value: 'chapter', label: '章' },
          { value: 'hour', label: '小时' }
        ]
      },
      { key: 'progress', label: '当前进度', type: 'number', min: 0 },
      { key: 'total', label: '总进度', type: 'number', min: 0 },
      { key: 'minutes', label: '累计时长（分钟）', type: 'number', min: 0 },
      { key: 'rating', label: '评分 1-5', type: 'number', min: 1, max: 5 },
      { key: 'review', label: '短评', type: 'textarea' }
    ],
    values: item
      ? {
          title: item.title,
          type: item.type,
          status: item.status,
          progressUnit: item.progressUnit,
          progress: item.progress,
          total: item.total,
          minutes: item.minutes || 0,
          rating: item.rating,
          review: item.review
        }
      : { title: '', type: 'movie', status: 'want', progressUnit: 'ep', progress: 0, total: 0, minutes: 0, rating: 0, review: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('名称不能为空', 'err')
        return false
      }
      const status = (v.status as LeisureStatus) || 'want'
      store.commit((st) => {
        const finishedAt = status === 'done' ? nowISO() : null
        if (item) {
          const x = st.leisure.find((o) => o.id === item.id)
          if (!x) return
          Object.assign(x, {
            title: String(v.title).trim(),
            type: v.type as Leisure['type'],
            status,
            progressUnit: v.progressUnit as Leisure['progressUnit'],
            progress: Number(v.progress) || 0,
            total: Number(v.total) || 0,
            minutes: Math.max(0, Number(v.minutes) || 0),
            rating: Number(v.rating) || 0,
            review: String(v.review || ''),
            finishedAt: status === 'done' ? x.finishedAt || finishedAt : null,
            updatedAt: nowISO()
          })
        } else {
          st.leisure.unshift({
            id: uid(),
            title: String(v.title).trim(),
            type: (v.type as Leisure['type']) || 'movie',
            status,
            progress: Number(v.progress) || 0,
            total: Number(v.total) || 0,
            minutes: Math.max(0, Number(v.minutes) || 0),
            rating: Number(v.rating) || 0,
            review: String(v.review || ''),
            progressUnit: (v.progressUnit as Leisure['progressUnit']) || 'ep',
            startedAt: nowISO(),
            finishedAt,
            updatedAt: nowISO()
          })
        }
      })
      ui.toast('已保存')
    }
  })
}

/**
 * 在看进度加一/减一，夹在 0–总量之间；到总量时提示可标记看完。
 */
function step(item: Leisure, delta: number) {
  store.commit((st) => {
    const x = st.leisure.find((o) => o.id === item.id)
    if (!x) return
    x.progress = Math.max(0, Math.min(x.total || 999, x.progress + delta))
    if (x.total && x.progress >= x.total && x.status !== 'done') {
      x.status = 'done'
      x.finishedAt = nowISO()
    }
    x.updatedAt = nowISO()
  })
}

/**
 * 标记看完并写完成日期，保留评分与短评。
 */
function finish(item: Leisure) {
  store.commit((st) => {
    const x = st.leisure.find((o) => o.id === item.id)
    if (!x) return
    x.status = 'done'
    x.progress = x.total || x.progress
    x.finishedAt = nowISO()
    x.updatedAt = nowISO()
  })
  ui.toast('已标记看完')
}

function drop(item: Leisure) {
  store.commit((st) => {
    const x = st.leisure.find((o) => o.id === item.id)
    if (x) {
      x.status = 'dropped'
      x.updatedAt = nowISO()
    }
  })
}

function reopen(item: Leisure) {
  store.commit((st) => {
    const x = st.leisure.find((o) => o.id === item.id)
    if (x) {
      x.status = 'watching'
      x.finishedAt = null
      x.updatedAt = nowISO()
    }
  })
}

function removeItem(item: Leisure) {
  ui.askConfirm({
    title: '删除记录',
    message: `「${item.title}」会删除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.leisure = st.leisure.filter((x) => x.id !== item.id)
      })
    }
  })
}

/**
 * 设置 1–5 星评分，再次点同一星可取消。
 */
function setRating(item: Leisure, n: number) {
  store.commit((st) => {
    const x = st.leisure.find((o) => o.id === item.id)
    if (x) {
      x.rating = n
      x.updatedAt = nowISO()
    }
  })
}

function fmtDuration(minutes: number) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} 分钟`
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

function logTime(item: Leisure) {
  ui.openForm({
    title: `记录时长 · ${item.title}`,
    fields: [{ key: 'minutes', label: '本次时长（分钟）', type: 'number', min: 1 }],
    values: { minutes: 30 },
    onSubmit(v) {
      const minutes = Math.round(Number(v.minutes) || 0)
      if (minutes <= 0) {
        ui.toast('时长要大于 0 分钟', 'err')
        return false
      }
      store.commit((st) => {
        const x = st.leisure.find((o) => o.id === item.id)
        if (!x) return
        x.minutes = (Number(x.minutes) || 0) + minutes
        if (x.status === 'want') x.status = 'watching'
        x.updatedAt = nowISO()
      })
      ui.toast(`已记录 ${fmtDuration(minutes)}`)
    }
  })
}

function pct(item: Leisure) {
  if (!item.total) return 0
  return Math.min(100, Math.round((item.progress / item.total) * 100))
}

function setType(v: string) {
  typeFilter.value = v as '' | Leisure['type']
}
</script>

<template>
  <PageHeader title="娱乐记录" :subtitle="`在看 ${counts.watching} · 今年看完 ${yearDone.length} · 均分 ${avgRating}`">
    <template #actions>
      <button class="btn btn-primary" @click="openItem()">+ 记一条</button>
    </template>
  </PageHeader>

  <div class="kpis leisure-kpis" style="margin-bottom: 16px">
    <div class="kpi">
      <div class="kv">{{ counts.watching }}</div>
      <div class="kl">在看</div>
      <div class="ks">想看 {{ counts.want }} · 弃 {{ counts.dropped }}</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ yearDone.length }}</div>
      <div class="kl">今年看完</div>
      <div class="ks">只统计状态为看完的</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ avgRating }}</div>
      <div class="kl">今年均分</div>
      <div class="ks">按 1–5 分打分</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ totalDuration.value }}<small>{{ totalDuration.unit }}</small></div>
      <div class="kl">累计时长</div>
      <div class="ks">{{ totalMinutes ? totalMinutes + ' 分钟' : '还没记录时长' }}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 16px">
    <div class="chips leisure-type-chips">
      <button class="chip" :class="{ on: typeFilter === '' }" @click="typeFilter = ''">全部</button>
      <button
        v-for="(lb, k) in TYPE_LABEL"
        :key="k"
        class="chip"
        :class="{ on: typeFilter === k }"
        @click="setType(String(k))"
      >
        {{ lb }}
      </button>
    </div>
  </div>

  <section class="sect">
    <div class="sect-h"><h2>列表</h2><span class="cnt">{{ list.length }}</span></div>
    <div v-if="list.length" class="rows">
      <div v-for="x in list" :key="x.id" class="card card-tight" style="margin-bottom: 9px">
        <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start">
          <div style="min-width: 0; flex: 1">
            <div style="display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap">
              <span style="font-size: 14px; font-weight: 700">{{ x.title }}</span>
              <span class="tag soft">{{ TYPE_LABEL[x.type] }}</span>
              <span class="tag" :class="x.status === 'done' ? 'ok' : x.status === 'watching' ? 'amber' : ''">{{ STATUS_LABEL[x.status] }}</span>
            </div>
            <div v-if="x.status !== 'want' && x.status !== 'dropped'" style="margin-top: 7px">
              <div class="pbar"><i :style="{ width: pct(x) + '%' }" /></div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 3px">
                <span>{{ x.progress }}{{ x.total ? ' / ' + x.total : '' }} {{ UNIT_LABEL[x.progressUnit] }}</span>
                <span>{{ pct(x) }}%</span>
              </div>
            </div>
            <div class="leisure-duration">
              <span>{{ x.minutes ? '累计 ' + fmtDuration(x.minutes) : '时长未记录' }}</span>
              <button class="mini" @click="logTime(x)">记时长</button>
            </div>
            <div v-if="x.review" style="font-size: 12px; color: var(--muted); margin-top: 6px">{{ x.review }}</div>
            <div style="display: flex; gap: 3px; margin-top: 7px; align-items: center">
              <button
                v-for="n in 5"
                :key="n"
                class="mini"
                :class="{ primary: x.rating >= n }"
                style="min-width: 24px; padding: 0 5px"
                @click="setRating(x, n)"
              >
                {{ n }}
              </button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; flex: none">
            <button v-if="x.status === 'watching'" class="mini" @click="step(x, 1)">+1</button>
            <button v-if="x.status !== 'done' && x.status !== 'dropped'" class="mini" @click="finish(x)">看完</button>
            <button v-if="x.status === 'done'" class="mini" @click="reopen(x)">再看</button>
            <button v-if="x.status !== 'dropped'" class="mini" @click="drop(x)">弃</button>
            <button class="mini" @click="openItem(x)">改</button>
            <button class="mini danger" @click="removeItem(x)">删</button>
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-else title="还没有记录" desc="看完什么、弃了什么，都是对自己的了解" action="记一条" @action="openItem()" />
  </section>

  <section class="sect">
    <div class="sect-h"><h2>今年分布</h2><span class="cnt">按类型</span></div>
    <div class="card">
      <div v-for="b in typeBreakdown" :key="b.key" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
        <span style="width: 40px; font-size: 12px">{{ b.label }}</span>
        <div style="flex: 1; height: 8px; background: var(--line-soft); border-radius: 1px; overflow: hidden">
          <i
            :style="{
              display: 'block',
              height: '100%',
              width: (yearDone.length ? (b.n / yearDone.length) * 100 : 0) + '%',
              background: 'var(--green)'
            }"
          />
        </div>
        <span style="font-family: var(--mono); font-size: 11.5px; width: 22px; text-align: right">{{ b.n }}</span>
      </div>
      <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px">看完的越多，越能看清自己真正喜欢什么</div>
    </div>
  </section>
</template>

<style scoped>
.leisure-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.leisure-kpis .kv small {
  margin-left: 4px;
}
@media (min-width: 980px) {
  .leisure-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.leisure-type-chips .chip {
  min-height: 32px;
  padding: 5px 11px;
  border-radius: var(--r-sm);
}
.leisure-duration {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--muted);
}
.leisure-duration .mini {
  min-height: 30px;
  padding: 0 10px;
  border-radius: var(--r-xs);
}
</style>