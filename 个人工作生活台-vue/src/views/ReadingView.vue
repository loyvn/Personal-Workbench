<!--
  文件：src/views/ReadingView.vue
  说明：阅读页。管理书单、阅读记录、在读进度、月度时长与年度读完统计。
  结构：页头在读/本月时长/年度读完 → 书单 → 阅读记录
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { nowISO, sum, uid, clamp } from '@/utils/misc'
import { mmdd, todayStr } from '@/utils/date'
import type { Book, ReadingLog, ReadingStatus } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()

const STATUS_LABEL: Record<ReadingStatus, string> = {
  want: '想读',
  reading: '在读',
  done: '读完',
  paused: '暂停',
  dropped: '弃读'
}
const STATUS_RANK: Record<ReadingStatus, number> = { reading: 0, want: 1, paused: 2, done: 3, dropped: 4 }
const STATUS_TONE: Record<ReadingStatus, string> = {
  want: '',
  reading: 'amber',
  done: 'ok',
  paused: '',
  dropped: 'red'
}
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ReadingStatus[]).map((k) => ({
  value: k,
  label: STATUS_LABEL[k]
}))

const statusFilter = ref<'all' | ReadingStatus>('all')
const query = ref('')

const books = computed(() => s.value.reading.books.slice())
const counts = computed(() => ({
  want: books.value.filter((b) => b.status === 'want').length,
  reading: books.value.filter((b) => b.status === 'reading').length,
  done: books.value.filter((b) => b.status === 'done').length,
  paused: books.value.filter((b) => b.status === 'paused').length,
  dropped: books.value.filter((b) => b.status === 'dropped').length
}))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return books.value
    .filter((b) => (statusFilter.value === 'all' ? true : b.status === statusFilter.value))
    .filter((b) => (q ? [b.title, b.author, b.category, b.review].some((x) => (x || '').toLowerCase().includes(q)) : true))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt.localeCompare(a.updatedAt))
})

const monthLogs = computed(() => s.value.reading.logs.filter((l) => l.date.slice(0, 7) === t.slice(0, 7)))
const monthMinutes = computed(() => sum(monthLogs.value, (l) => Number(l.minutes) || 0))
const readingDays = computed(() => new Set(monthLogs.value.map((l) => l.date)).size)
const monthDuration = computed(() => {
  if (monthMinutes.value >= 60) return { value: (monthMinutes.value / 60).toFixed(1).replace(/\.0$/, ''), unit: '小时' }
  return { value: String(monthMinutes.value), unit: '分钟' }
})
const yearDone = computed(() =>
  books.value.filter((b) => b.status === 'done' && (b.finishedAt || b.createdAt || '').slice(0, 4) === t.slice(0, 4))
)
const avgRating = computed(() => {
  const rated = yearDone.value.filter((b) => b.rating > 0)
  return rated.length ? (sum(rated, (b) => b.rating) / rated.length).toFixed(1) : '—'
})
const recentLogs = computed(() =>
  s.value.reading.logs
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
)
const loggableBooks = computed(() => books.value.filter((b) => b.status === 'want' || b.status === 'reading' || b.status === 'paused'))

function fmtDuration(minutes: number) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} 分钟`
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`
}

function pct(book: Book) {
  if (!book.totalPages) return 0
  return Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
}

/**
 * 按 bookId 汇总阅读次数、页数与分钟，供书单卡片展示。
 */
function bookLogStats(bookId: string) {
  const list = s.value.reading.logs.filter((l) => l.bookId === bookId)
  return { n: list.length, minutes: sum(list, (l) => Number(l.minutes) || 0) }
}

function bookTitle(bookId: string) {
  return books.value.find((b) => b.id === bookId)?.title || '已删除的书籍'
}

