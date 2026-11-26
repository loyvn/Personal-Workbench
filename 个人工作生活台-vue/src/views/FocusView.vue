<!--
  文件：src/views/FocusView.vue
  说明：专注页。绑定任务、选择番茄/不限时/自定义档位、开始暂停结束、近 7 天统计、音乐入口与最近专注记录。
  结构：页头今日统计 → 计时主卡（档位/环形进度/绑定任务）→ 近 7 天柱状 → 音乐迷你卡 → 最近专注记录
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MusicMiniCard from '@/components/MusicMiniCard.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import {
  focusState,
  startFocus,
  pauseFocus,
  resumeFocus,
  skipPhase,
  stopAll,
  resetPhase,
  initFocusTimer,
  applyMode,
  finishSession,
  progressPercent,
  RING_CIRC,
  todayFocusStats
} from '@/services/focus'
import { fmtClock, fmtTime, last7Days } from '@/utils/date'
import { sum, clamp } from '@/utils/misc'
import type { FocusMode } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const router = useRouter()
const s = computed(() => store.data)

initFocusTimer()

const fs = computed(() => todayFocusStats())
const mode = computed(() => s.value.focus.settings.mode)
const customWork = computed(() => s.value.focus.settings.customWork)
const rounds = computed(() => s.value.focus.settings.roundsBeforeLong)

