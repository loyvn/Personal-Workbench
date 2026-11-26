<!--
  文件：src/views/TasksView.vue
  说明：待办与计划页。提供任务 CRUD、今日/本周/全部视图、领域筛选、完成状态、阶段目标与未来七天到期列表。
  结构：页头统计 → 今日/本周/全部视图与领域筛选 → 任务列表 → 阶段目标 → 未来七天到期
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { FormField } from '@/stores/ui'
import { todayStr, weekRange, relDay, shiftYMD, ymd, mmdd } from '@/utils/date'
import { nowISO, uid, domainLabel, TASK_DOMAIN_OPTIONS } from '@/utils/misc'
import type { Goal, Task, TaskDomain } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const s = computed(() => store.data)
const today = todayStr()
type TimeView = 'all' | 'today' | 'week' | 'month' | 'custom'
const initialDate = String(route.query.date || '')
const initialTo = String(route.query.to || '')
const view = ref<TimeView>(initialDate ? 'custom' : 'today')
const customStart = ref(initialDate)
const customEnd = ref(initialTo || initialDate)
const domain = ref<'all' | TaskDomain>('all')
const TIME_FILTERS: Array<{ value: Exclude<TimeView, 'custom'>; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' }
]
const DOMAIN_FILTERS: Array<{ value: 'all' | TaskDomain; label: string }> = [
  { value: 'all', label: '全部' },
  ...TASK_DOMAIN_OPTIONS
]

/**
 * 计算当前月视图的起止日期，供本月筛选和未来七天列表复用。
 */
function monthRange(): { start: string; end: string } {
  const now = new Date()
  return {
    start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }
}

const filtered = computed(() => {
  const { start, end } = view.value === 'week' ? weekRange() : view.value === 'month' ? monthRange() : { start: '', end: '' }
  let list = s.value.tasks.slice()
  if (view.value === 'today') list = list.filter((t) => !t.done && t.dueDate && t.dueDate <= today)
  else if (view.value === 'week' || view.value === 'month') list = list.filter((t) => t.dueDate >= start && t.dueDate <= end)
  else if (view.value === 'custom' && (customStart.value || customEnd.value)) {
    const from = customStart.value || customEnd.value
    const to = customEnd.value || customStart.value
    list = list.filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to)
  }
  if (domain.value !== 'all') list = list.filter((t) => t.domain === domain.value)
  return list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const ao = a.dueDate && a.dueDate < today ? 0 : 1
    const bo = b.dueDate && b.dueDate < today ? 0 : 1
    if (ao !== bo) return ao - bo
    const w: Record<string, number> = { high: 0, mid: 1, low: 2 }
    if (a.priority !== b.priority) return w[a.priority] - w[b.priority]
    return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1
  })
})

const customRangeLabel = computed(() => {
  if (view.value !== 'custom' || !customStart.value) return ''
  const from = mmdd(customStart.value)
  const to = mmdd(customEnd.value || customStart.value)
  return from === to ? `筛选 ${from}` : `筛选 ${from}–${to}`
})

const openCount = computed(() => s.value.tasks.filter((t) => !t.done).length)
const dueTodayCount = computed(() => s.value.tasks.filter((t) => !t.done && t.dueDate === today).length)

const filteredGoals = computed(() =>
  domain.value === 'all'
    ? s.value.goals
    : s.value.goals.filter((g) => (g.domain || 'dev') === domain.value)
)

const taskFields: FormField[] = [
  { key: 'title', label: '任务', placeholder: '要做什么' },
  { key: 'dueDate', label: '截止日期', type: 'date' },
  {
    key: 'domain',
    label: '分类',
    type: 'select',
    options: TASK_DOMAIN_OPTIONS
  },
  {
    key: 'priority',
    label: '优先级',
    type: 'select',
    options: [
      { value: 'mid', label: '普通' },
      { value: 'high', label: '优先' },
      { value: 'low', label: '随手' }
    ]
  },
  { key: 'note', label: '备注', type: 'textarea' }
]

/**
 * 打开任务表单；新建与编辑共用同一套字段，提交后按 id 更新或插入。
 */