function openBook(book?: Book) {
  ui.openForm({
    title: book ? '编辑书籍' : '添加书籍',
    fields: [
      { key: 'title', label: '书名', placeholder: '例如：人类简史' },
      { key: 'author', label: '作者', placeholder: '例如：尤瓦尔·赫拉利' },
      { key: 'category', label: '分类', placeholder: '文学 / 工具 / 专业 / 传记' },
      { key: 'totalPages', label: '总页数', type: 'number', min: 0 },
      { key: 'currentPage', label: '当前页', type: 'number', min: 0 },
      { key: 'status', label: '阅读状态', type: 'select', options: STATUS_OPTIONS },
      { key: 'rating', label: '评分 0–5', type: 'number', min: 0, max: 5 },
      { key: 'review', label: '短评 / 读书笔记', type: 'textarea', placeholder: '读完后最想留下的一句话' }
    ],
    values: book
      ? {
          title: book.title,
          author: book.author,
          category: book.category,
          totalPages: book.totalPages,
          currentPage: book.currentPage,
          status: book.status,
          rating: book.rating,
          review: book.review
        }
      : {
          title: '',
          author: '',
          category: '',
          totalPages: 0,
          currentPage: 0,
          status: 'want',
          rating: 0,
          review: ''
        },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('书名不能为空', 'err')
        return false
      }
      const totalPages = Math.max(0, Math.round(Number(v.totalPages) || 0))
      let currentPage = Math.max(0, Math.round(Number(v.currentPage) || 0))
      if (totalPages) currentPage = clamp(currentPage, 0, totalPages)
      let status = (v.status as ReadingStatus) || 'want'
      if (status === 'done' && totalPages) currentPage = totalPages
      if (totalPages && currentPage >= totalPages && status !== 'dropped') status = 'done'
      const rating = clamp(Math.round(Number(v.rating) || 0), 0, 5)
      const review = String(v.review || '').trim()
      store.commit((st) => {
        if (book) {
          const x = st.reading.books.find((b) => b.id === book.id)
          if (!x) return
          Object.assign(x, {
            title: String(v.title).trim(),
            author: String(v.author || '').trim(),
            category: String(v.category || '').trim(),
            totalPages,
            currentPage,
            status,
            rating,
            review,
            startedAt: status === 'want' ? null : x.startedAt || nowISO(),
            finishedAt: status === 'done' ? x.finishedAt || nowISO() : null,
            updatedAt: nowISO()
          })
        } else {
          st.reading.books.unshift({
            id: uid(),
            title: String(v.title).trim(),
            author: String(v.author || '').trim(),
            category: String(v.category || '').trim(),
            totalPages,
            currentPage,
            status,
            rating,
            review,
            startedAt: status === 'want' ? null : nowISO(),
            finishedAt: status === 'done' ? nowISO() : null,
            createdAt: nowISO(),
            updatedAt: nowISO()
          })
        }
      })
      ui.toast(book ? '已保存' : '已加入书单')
    }
  })
}

/**
 * 记录一次阅读：选择书籍、页码与时长，写完自动累计进度。
 */
