<!--
  文件：src/views/HabitsView.vue
  说明：打卡页。按执行日排期，提供习惯 CRUD、今日打卡/撤销、补卡、月热力格、30 天记录与连续天数。
  结构：页头待完成数 → 今日打卡列表 → 本月热力格 → 30 天记录
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { FormField } from '@/stores/ui'
import { habitsDueOn, isChecked, streakOf } from '@/utils/selectors'
import { monthCells, shiftYMD, todayStr, ymd } from '@/utils/date'
import { nowISO, uid, uniq } from '@/utils/misc'
import type { Habit } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()

const list = computed(() => s.value.habits.filter((h) => h.active !== 0).sort((a, b) => a.order - b.order))
const todayList = computed(() => habitsDueOn(s.value, t).sort((a, b) => a.order - b.order))
const doneN = computed(() => todayList.value.filter((h) => isChecked(s.value, h.id, t)).length)
const pendingN = computed(() => todayList.value.length - doneN.value)

const cells = computed(() => monthCells())

/**
 * 返回某天应执行的习惯列表，热力格按当天应做数量而非全部习惯计算完成度。
 */
function habitsForHeat(date: string) {
  return habitsDueOn(s.value, date).filter((h) => {
    if (isChecked(s.value, h.id, date)) return true
    if (!h.createdAt) return true
    const created = new Date(h.createdAt)
    return Number.isNaN(created.getTime()) || ymd(created) <= date
  })
}

const heatCells = computed(() =>
  cells.value.map((c) => {
    if (!c.inMonth) return { ...c, items: [], state: '', tip: '' }
    const items = habitsForHeat(c.date).map((h) => ({
      id: h.id,
      name: h.name,
      on: isChecked(s.value, h.id, c.date)
    }))
    const done = items.filter((x) => x.on).length
    const state = !items.length ? '' : done === items.length ? 'full' : done > 0 ? 'part' : c.future ? 'future' : 'missed'
    const tip = items.length
      ? `${c.date} ${items.map((x) => `${x.name}${x.on ? ' 已打卡' : ' 未打卡'}`).join(' · ')}`
      : `${c.date} 无打卡安排`
    return { ...c, items, state, tip }
  })
)

const strips = computed(() =>
  list.value.map((h) => ({
    habit: h,
    total: (s.value.checkins[h.id] || []).length,
    days: Array.from({ length: 30 }, (_, i) => {
      const d = shiftYMD(t, i - 29)
      return { d, on: isChecked(s.value, h.id, d) }
    })
  }))
)

function introOf(h: Habit) {
  if (h.desc?.trim()) return h.desc.trim()
  const n = h.weekdays.length
  if (!n || n === 7) return '每天完成一次'
  return `每周执行 ${n} 天`
}
/**
 * 把每日/每周目标翻译成人类可读的执行日说明。
 */
function scheduleText(h: Habit) {
  if (!h.weekdays.length || h.weekdays.length === 7) return '每天'
  return h.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((x) => ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][x])
    .join('、')
}

function fields(h?: Habit): FormField[] {
  void h
  return [
    { key: 'name', label: '习惯名称', placeholder: '例如：喝水 8 杯' },
    { key: 'desc', label: '打卡简介', type: 'textarea', placeholder: '例如：早起后先喝一杯温水' },
    {
      key: 'weekdays',
      label: '执行日（不选表示每天）',
      type: 'multi',
      hint: '不选表示每天；按住 Ctrl / Cmd 可多选',
      options: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, i) => ({
        value: String(i),
        label
      }))
    }
  ]
}