function openTask(task?: Task) {
  ui.openForm({
    title: task ? '编辑任务' : '新建任务',
    fields: taskFields,
    values: task
      ? {
          title: task.title,
          dueDate: task.dueDate,
          domain: task.domain,
          priority: task.priority,
          note: task.note
        }
      : { title: '', dueDate: view.value === 'custom' ? customStart.value || today : today, domain: 'dev', priority: 'mid', note: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('任务名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        if (task) {
          const t = st.tasks.find((x) => x.id === task.id)
          if (!t) return
          Object.assign(t, {
            title: String(v.title).trim(),
            dueDate: String(v.dueDate || ''),
            domain: v.domain as TaskDomain,
            priority: v.priority as Task['priority'],
            note: String(v.note || ''),
            updatedAt: nowISO()
          })
        } else {
          st.tasks.unshift({
            id: uid(),
            title: String(v.title).trim(),
            note: String(v.note || ''),
            dueDate: String(v.dueDate || today),
            domain: (v.domain as TaskDomain) || 'dev',
            priority: (v.priority as Task['priority']) || 'mid',
            done: false,
            doneAt: null,
            createdAt: nowISO(),
            updatedAt: nowISO()
          })
        }
      })
      ui.toast(task ? '已保存' : '已新增')
    }
  })
}

/**
 * 消费 ?new=1 查询参数，保证从首页进入时只自动弹一次新建框。
 */
function consumeNewTaskQuery() {
  if (String(route.query.new || '') !== '1') return
  openTask()
  const query: Record<string, string> = {}
  if (customStart.value) query.date = customStart.value
  if (customEnd.value && customEnd.value !== customStart.value) query.to = customEnd.value
  void router.replace({ path: '/tasks', query })
}

function setView(v: Exclude<TimeView, 'custom'>) {
  view.value = v
  customStart.value = ''
  customEnd.value = ''
  if (route.query.date || route.query.to) void router.replace('/tasks')
}

function clearDate() {
  customStart.value = ''
  customEnd.value = ''
  view.value = 'today'
  void router.replace('/tasks')
}

function openDateFilter() {
  ui.openForm({
    title: '筛选日期',
    fields: [
      { key: 'start', label: '开始日期', type: 'date' },
      { key: 'end', label: '结束日期', type: 'date' }
    ],
    values: {
      start: customStart.value || today,
      end: customEnd.value || customStart.value || today
    },
    onSubmit(v) {
      let from = String(v.start || '')
      let to = String(v.end || '')
      if (!from && !to) {
        ui.toast('至少选择一个日期', 'err')
        return false
      }
      if (!from) from = to
      if (!to) to = from
      if (to < from) [from, to] = [to, from]
      view.value = 'custom'
      customStart.value = from
      customEnd.value = to
      void router.replace({ path: '/tasks', query: from === to ? { date: from } : { date: from, to } })
      ui.toast(from === to ? `已筛选 ${from}` : `已筛选 ${from} 至 ${to}`)
    }
  })
}

onMounted(consumeNewTaskQuery)
watch(
  () => route.query.new,
  (v) => {
    if (v === '1') consumeNewTaskQuery()
  }
)
watch(
  () => `${route.query.date || ''}|${route.query.to || ''}`,
  (key) => {
    const [from, to] = key.split('|')
    if (!from) return
    customStart.value = from
    customEnd.value = to || from
    view.value = 'custom'
  }
)

/**
 * 完成任务或撤销完成；完成写 doneAt，撤销清空，番茄数仍由记录派生。
 */
function toggleTask(id: string) {
  store.commit((st) => {
    const t = st.tasks.find((x) => x.id === id)
    if (!t) return
    t.done = !t.done
    t.doneAt = t.done ? nowISO() : null
    t.updatedAt = nowISO()
  })
}

function removeTask(task: Task) {
  ui.askConfirm({
    title: '删除任务',
    message: '删除后不可恢复，历史番茄记录会保留但显示为已删除任务。',
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.tasks = st.tasks.filter((x) => x.id !== task.id)
      })
      ui.toast('已删除')
    }
  })
}

/**
 * 打开阶段目标表单，关键结果以多行文本录入后拆成可勾选项。
 */