function openLog(book?: Book) {
  if (!loggableBooks.value.length) {
    ui.toast('先添加一本想读或在读的书', 'err')
    return
  }
  const selected = book && loggableBooks.value.some((b) => b.id === book.id) ? book : loggableBooks.value[0]
  ui.openForm({
    title: '记一笔阅读',
    fields: [
      {
        key: 'bookId',
        label: '书籍',
        type: 'select',
        options: loggableBooks.value.map((b) => ({ value: b.id, label: `${b.title}${b.author ? ` · ${b.author}` : ''}` }))
      },
      { key: 'date', label: '阅读日期', type: 'date' },
      { key: 'minutes', label: '本次时长（分钟）', type: 'number', min: 0 },
      { key: 'pages', label: '本次页数', type: 'number', min: 0 },
      { key: 'note', label: '这次读到什么', type: 'textarea', placeholder: '一句印象、一个疑问，或者页码' }
    ],
    values: { bookId: selected.id, date: t, minutes: 30, pages: 0, note: '' },
    onSubmit(v) {
      const bookId = String(v.bookId || '')
      const target = s.value.reading.books.find((b) => b.id === bookId)
      if (!target) {
        ui.toast('这本书不在书单里', 'err')
        return false
      }
      if (target.status === 'done' || target.status === 'dropped') {
        ui.toast('这本书已经结束，请先点“重读”', 'err')
        return false
      }
      const minutes = Math.max(0, Math.round(Number(v.minutes) || 0))
      const pages = Math.max(0, Math.round(Number(v.pages) || 0))
      if (!minutes && !pages) {
        ui.toast('时长和页数至少填一项', 'err')
        return false
      }
      const date = String(v.date || t)
      const note = String(v.note || '').trim()
      store.commit((st) => {
        const x = st.reading.books.find((b) => b.id === bookId)
        if (!x) return
        const log: ReadingLog = { id: uid(), bookId, date, minutes, pages, note, createdAt: nowISO() }
        st.reading.logs.unshift(log)
        if (pages) {
          const next = x.currentPage + pages
          x.currentPage = x.totalPages ? Math.min(x.totalPages, next) : next
        }
        if (x.status === 'want' || x.status === 'paused') x.status = 'reading'
        if (!x.startedAt) x.startedAt = nowISO()
        if (x.totalPages && x.currentPage >= x.totalPages) {
          x.status = 'done'
          x.finishedAt = x.finishedAt || nowISO()
        }
        x.updatedAt = nowISO()
      })
      ui.toast(`已记录${minutes ? ` ${fmtDuration(minutes)}` : ''}${pages ? ` ${pages} 页` : ''}`)
    }
  })
}

/**
 * 切换想读/在读/读完/弃读；读完时写完成日期，重开时清空。
 */
function setStatus(book: Book, status: ReadingStatus) {
  store.commit((st) => {
    const x = st.reading.books.find((b) => b.id === book.id)
    if (!x) return
    const prev = x.status
    x.status = status
    if (status === 'reading') {
      if (prev === 'done') x.currentPage = 0
      x.finishedAt = null
      x.startedAt = x.startedAt || nowISO()
    }
    if (status === 'done') {
      if (x.totalPages) x.currentPage = x.totalPages
      x.finishedAt = x.finishedAt || nowISO()
    }
    x.updatedAt = nowISO()
  })
}