function openHabit(h?: Habit) {
  ui.openForm({
    title: h ? '编辑习惯' : '新建习惯',
    fields: fields(h),
    values: h
      ? {
          name: h.name,
          desc: h.desc || '',
          weekdays: h.weekdays.map(String)
        }
      : { name: '', desc: '', weekdays: [] },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('习惯名称不能为空', 'err')
        return false
      }
      const rawDays = Array.isArray(v.weekdays)
        ? v.weekdays.map(String)
        : String(v.weekdays ?? '').split(/[,，\s]+/)
      const days = uniq(
        rawDays
          .map((x) => Number(String(x).trim()))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      ).sort((a, b) => a - b)
      const weekdays = days.length ? days : [0, 1, 2, 3, 4, 5, 6]
      store.commit((st) => {
        if (h) {
          const item = st.habits.find((x) => x.id === h.id)
          if (!item) return
          Object.assign(item, {
            name: String(v.name).trim(),
            desc: String(v.desc || '').trim(),
            freqType: 'daily',
            weeklyTarget: weekdays.length,
            weekdays,
            updatedAt: nowISO()
          })
        } else {
          st.habits.push({
            id: uid(),
            name: String(v.name).trim(),
            desc: String(v.desc || '').trim(),
            freqType: 'daily',
            weeklyTarget: weekdays.length,
            weekdays,
            active: 1,
            order: st.habits.length,
            createdAt: nowISO(),
            updatedAt: nowISO()
          })
        }
      })
      ui.toast(h ? '已保存' : '已新增')
    }
  })
}