function openGoal(goal?: Goal) {
  ui.openForm({
    title: goal ? '编辑阶段目标' : '新建阶段目标',
    fields: [
      { key: 'title', label: '目标', placeholder: '例如：三个月内跑通第一支 AI 短片' },
      {
        key: 'domain',
        label: '分类',
        type: 'select',
        options: TASK_DOMAIN_OPTIONS
      },
      { key: 'dueDate', label: '截止日期', type: 'date' },
      { key: 'progress', label: '进度 %', type: 'number', min: 0, max: 100 },
      { key: 'kr', label: '关键结果（每行一条）', type: 'textarea' }
    ],
    values: goal
      ? { title: goal.title, domain: goal.domain || 'dev', dueDate: goal.dueDate, progress: goal.progress, kr: goal.keyResults.map((k) => k.text).join('\n') }
      : { title: '', domain: 'dev', dueDate: '', progress: 0, kr: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('目标名称不能为空', 'err')
        return false
      }
      const titles = String(v.kr || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
      store.commit((st) => {
        if (goal) {
          const g = st.goals.find((x) => x.id === goal.id)
          if (!g) return
          g.title = String(v.title).trim()
          g.domain = (v.domain as TaskDomain) || 'dev'
          g.dueDate = String(v.dueDate || '')
          g.progress = Math.max(0, Math.min(100, Number(v.progress) || 0))
          const old = new Map(g.keyResults.map((k) => [k.text, k]))
          g.keyResults = titles.map((text) => {
            const prev = old.get(text)
            return prev ? { ...prev, text } : { id: uid(), text, done: false }
          })
          g.updatedAt = nowISO()
        } else {
          st.goals.unshift({
            id: uid(),
            title: String(v.title).trim(),
            domain: (v.domain as TaskDomain) || 'dev',
            dueDate: String(v.dueDate || ''),
            progress: Math.max(0, Math.min(100, Number(v.progress) || 0)),
            note: '',
            keyResults: titles.map((text) => ({ id: uid(), text, done: false })),
            updatedAt: nowISO()
          })
        }
      })
      ui.toast(goal ? '已保存' : '已新增目标')
    }
  })
}

function setProgress(goal: Goal, value: string) {
  const p = Math.max(0, Math.min(100, Number(value) || 0))
  store.commit((st) => {
    const g = st.goals.find((x) => x.id === goal.id)
    if (g) {
      g.progress = p
      g.updatedAt = nowISO()
    }
  })
}

/**
 * 勾选关键结果并按完成比例回写目标 progress，避免手动两处维护。
 */
function toggleKr(goalId: string, krId: string) {
  store.commit((st) => {
    const g = st.goals.find((x) => x.id === goalId)
    const kr = g?.keyResults.find((k) => k.id === krId)
    if (g && kr) {
      kr.done = !kr.done
      g.updatedAt = nowISO()
    }
  })
}

function removeGoal(goal: Goal) {
  ui.askConfirm({
    title: '删除目标',
    message: '该目标及其关键结果会一并删除。',
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.goals = st.goals.filter((g) => g.id !== goal.id)
      })
    }
  })
}
</script>