function removeBook(book: Book) {
  const n = s.value.reading.logs.filter((l) => l.bookId === book.id).length
  ui.askConfirm({
    title: '删除书籍',
    message: `「${book.title}」和它的 ${n} 条阅读记录都会删除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.reading.books = st.reading.books.filter((b) => b.id !== book.id)
        st.reading.logs = st.reading.logs.filter((l) => l.bookId !== book.id)
      })
      ui.toast('已删除')
    }
  })
}

function removeLog(log: ReadingLog) {
  ui.askConfirm({
    title: '删除这条阅读记录',
    message: '只删除记录，不回退书籍的页码进度。',
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.reading.logs = st.reading.logs.filter((l) => l.id !== log.id)
      })
      ui.toast('已删除记录')
    }
  })
}

function setRating(book: Book, n: number) {
  store.commit((st) => {
    const x = st.reading.books.find((b) => b.id === book.id)
    if (!x) return
    x.rating = n
    x.updatedAt = nowISO()
  })
}
</script>

<template>
  <PageHeader
    title="阅读"
    :subtitle="`在读 ${counts.reading} 本 · 本月 ${monthDuration.value}${monthDuration.unit} · 今年读完 ${yearDone.length} 本`"
  >
    <template #actions>
      <button class="btn btn-sm" @click="openLog()">+ 记一笔</button>
      <button class="btn btn-primary" @click="openBook()">+ 添加书籍</button>
    </template>
  </PageHeader>

  <div class="kpis reading-kpis" style="margin-bottom: 16px">
    <div class="kpi">
      <div class="kv">{{ counts.reading }}</div>
      <div class="kl">在读</div>
      <div class="ks">想读 {{ counts.want }} 本</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ monthDuration.value }}<small>{{ monthDuration.unit }}</small></div>
      <div class="kl">本月时长</div>
      <div class="ks">{{ readingDays }} 天有记录</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ yearDone.length }}</div>
      <div class="kl">今年读完</div>
      <div class="ks">均分 {{ avgRating }}</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ books.length }}</div>
      <div class="kl">书单总数</div>
      <div class="ks">暂停 {{ counts.paused }} · 弃读 {{ counts.dropped }}</div>
    </div>
  </div>

  <div class="card reading-toolbar">
    <div class="chips reading-status-chips">
      <button class="chip" :class="{ on: statusFilter === 'all' }" @click="statusFilter = 'all'">全部</button>
      <button
        v-for="(label, key) in STATUS_LABEL"
        :key="key"
        class="chip"
        :class="{ on: statusFilter === key }"
        @click="statusFilter = key"
      >
        {{ label }}
      </button>
    </div>
    <input v-model="query" class="reading-search" type="search" placeholder="搜索书名、作者、分类或笔记" />
  </div>

  <section class="sect">
    <div class="sect-h"><h2>书单</h2><span class="cnt">{{ filtered.length }}/{{ books.length }}</span><div class="spacer" /><button class="mini" @click="openBook()">+ 加一本</button></div>
    <div v-if="filtered.length" class="reading-books">
      <div v-for="b in filtered" :key="b.id" class="card card-tight reading-book">
        <div class="rb-head">
          <div class="rb-title-wrap">
            <div class="rb-title-line">
              <span class="rb-title">{{ b.title }}</span>
              <span class="tag" :class="STATUS_TONE[b.status]">{{ STATUS_LABEL[b.status] }}</span>
            </div>
            <div class="rb-meta">
              <span>{{ b.author || '作者未填' }}</span>
              <span v-if="b.category">{{ b.category }}</span>
              <span>{{ fmtDuration(bookLogStats(b.id).minutes) }} · {{ bookLogStats(b.id).n }} 次</span>
            </div>
          </div>
          <div class="rb-actions">
            <button v-if="b.status !== 'done' && b.status !== 'dropped'" class="mini primary" @click="openLog(b)">记一笔</button>
            <button class="mini" @click="openBook(b)">改</button>
            <button class="mini danger" @click="removeBook(b)">删</button>
          </div>
        </div>

        <div v-if="b.status !== 'want'" class="rb-progress">
          <div class="pbar"><i :style="{ width: pct(b) + '%' }" /></div>
          <div class="rb-progress-meta">
            <span>{{ b.currentPage }}{{ b.totalPages ? ` / ${b.totalPages}` : '' }} 页</span>
            <span>{{ b.totalPages ? pct(b) + '%' : '未设总页数' }}</span>
          </div>
        </div>

        <div class="rb-foot">
          <div class="rb-rating" aria-label="评分">
            <span>评分</span>
            <button v-for="n in 5" :key="n" class="mini" :class="{ primary: b.rating >= n }" @click="setRating(b, n)">{{ n }}</button>
          </div>
          <button v-if="b.status === 'reading' || b.status === 'paused'" class="mini" @click="setStatus(b, 'done')">标记读完</button>
          <button v-if="b.status === 'done' || b.status === 'dropped'" class="mini" @click="setStatus(b, 'reading')">重读</button>
          <button v-if="b.status === 'reading'" class="mini" @click="setStatus(b, 'paused')">暂停</button>
          <span v-if="b.finishedAt" class="rb-date">读完于 {{ mmdd(b.finishedAt.slice(0, 10)) }}</span>
        </div>

        <div v-if="b.review" class="rb-review">{{ b.review }}</div>
      </div>
    </div>
    <EmptyState v-else title="书单还是空的" desc="先放进一本想读的书，之后每次阅读都能留下页数和时长" action="添加书籍" @action="openBook()" />
  </section>

  <section class="sect">
    <div class="sect-h"><h2>阅读记录</h2><span class="cnt">{{ s.reading.logs.length }} 条</span><div class="spacer" /><button class="mini" @click="openLog()">+ 记一笔</button></div>
    <div v-if="recentLogs.length" class="card flush">
      <div v-for="l in recentLogs" :key="l.id" class="reading-log">
        <span class="rl-date">{{ mmdd(l.date) }}</span>
        <div class="rl-main">
          <div class="rl-title">{{ bookTitle(l.bookId) }}</div>
          <div v-if="l.note" class="rl-note">{{ l.note }}</div>
        </div>
        <div class="rl-num">
          <span v-if="l.minutes">{{ fmtDuration(l.minutes) }}</span>
          <span v-if="l.pages">{{ l.pages }} 页</span>
        </div>
        <button class="mini danger rl-del" @click="removeLog(l)">删</button>
      </div>
      <div v-if="s.reading.logs.length > recentLogs.length" class="reading-log-more">只显示最近 20 条</div>
    </div>
    <div v-else class="card">
      <div class="reading-log-empty">还没有阅读记录。记一笔会同步推进书籍页码，读满后自动标记读完。</div>
    </div>
  </section>
</template>

<style scoped>
.reading-kpis {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.reading-kpis .kv small {
  margin-left: 4px;
}

@media (min-width: 980px) {
  .reading-kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.reading-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.reading-status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.reading-status-chips .chip {
  min-height: 32px;
  padding: 5px 11px;
  border-radius: var(--r-sm);
}

.reading-search {
  width: min(260px, 100%);
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink);
  font-size: 12.5px;
  outline: none;
}

.reading-search:focus {
  border-color: var(--green);
}

.reading-books {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.reading-book {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.rb-title-wrap {
  min-width: 0;
  flex: 1;
}

.rb-title-line {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.rb-title {
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.4;
  word-break: break-word;
}

.rb-meta {
  display: flex;
  gap: 4px 10px;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.5;
}

.rb-actions {
  display: flex;
  gap: 4px;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.rb-actions .mini {
  min-height: 30px;
  padding: 0 10px;
  border-radius: var(--r-xs);
}

.rb-progress {
  margin-top: 1px;
}

.rb-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--mono);
}

.rb-foot {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}

.rb-rating {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
}

.rb-rating .mini {
  min-width: 24px;
  min-height: 26px;
  padding: 0 5px;
}

.rb-date {
  font-size: 11px;
  color: var(--muted);
}

.rb-review {
  padding-top: 7px;
  border-top: 1px solid var(--line-soft);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.reading-log {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto 34px;
  align-items: center;
  gap: 9px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--line-soft);
}

.reading-log:last-child {
  border-bottom: 0;
}

.rl-date {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.rl-main {
  min-width: 0;
}

.rl-title {
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.rl-note {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rl-num {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--mono);
  white-space: nowrap;
}

.rl-del {
  min-width: 30px;
  min-height: 28px;
  padding: 0 6px;
}

.reading-log-more {
  padding: 8px 14px;
  font-size: 11px;
  color: var(--muted);
  text-align: center;
}

.reading-log-empty {
  padding: 4px 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--muted);
}

@media (max-width: 560px) {
  .reading-search {
    width: 100%;
  }

  .rb-actions {
    gap: 3px;
  }

  .rb-actions .mini {
    padding: 0 8px;
  }

  .reading-log {
    grid-template-columns: 38px minmax(0, 1fr) auto 30px;
    gap: 7px;
    padding: 9px 11px;
  }

  .rl-num {
    font-size: 10.5px;
  }
}
</style>