function removeHabit(h: Habit) {
  ui.askConfirm({
    title: '删除习惯',
    message: `该习惯的 ${(s.value.checkins[h.id] || []).length} 条打卡记录会一并清除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.habits = st.habits.filter((x) => x.id !== h.id)
        delete st.checkins[h.id]
      })
      ui.toast('已删除')
    }
  })
}

/**
 * 切换某天打卡；同一日期集合天然去重，今天与补卡共用此入口。
 */
function toggleCheck(habitId: string, date: string) {
  store.commit((st) => {
    const arr = st.checkins[habitId] || []
    st.checkins[habitId] = arr.includes(date) ? arr.filter((d) => d !== date) : [...arr, date]
  })
}

/**
 * 只允许补昨天，且仅对昨天应执行的习惯开放，避免任意回填。
 */
function backfill() {
  const y = shiftYMD(t, -1)
  const todo = habitsDueOn(s.value, y).filter((h) => !isChecked(s.value, h.id, y))
  if (!todo.length) {
    ui.toast('昨天没有需要补打卡的习惯')
    return
  }
  ui.askConfirm({
    title: '补昨天',
    message: `将为 ${todo.length} 个昨天应打卡的习惯补打。`,
    confirmText: '确认补卡',
    onConfirm() {
      store.commit((st) => {
        todo.forEach((h) => {
          st.checkins[h.id] = uniq([...(st.checkins[h.id] || []), y])
        })
      })
      ui.toast(`已补 ${todo.length} 条`)
    }
  })
}

/**
 * 把全部习惯改为每天执行，用于从模板快速转成日常清单。
 */
function makeAllDaily() {
  ui.askConfirm({
    title: '把全部习惯设为每天',
    message: '只调整执行日，不改名称、简介和已有打卡记录。之后仍可在编辑习惯里改回指定星期。',
    confirmText: '设为每天',
    onConfirm() {
      store.commit((st) => {
        st.habits.forEach((h) => {
          if (h.active !== 0) h.weekdays = [0, 1, 2, 3, 4, 5, 6]
        })
      })
      ui.toast('已把全部习惯设为每天')
    }
  })
}
</script>

<template>
  <PageHeader title="打卡" subtitle="按执行日自动排期，只显示今天要做的事">
    <template #actions>
      <button class="btn btn-primary" @click="openHabit()">
        <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        新建习惯
      </button>
    </template>
  </PageHeader>

  <EmptyState v-if="!list.length" title="还没有习惯" desc="从一件每天都能做到的小事开始" action="新建习惯" @action="openHabit()" />

  <section v-else class="sect">
    <div class="sect-h">
      <h2>今日打卡</h2>
      <span class="today-pill">{{ doneN }} / {{ todayList.length }}</span>
      <span class="spacer" />
      <span class="sect-note">{{ pendingN ? `${pendingN} 项待完成` : '今天已全部完成' }}</span>
    </div>
    <div class="card today-card">
      <div class="today-track" aria-hidden="true">
        <i :style="{ width: todayList.length ? `${(doneN / todayList.length) * 100}%` : '0%' }" />
      </div>
      <div v-if="todayList.length" class="rows">
        <div
          v-for="h in todayList"
          :key="h.id"
          class="row habit-row"
          :class="{ done: isChecked(s, h.id, t) }"
        >
          <div class="habit-main">
            <div class="habit-head">
              <span class="habit-state-dot" :class="{ on: isChecked(s, h.id, t) }" />
              <div class="title">{{ h.name }}</div>
              <span class="tag" :class="isChecked(s, h.id, t) ? 'ok' : 'quiet'">
                {{ isChecked(s, h.id, t) ? '已打卡' : '未打卡' }}
              </span>
            </div>
            <div class="habit-desc">{{ introOf(h) }}</div>
            <div class="habit-meta">
              <span>连续 {{ streakOf(s, h.id) }} 天</span>
              <span v-if="!isChecked(s, h.id, shiftYMD(t, -1))" class="meta-flag">
                <i />
                昨天未打卡
              </span>
            </div>
          </div>
          <div class="habit-cta">
            <button
              class="habit-toggle"
              :class="{ done: isChecked(s, h.id, t) }"
              :aria-label="isChecked(s, h.id, t) ? `撤销${h.name}今天的打卡` : `为${h.name}打卡`"
              @click="toggleCheck(h.id, t)"
            >
              <svg v-if="!isChecked(s, h.id, t)" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="m8.5 12 2.4 2.4 4.6-5" />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 12H5" />
                <path d="m9 8-4 4 4 4" />
              </svg>
              {{ isChecked(s, h.id, t) ? '撤销' : '打卡' }}
            </button>
          </div>
          <div class="habit-acts">
            <button class="habit-icon" title="编辑习惯" aria-label="编辑习惯" @click="openHabit(h)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4l10.5-10.5-4-4L4 16v4Z" />
                <path d="m13.5 5.5 4 4" />
              </svg>
            </button>
            <button class="habit-icon danger" title="删除习惯" aria-label="删除习惯" @click="removeHabit(h)">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16" />
                <path d="m9 7 1-3h4l1 3" />
                <path d="m6 7 1 13h10l1-13" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="no-today">
        <div class="no-today-title">今天没有安排打卡</div>
        <div class="no-today-desc">
          当前 {{ list.length }} 个习惯的执行日不包含今天{{ list.length ? '，可在编辑习惯里调整执行日' : '' }}
        </div>
        <div v-if="list.length" class="no-today-actions">
          <button class="btn btn-sm" @click="makeAllDaily">全部设为每天</button>
        </div>
      </div>
      <div class="habit-foot">
        <button class="btn btn-sm" @click="backfill">补昨天</button>
        <span class="foot-note">只补昨天应打卡的习惯，更早日期不可回填</span>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>本月热力格</h2><span class="cnt">日期下为当天习惯标题</span></div>
    <div class="card">
      <div class="heat-grid">
        <div v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="hd">{{ w }}</div>
        <template v-for="(c, i) in heatCells" :key="i">
          <div v-if="!c.inMonth" class="heat-cell blank" />
          <div
            v-else
            class="heat-cell"
            :class="[c.state, { 'is-today': c.isToday }]"
            :title="c.tip"
          >
            <span class="heat-day">{{ c.day }}</span>
            <div v-if="c.items.length" class="heat-items">
              <span
                v-for="item in c.items.slice(0, 2)"
                :key="item.id"
                class="heat-item"
                :class="{ on: item.on }"
              >
                {{ item.name }}
              </span>
              <span v-if="c.items.length > 2" class="heat-more">+{{ c.items.length - 2 }}</span>
            </div>
          </div>
        </template>
      </div>
      <div class="heat-legend">
        <span><i class="full" />全部完成</span>
        <span><i class="part" />部分完成</span>
        <span><i class="missed" />未打卡</span>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>30 天记录</h2><span class="cnt">右端为今天</span></div>
    <div class="card">
      <div v-for="row in strips" :key="row.habit.id" class="strip-row">
        <div class="strip-head">
          <div class="strip-name">
            <span>{{ row.habit.name }}</span>
            <em>{{ scheduleText(row.habit) }}</em>
          </div>
          <div class="strip-right">
            <span>{{ row.total }} 次</span>
            <button class="mini" @click="openHabit(row.habit)">编辑</button>
          </div>
        </div>
        <div class="strip-bars">
          <i
            v-for="d in row.days"
            :key="d.d"
            :title="d.d"
            :style="{
              background: d.on ? 'var(--green)' : 'var(--line-soft)'
            }"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.btn-icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.today-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--green) 22%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--green-soft) 74%, transparent);
  color: var(--green);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1;
}

.sect-note {
  color: var(--muted);
  font-size: 11.5px;
}

.today-card {
  position: relative;
  padding-top: 20px;
  overflow: hidden;
}

.today-track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--line-soft);
}

.today-track i {
  display: block;
  height: 100%;
  border-radius: 0 999px 999px 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--green) 32%, #fff), var(--green));
  transition: width 0.25s ease;
}

.habit-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px 16px;
  padding: 14px 18px;
  border-left: 0;
  background: transparent;
  transition: background 0.18s ease;
}

.habit-row:hover {
  background: color-mix(in srgb, var(--card) 52%, transparent);
}

.habit-row.done {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--green-soft) 78%, transparent) 0, transparent 62%);
}

.habit-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.habit-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.habit-state-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--amber) 56%, var(--line));
  border-radius: 50%;
  background: color-mix(in srgb, var(--amber-soft) 58%, transparent);
}

.habit-state-dot.on {
  border-color: var(--green);
  background: var(--green);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 10%, transparent);
}

.habit-head .title {
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
  word-break: break-word;
}

.habit-desc {
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.55;
  word-break: break-word;
}

.habit-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--muted);
}

.meta-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--amber) 20%, var(--line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--amber-soft) 44%, transparent);
  color: color-mix(in srgb, var(--amber) 86%, var(--ink));
  font-size: 10.5px;
  line-height: 17px;
}

.meta-flag i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--amber);
}

.habit-cta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.habit-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--green-deep) 82%, transparent);
  border-radius: var(--r-sm);
  background: linear-gradient(180deg, color-mix(in srgb, var(--green) 78%, #fff), var(--green));
  color: var(--on-green);
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: 0 7px 16px -12px color-mix(in srgb, var(--green) 76%, transparent);
  transition: filter 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.habit-toggle:hover {
  filter: brightness(1.04);
  transform: translateY(-1px);
}

.habit-toggle svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.habit-toggle.done {
  border-color: var(--line);
  background: color-mix(in srgb, var(--card) 58%, transparent);
  color: var(--muted);
  box-shadow: none;
}

.habit-toggle.done:hover {
  border-color: color-mix(in srgb, var(--amber) 44%, var(--line));
  background: color-mix(in srgb, var(--amber-soft) 54%, transparent);
  color: var(--amber);
}

.habit-acts {
  display: flex;
  gap: 4px;
  flex: none;
  padding-top: 1px;
}

.habit-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--card) 44%, transparent);
  color: color-mix(in srgb, var(--muted) 78%, var(--ink));
  transition: color 0.16s ease, background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.habit-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.habit-icon:hover {
  border-color: var(--line);
  background: color-mix(in srgb, var(--card) 64%, transparent);
  color: var(--green);
  transform: translateY(-1px);
}

.habit-icon.danger:hover {
  border-color: color-mix(in srgb, var(--red) 24%, var(--line));
  background: color-mix(in srgb, var(--red-soft) 64%, transparent);
  color: var(--red);
}

.heat-grid {
  gap: 6px;
}

.heat-cell {
  aspect-ratio: auto;
  min-height: 60px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 3px;
  text-align: left;
  border-color: color-mix(in srgb, var(--line) 80%, transparent);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--card) 56%, transparent);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.heat-cell:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 14px -12px rgba(43, 37, 27, 0.4);
}

.heat-cell.full {
  background: color-mix(in srgb, var(--green-soft) 88%, transparent);
  border-color: color-mix(in srgb, var(--green) 14%, var(--line));
}

.heat-cell.part {
  background: color-mix(in srgb, var(--amber-soft) 82%, transparent);
  border-color: color-mix(in srgb, var(--amber) 14%, var(--line));
}

.heat-cell.missed {
  background: color-mix(in srgb, var(--paper-deep) 46%, transparent);
  border-color: color-mix(in srgb, var(--line) 68%, transparent);
}

.heat-cell.future {
  opacity: 0.58;
}

.heat-day {
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  color: var(--muted);
}

.heat-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.heat-item {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  line-height: 1.3;
  color: var(--muted);
}

.heat-item.on,
.heat-cell.full .heat-item {
  color: var(--green);
  font-weight: 600;
}

.heat-cell.missed .heat-item {
  color: var(--muted);
}

.heat-more {
  font-family: var(--mono);
  font-size: 8.5px;
  color: var(--muted);
}

.heat-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 11px;
  font-size: 10.5px;
  color: var(--muted);
}

.heat-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.heat-legend i {
  width: 9px;
  height: 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
}

.heat-legend i.full {
  background: var(--green-soft);
  border-color: var(--green);
}

.heat-legend i.part {
  background: var(--amber-soft);
  border-color: var(--amber);
}

.heat-legend i.missed {
  background: color-mix(in srgb, var(--paper-deep) 64%, transparent);
  border-color: var(--line);
}

.no-today {
  padding: 28px 16px;
  text-align: center;
}

.no-today-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.no-today-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.65;
}

.no-today-actions {
  margin-top: 14px;
  display: flex;
  justify-content: center;
  gap: 6px;
}

.strip-row {
  margin-bottom: 0;
  padding: 13px 0;
  border-bottom: 1px solid var(--line-soft);
}

.strip-row:first-child {
  padding-top: 2px;
}

.strip-row:last-child {
  margin-bottom: 0;
  padding-bottom: 2px;
  border-bottom: 0;
}

.strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  font-size: 12.5px;
}

.strip-name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex-wrap: wrap;
  font-weight: 600;
}

.strip-name em {
  font-size: 10px;
  font-style: normal;
  color: var(--green);
  border: 1px solid color-mix(in srgb, var(--green) 18%, var(--line));
  border-radius: 999px;
  padding: 1px 7px;
  background: color-mix(in srgb, var(--green-soft) 54%, transparent);
}

.strip-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10.5px;
}

.strip-bars {
  display: flex;
  gap: 3px;
}

.strip-bars i {
  flex: 1;
  height: 15px;
  border-radius: var(--r-xs);
}

.habit-foot {
  display: flex;
  gap: 9px;
  margin-top: 10px;
  padding-top: 13px;
  border-top: 1px solid var(--line-soft);
  align-items: center;
  flex-wrap: wrap;
}

.foot-note {
  font-size: 11.5px;
  color: var(--muted);
}

@media (max-width: 700px) {
  .habit-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px 10px;
    padding: 14px 13px;
  }

  .habit-main {
    grid-area: 1 / 1 / 2 / 2;
  }

  .habit-acts {
    grid-area: 1 / 2 / 2 / 3;
    gap: 2px;
  }

  .habit-cta {
    grid-area: 2 / 1 / 3 / 3;
    justify-content: flex-start;
    margin-top: 4px;
  }

  .habit-icon {
    width: 32px;
    height: 32px;
  }

  .habit-toggle {
    min-height: 33px;
    padding: 0 12px;
  }

  .heat-cell {
    min-height: 54px;
    padding: 4px 3px;
  }

  .heat-item {
    font-size: 8.5px;
  }

  .sect-note {
    display: none;
  }
}
</style>