<template>
  <PageHeader title="待办与计划" :subtitle="`未完成 ${openCount} 条 · 今日到期 ${dueTodayCount} 条`">
    <template #actions>
      <button class="btn btn-primary" @click="openTask()">+ 新建任务</button>
    </template>
  </PageHeader>

  <div class="task-filter-bar">
    <div class="task-filter-main">
      <div class="seg">
        <button
          v-for="item in TIME_FILTERS"
          :key="item.value"
          :class="{ on: view === item.value }"
          @click="setView(item.value)"
        >
          {{ item.label }}
        </button>
        <button :class="{ on: view === 'custom' }" @click="openDateFilter">筛选</button>
      </div>
      <span v-if="customRangeLabel" class="tag amber">
        {{ customRangeLabel }}
        <button class="mini" style="margin-left: 4px" @click="clearDate">清除</button>
      </span>
    </div>
    <div class="chips task-domain-chips">
      <button
        v-for="d in DOMAIN_FILTERS"
        :key="d.value"
        class="chip"
        :class="{ on: domain === d.value }"
        @click="domain = d.value"
      >
        {{ d.label }}
      </button>
    </div>
  </div>

  <section class="sect">
    <div class="sect-h">
      <h2>任务</h2>
      <span class="cnt">{{ filtered.length }}</span>
    </div>
    <div v-if="filtered.length" class="card flush">
      <div class="rows">
        <div
          v-for="t in filtered"
          :key="t.id"
          class="row"
          :class="{ overdue: !t.done && t.dueDate && t.dueDate < today }"
        >
          <button class="cb" :class="{ on: t.done }" @click="toggleTask(t.id)">{{ t.done ? '✓' : '' }}</button>
          <div class="body">
            <div class="title" :class="{ done: t.done }">{{ t.title }}</div>
            <div class="meta">
              <span>{{ t.dueDate ? relDay(t.dueDate) : '未排期' }}</span>
              <span class="tag">{{ domainLabel(t.domain) }}</span>
              <span v-if="t.priority === 'high'" class="tag red">优先</span>
              <span v-if="!t.done && t.dueDate && t.dueDate < today" class="tag red">
                逾期 {{ Math.round((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000) }} 天
              </span>
            </div>
          </div>
          <div class="acts">
            <button class="mini" @click="openTask(t)">编辑</button>
            <button class="mini danger" @click="removeTask(t)">删</button>
          </div>
        </div>
      </div>
    </div>
    <EmptyState v-else title="这里还没有任务" desc="新建一条开始推进" action="新建任务" @action="openTask()" />
  </section>

  <section class="sect">
    <div class="sect-h">
      <h2>阶段目标</h2>
      <span class="cnt">{{ filteredGoals.length }}</span>
      <div class="spacer" />
      <button class="mini" @click="openGoal()">+ 新建目标</button>
    </div>
    <div
      v-if="filteredGoals.length"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(248px, 1fr)); gap: 10px"
    >
      <div v-for="g in filteredGoals" :key="g.id" class="card">
        <div style="display: flex; justify-content: space-between; gap: 8px; align-items: flex-start">
          <div class="goal-title-line">
            <span class="goal-title">{{ g.title }}</span>
            <span class="tag">{{ domainLabel(g.domain || 'dev') }}</span>
          </div>
          <div style="display: flex; gap: 4px">
            <button class="mini" @click="openGoal(g)">改</button>
            <button class="mini danger" @click="removeGoal(g)">删</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin: 9px 0 2px">
          <div style="flex: 1; height: 4px; background: var(--line); border-radius: var(--r-xs); overflow: hidden">
            <div :style="{ width: g.progress + '%', height: '100%', background: 'var(--green)' }" />
          </div>
          <input
            type="number"
            min="0"
            max="100"
            :value="g.progress"
            style="width: 62px; min-height: 26px; padding: 2px 6px; font-size: 12px"
            @change="setProgress(g, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <div style="font-size: 11.5px; color: var(--muted)">
          关键结果 {{ g.keyResults.filter((k) => k.done).length }}/{{ g.keyResults.length }}
          <template v-if="g.dueDate"> · 截止 {{ g.dueDate }}</template>
        </div>
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 3px">
          <button
            v-for="k in g.keyResults"
            :key="k.id"
            style="text-align: left; background: none; border: 0; padding: 2px 0; font-size: 12px"
            :style="{ color: k.done ? 'var(--muted)' : 'var(--ink)', textDecoration: k.done ? 'line-through' : 'none' }"
            @click="toggleKr(g.id, k.id)"
          >
            {{ k.done ? '✓ ' : '· ' }}{{ k.text }}
          </button>
        </div>
      </div>
    </div>
    <EmptyState
      v-else
      :title="domain === 'all' ? '还没有阶段目标' : '这个分类还没有阶段目标'"
      :desc="domain === 'all' ? '给这一两个月定一个能衡量的结果' : '换个分类，或新建一个目标'"
      action="新建目标"
      @action="openGoal()"
    />
  </section>

  <section class="sect">
    <div class="sect-h"><h2>未来七天到期</h2><span class="cnt">按日期</span></div>
    <div class="card">
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted)">
        <div v-for="d in 7" :key="d" style="display: flex; gap: 10px">
          <span style="font-family: var(--mono); width: 88px">{{ shiftYMD(today, d - 1) }}</span>
          <span>
            {{ s.tasks.filter((t) => !t.done && t.dueDate === shiftYMD(today, d - 1)).length }} 条
            <template v-if="s.tasks.some((t) => !t.done && t.dueDate === shiftYMD(today, d - 1))">
              · {{ s.tasks.filter((t) => !t.done && t.dueDate === shiftYMD(today, d - 1)).map((t) => t.title).join('、') }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.task-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.task-filter-main {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.task-domain-chips {
  margin-left: auto;
}

.goal-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.goal-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

@media (max-width: 560px) {
  .task-domain-chips {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>