const timeLabel = computed(() => {
  const ms = focusState.mode === 'open' ? focusState.elapsedMs : focusState.remainMs
  if (ms >= 3600000) {
    const secs = Math.floor(ms / 1000)
    const h = Math.floor(secs / 3600)
    return `${h}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
  }
  return fmtClock(ms)
})
const phaseLabel = computed(() => {
  if (focusState.mode === 'open') return '不限时'
  if (focusState.mode === 'custom') return `自定义 ${customWork.value} 分钟`
  return focusState.phase === 'work' ? '专注' : focusState.phase === 'short' ? '短休' : '长休'
})
const taskName = computed(() => s.value.tasks.find((t) => t.id === focusState.taskId)?.title || '')
const ringOffset = computed(() => (focusState.mode === 'open' ? RING_CIRC : RING_CIRC * (1 - progressPercent())))
const openTasks = computed(() => s.value.tasks.filter((t) => !t.done))

const cycleDone = computed(() => {
  if (focusState.phase === 'long') return rounds.value
  return focusState.round % rounds.value
})
const cycleNote = computed(() => {
  const done = cycleDone.value
  if (focusState.phase === 'long') return `${rounds.value} / ${rounds.value} 已完成 · 正在 ${s.value.focus.settings.long} 分钟长休`
  if (focusState.phase === 'short') return `已完成 ${done} / ${rounds.value} 个 · 再完成 ${rounds.value - done} 个进长休`
  if (!done) return `第 1 个番茄 · 完成 ${rounds.value} 个后进入 ${s.value.focus.settings.long} 分钟长休`
  return `已完成 ${done} / ${rounds.value} 个 · 再完成 ${rounds.value - done} 个进入 ${s.value.focus.settings.long} 分钟长休`
})

const days = last7Days()
const perDay = computed(() =>
  days.map((d) => ({
    d,
    v: sum(
      s.value.focus.sessions.filter((x) => x.completed && x.endedAt.slice(0, 10) === d),
      (x) => x.actualMin
    )
  }))
)
const maxV = computed(() => Math.max(1, ...perDay.value.map((x) => x.v)))
const recent = computed(() => s.value.focus.sessions.slice(0, 8))

function bindTask(e: Event) {
  focusState.taskId = (e.target as HTMLSelectElement).value || null
}

function goCreateTask() {
  void router.push({ path: '/tasks', query: { new: '1' } })
}

/**
 * 切换番茄/不限时/自定义；若正在计时先确认并把已过时间记为中断。
 */
function chooseMode(next: FocusMode) {
  if (next === mode.value) return
  const apply = () => {
    applyMode(next)
    ui.toast(next === 'open' ? '已切到不限时' : next === 'custom' ? '已切到自定义' : '已切到番茄档位')
  }
  if (focusState.running || focusState.paused) {
    ui.askConfirm({
      title: '切换计时档位',
      message: '切换会结束当前计时，已过的时间记为中断。',
      confirmText: '切换',
      onConfirm() {
        stopAll()
        apply()
      }
    })
    return
  }
  apply()
}

/**
 * 调整自定义倒计时分钟数，夹在 5–180 并同步到专注设置。
 */
function setCustom(value: number) {
  const v = clamp(value, 5, 180)
  store.commit((st) => {
    st.focus.settings.customWork = v
  })
  if (!focusState.running && !focusState.paused && mode.value === 'custom') resetPhase('work')
}

/**
 * 开始或继续当前档位；未选任务时允许空绑定，只记录时间。
 */
function startMain() {
  startFocus()
  ui.toast(mode.value === 'open' ? '开始正计时' : '开始专注')
}

function openSettings() {
  const cur = s.value.focus.settings
  ui.openForm({
    title: '番茄与休息设置',
    fields: [
      { key: 'work', label: '经典档位专注（分钟）', type: 'number', min: 1, max: 120 },
      { key: 'customWork', label: '自定义档位时长（分钟）', type: 'number', min: 5, max: 180 },
      { key: 'short', label: '短休（分钟）', type: 'number', min: 1, max: 60 },
      { key: 'long', label: '长休（分钟）', type: 'number', min: 1, max: 90 },
      { key: 'rounds', label: '几个番茄后长休', type: 'number', min: 2, max: 8 },
      { key: 'auto', label: '休息结束自动开始下一阶段', type: 'check', hint: '自动' }
    ],
    values: {
      work: cur.work,
      customWork: cur.customWork,
      short: cur.short,
      long: cur.long,
      rounds: cur.roundsBeforeLong,
      auto: cur.autoStartBreak
    },
    onSubmit(v) {
      store.commit((st) => {
        st.focus.settings = {
          ...cur,
          work: clamp(Number(v.work) || 25, 1, 120),
          customWork: clamp(Number(v.customWork) || 45, 5, 180),
          short: clamp(Number(v.short) || 5, 1, 60),
          long: clamp(Number(v.long) || 15, 1, 90),
          roundsBeforeLong: clamp(Number(v.rounds) || 4, 2, 8),
          autoStartBreak: !!v.auto
        }
      })
      if (!focusState.running && !focusState.paused) resetPhase(focusState.phase)
      ui.toast('已保存')
    }
  })
}

/**
 * 重置当前阶段显示，不写专注记录，用于放弃本次计时。
 */
function resetTimer() {
  if (focusState.phase === 'work' && (focusState.running || focusState.paused)) {
    ui.askConfirm({
      title: '重置计时',
      message: '当前这次专注会被记为中断。',
      confirmText: '重置',
      onConfirm() {
        stopAll()
        ui.toast('已重置')
      }
    })
  } else {
    resetPhase('work')
  }
}
</script>

<template>
  <PageHeader title="专注" :subtitle="`今日 ${fs.count} 次专注 · ${fs.minutes} 分钟`">
    <template #actions>
      <button class="btn" @click="openSettings">计时设置</button>
    </template>
  </PageHeader>

  <div class="card focus-card">
    <div class="mode-tabs">
      <button class="mode-btn" :class="{ on: mode === 'pomodoro' }" @click="chooseMode('pomodoro')">
        <b>{{ s.focus.settings.work }} 分钟</b>
        <span>经典番茄 · 每 {{ rounds }} 轮长休</span>
      </button>
      <button class="mode-btn" :class="{ on: mode === 'open' }" @click="chooseMode('open')">
        <b>不限时</b>
        <span>正计时 · 手动结束</span>
      </button>
      <button class="mode-btn" :class="{ on: mode === 'custom' }" @click="chooseMode('custom')">
        <b>自定义</b>
        <span>倒计时 · {{ customWork }} 分钟</span>
      </button>
    </div>

    <div v-if="mode === 'custom'" class="custom-tune">
      <span class="ct-label">专注时长</span>
      <div class="stepper">
        <button aria-label="减少 5 分钟" @click="setCustom(customWork - 5)">−</button>
        <b>{{ customWork }} 分钟</b>
        <button aria-label="增加 5 分钟" @click="setCustom(customWork + 5)">+</button>
      </div>
      <div class="quick">
        <button
          v-for="v in [15, 30, 45, 60, 90]"
          :key="v"
          class="chip"
          :class="{ on: customWork === v }"
          @click="setCustom(v)"
        >
          {{ v }}
        </button>
      </div>
    </div>

    <div class="timer-wrap">
      <div class="timer-ring" :class="{ open: mode === 'open' }">
        <svg viewBox="0 0 236 236">
          <circle class="tr-g" cx="118" cy="118" r="104" />
          <circle
            class="tr-f"
            cx="118"
            cy="118"
            r="104"
            :stroke-dasharray="RING_CIRC.toFixed(2)"
            :stroke-dashoffset="ringOffset.toFixed(2)"
            transform="rotate(-90 118 118)"
          />
        </svg>
        <div class="tr-in">
          <div class="tr-time">{{ timeLabel }}</div>
          <div class="tr-ph">{{ phaseLabel }}</div>
          <div class="tr-task">{{ taskName || '未绑定任务' }}</div>
        </div>
      </div>
      <div class="timer-actions">
        <button v-if="focusState.running" class="btn" @click="pauseFocus()">暂停</button>
        <button v-else-if="focusState.paused" class="btn btn-primary" @click="resumeFocus()">继续</button>
        <button v-else class="btn btn-primary" @click="startMain">
          {{ mode === 'open' ? '开始正计时' : '开始专注' }}
        </button>
        <button v-if="mode === 'pomodoro'" class="btn" @click="skipPhase()">跳过</button>
        <button v-else-if="focusState.running || focusState.paused" class="btn" @click="finishSession()">结束并记录</button>
        <button class="btn btn-ghost" @click="resetTimer">重置</button>
      </div>

      <div v-if="mode === 'pomodoro'" class="cycle">
        <div class="cycle-top">
          <span class="cy-label">长休进度</span>
          <span class="cycle-track">
            <i
              v-for="i in rounds"
              :key="i"
              :class="{ done: i <= cycleDone, cur: i === cycleDone + 1 && focusState.phase === 'work' }"
            >
              {{ i }}
            </i>
          </span>
          <span class="cy-count">{{ cycleDone }} / {{ rounds }}</span>
        </div>
        <div class="cy-note">{{ cycleNote }}</div>
      </div>
      <div v-else class="cycle-hint">
        {{
          mode === 'open'
            ? '正计时不会自动结束，也不进入长休循环；点「结束并记录」保存本次时长。'
            : '自定义倒计时是一次独立专注，不进入番茄长休循环。'
        }}
      </div>
    </div>
  </div>

  <div class="home-wrap" style="margin-top: 16px">
    <div>
      <section class="sect">
        <div class="sect-h"><h2>绑定任务</h2><span class="cnt">{{ openTasks.length }} 条未完成</span></div>
        <div class="card">
          <div v-if="!openTasks.length" class="focus-empty-task">
            <div class="focus-empty-copy">
              <b>暂无可绑定任务</b>
              <span>先新建一条未完成待办，回来就能把专注时间记进去。</span>
            </div>
            <button class="btn btn-primary" @click="goCreateTask">+ 新建任务</button>
          </div>
          <template v-else>
            <select :value="focusState.taskId || ''" @change="bindTask">
              <option value="">不绑定任务</option>
              <option v-for="t in openTasks.slice(0, 40)" :key="t.id" :value="t.id">{{ t.title }}</option>
            </select>
            <div style="font-size: 11.5px; color: var(--muted); margin-top: 6px">
              绑定后，这次专注会记进该任务的累计投入。
            </div>
          </template>
        </div>

        <div class="sect-h" style="margin-top: 16px"><h2>近 7 天</h2><span class="cnt">分钟</span></div>
        <div class="card">
          <div class="bars">
            <div v-for="x in perDay" :key="x.d" class="b" :class="{ zero: !x.v }">
              <span>{{ x.v }}</span>
              <i :style="{ height: (x.v ? Math.max(3, Math.round((x.v / maxV) * 44)) : 2) + 'px' }" />
            </div>
          </div>
          <div style="display: flex; gap: 4px; margin-top: 4px">
            <span v-for="x in perDay" :key="x.d" style="flex: 1; text-align: center; font-size: 9px; color: var(--muted)">
              {{ x.d.slice(8) }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <div>
      <section class="sect">
        <div class="sect-h"><h2>音乐</h2><span class="cnt">专注时也能放歌</span></div>
        <MusicMiniCard />
      </section>
    </div>
  </div>

  <section class="sect">
    <div class="sect-h"><h2>最近专注记录</h2><span class="cnt">{{ s.focus.sessions.length }}</span></div>
    <div v-if="recent.length" class="card flush tbl-wrap">
      <table class="tbl">
        <thead>
          <tr><th>时间</th><th>任务</th><th class="num">时长</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="x in recent" :key="x.id">
            <td>{{ fmtTime(x.endedAt) }}</td>
            <td>{{ s.tasks.find((t) => t.id === x.taskId)?.title || '未绑定或已删除' }}</td>
            <td class="num">{{ x.actualMin }} 分</td>
            <td><span class="tag" :class="x.completed ? 'ok' : 'amber'">{{ x.completed ? '完成' : '中断' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="card" style="color: var(--muted); font-size: 13px">还没有专注记录，开始第一次专注</div>
  </section>
</template>

<style scoped>
.focus-card {
  padding: 16px 16px 20px;
}
.mode-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  max-width: 560px;
  margin: 0 auto 20px;
}
.mode-btn {
  min-height: 58px;
  padding: 9px 11px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface-soft);
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.16s, background 0.16s, box-shadow 0.16s;
}
.mode-btn b {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.mode-btn span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.45;
}
.mode-btn.on {
  border-color: var(--green);
  background: var(--green-soft);
  box-shadow: inset 0 0 0 1px rgba(47, 93, 80, 0.1);
}
.mode-btn.on b {
  color: var(--green);
}
.custom-tune {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  max-width: 560px;
  margin: -8px auto 18px;
  padding: 9px 11px;
  border: 1px dashed var(--line);
  border-radius: var(--r-xs);
  font-size: 11.5px;
  color: var(--muted);
}
.ct-label {
  color: var(--muted);
}
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
  overflow: hidden;
}
.stepper button {
  width: 30px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.stepper button:hover {
  background: var(--green-soft);
}
.stepper b {
  min-width: 64px;
  text-align: center;
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
}
.quick {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.quick .chip {
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  font-size: 11px;
}
.cycle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
  max-width: 380px;
}
.cycle-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted);
}
.cy-label {
  letter-spacing: 0.5px;
}
.cycle-track {
  display: flex;
  gap: 5px;
}
.cycle-track i {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 10px;
  font-style: normal;
  line-height: 1;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.cycle-track i.done {
  border-color: var(--green);
  background: var(--green);
  color: var(--on-green);
}
.cycle-track i.cur {
  border-color: var(--amber);
  color: var(--amber);
  background: transparent;
}
.cy-count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink);
}
.cy-note {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}
.cycle-hint {
  max-width: 400px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}
.timer-ring.open .tr-f {
  opacity: 0;
}
.focus-empty-task {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.focus-empty-copy {
  display: flex;
  flex: 1 1 190px;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--muted);
}
.focus-empty-copy b {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.focus-empty-task .btn {
  flex: none;
}
@media (max-width: 520px) {
  .focus-card {
    padding: 12px 10px 16px;
  }
  .mode-tabs {
    gap: 6px;
    margin-bottom: 16px;
  }
  .mode-btn {
    min-height: 62px;
    padding: 8px 9px;
  }
  .mode-btn b {
    font-size: 12px;
  }
  .mode-btn span {
    font-size: 10px;
  }
}
</style>