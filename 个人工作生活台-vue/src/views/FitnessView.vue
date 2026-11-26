<!--
  文件：src/views/FitnessView.vue
  说明：健身计划页。包含今日分化、进行中的训练组次录入、分化模板、体重围度、最近训练和本周容量统计。
  结构：页头周统计 → 今日分化 → 进行中的训练 → 分化计划 → 体重与围度 → 最近训练
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { todaySplit, sessionVolume } from '@/utils/selectors'
import { last7Days, relDay, todayStr, weekRange } from '@/utils/date'
import { nowISO, sum, uid } from '@/utils/misc'
import type { SessionEntry, SetEntry, Split } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()
const { start, end } = weekRange()

const draft = ref<SessionEntry[]>([])

const sp = computed(() => todaySplit(s.value))
const weekSessions = computed(() => s.value.fitness.sessions.filter((x) => x.date >= start && x.date <= end))
const vol = computed(() => sum(weekSessions.value, (x) => sessionVolume(x)))
const weekSets = computed(() => sum(weekSessions.value, (x) => sum(x.entries, (e) => e.sets.length)))
const lastMetric = computed(() =>
  s.value.fitness.metrics.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null
)
const sessions = computed(() => s.value.fitness.sessions.slice().sort((a, b) => b.date.localeCompare(a.date)))
const nextPart = computed(() => {
  const list = s.value.fitness.split
  if (!list.length) return ''
  const last = sessions.value[0]
  if (!last) return list[0].name
  const idx = list.findIndex((p) => p.id === last.splitId)
  return list[(idx + 1) % list.length]?.name || ''
})

const draftVolume = computed(() => sum(draft.value, (e) => sum(e.sets, (x) => x.weight * x.reps)))

function exerciseName(id: string): string {
  return s.value.fitness.exercises.find((e) => e.id === id)?.name || '未知动作'
}

/**
 * 按今天的分化创建训练草稿，复制动作清单但组次从空开始。
 */
function startTraining() {
  if (!s.value.fitness.split.length) {
    ui.toast('先建一个分化计划', 'err')
    return
  }
  openAddSet()
}

/**
 * 给当前动作追加一组，默认带上次重量/次数，减少重复输入。
 */
function openAddSet() {
  const pool = s.value.fitness.exercises
  if (!pool.length) {
    ui.toast('先加一个训练动作', 'err')
    openExercise()
    return
  }
  const splitPool = sp.value?.exerciseIds?.length ? pool.filter((e) => sp.value?.exerciseIds.includes(e.id)) : pool
  ui.openForm({
    title: '记录一组训练',
    fields: [
      {
        key: 'exerciseId',
        label: '动作',
        type: 'select',
        options: (splitPool.length ? splitPool : pool).map((e) => ({ value: e.id, label: e.name }))
      },
      { key: 'weight', label: '重量 kg', type: 'number', min: 0 },
      { key: 'reps', label: '次数', type: 'number', min: 0 },
      { key: 'sets', label: '组数', type: 'number', min: 1, max: 12 }
    ],
    values: { exerciseId: splitPool[0]?.id || pool[0].id, weight: 0, reps: 8, sets: 3 },
    onSubmit(v) {
      const n = Math.max(1, Math.min(12, Number(v.sets) || 1))
      const weight = Math.max(0, Number(v.weight) || 0)
      const reps = Math.max(0, Number(v.reps) || 0)
      const sets: SetEntry[] = Array.from({ length: n }, () => ({ weight, reps }))
      const existing = draft.value.find((x) => x.exerciseId === v.exerciseId)
      if (existing) existing.sets.push(...sets)
      else draft.value.push({ exerciseId: String(v.exerciseId), sets })
      ui.toast('已加入记录')
    }
  })
}

function removeSet(index: number) {
  draft.value.splice(index, 1)
}

/**
 * 收尾训练：过滤空组、计算容量并写入 fitness.sessions。
 */
function finishTraining() {
  if (!draft.value.length) {
    ui.toast('还没有记录内容', 'err')
    return
  }
  store.commit((st) => {
    st.fitness.sessions.unshift({
      id: uid(),
      date: t,
      splitId: sp.value?.id || null,
      entries: JSON.parse(JSON.stringify(draft.value)),
      durationMin: 0,
      note: ''
    })
  })
  draft.value = []
  ui.toast('训练已保存')
}

function openExercise() {
  ui.openForm({
    title: '新增动作',
    fields: [
      { key: 'name', label: '动作名称', placeholder: '例如：高脚杯深蹲' },
      { key: 'part', label: '部位', placeholder: '胸 / 背 / 腿 / 肩' },
      {
        key: 'unit',
        label: '计量',
        type: 'select',
        options: [
          { value: 'kg', label: '重量 kg' },
          { value: 'bw', label: '自重' }
        ]
      }
    ],
    values: { name: '', part: '', unit: 'kg' },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('动作名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        st.fitness.exercises.push({
          id: uid(),
          name: String(v.name).trim(),
          part: String(v.part || '综合'),
          unit: String(v.unit || 'kg'),
          isCustom: 1
        })
      })
      ui.toast('已加入动作库')
    }
  })
}

function openSplit(split?: Split) {
  ui.openForm({
    title: split ? '编辑部位' : '新增部位',
    fields: [
      { key: 'name', label: '部位名称', placeholder: '例如：上肢' },
      { key: 'weekday', label: '星期（0=周一 … 6=周日，逗号分隔）', placeholder: '0,3' }
    ],
    values: split ? { name: split.name, weekday: split.weekday.join(',') } : { name: '', weekday: '' },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('先写部位名称', 'err')
        return false
      }
      const weekday = String(v.weekday || '')
        .split(/[,，\s]+/)
        .map(Number)
        .filter((n) => n >= 0 && n <= 6)
      store.commit((st) => {
        if (split) {
          const item = st.fitness.split.find((p) => p.id === split.id)
          if (item) {
            item.name = String(v.name).trim()
            item.weekday = weekday
          }
        } else {
          st.fitness.split.push({ id: uid(), name: String(v.name).trim(), weekday, exerciseIds: [] })
        }
      })
      ui.toast('已保存')
    }
  })
}

function removeSplit(split: Split) {
  ui.askConfirm({
    title: '删除部位',
    message: '历史训练记录会保留。',
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.fitness.split = st.fitness.split.filter((p) => p.id !== split.id)
      })
    }
  })
}

/**
 * 无计划时一键生成推/拉/腿模板，动作与星期绑定同时建立。
 */
function genTemplate() {
  const tpl = [
    { name: '推（胸肩三头）', weekday: [0, 3], ex: ['卧推', '上斜哑铃推', '侧平举', '绳索下压'] },
    { name: '拉（背二头）', weekday: [1, 4], ex: ['引体向上', '划船', '面拉', '弯举'] },
    { name: '腿', weekday: [2, 5], ex: ['深蹲', '腿举', '腿弯举', '提踵'] }
  ]
  store.commit((st) => {
    tpl.forEach((x) => {
      const ids = x.ex.map((n) => {
        const exist = st.fitness.exercises.find((e) => e.name === n)
        if (exist) return exist.id
        const created = { id: uid(), name: n, part: '综合', unit: 'kg', isCustom: 1 as const }
        st.fitness.exercises.push(created)
        return created.id
      })
      st.fitness.split.push({ id: uid(), name: x.name, weekday: x.weekday, exerciseIds: ids })
    })
  })
  ui.toast('已生成推 / 拉 / 腿模板')
}

function openMetric() {
  ui.openForm({
    title: '记一次体测',
    fields: [
      { key: 'date', label: '日期', type: 'date' },
      { key: 'weight', label: '体重 kg', type: 'number' },
      { key: 'waist', label: '腰围 cm', type: 'number' },
      { key: 'chest', label: '胸围 cm', type: 'number' },
      { key: 'arm', label: '臂围 cm', type: 'number' }
    ],
    values: { date: t, weight: '', waist: '', chest: '', arm: '' },
    onSubmit(v) {
      const num = (x: unknown) => (x === '' || x === null ? null : Number(x))
      store.commit((st) => {
        st.fitness.metrics.unshift({
          id: uid(),
          date: String(v.date || t),
          weight: num(v.weight),
          waist: num(v.waist),
          chest: num(v.chest),
          arm: num(v.arm)
        })
      })
      ui.toast('已记录')
    }
  })
}

const last7 = computed(() =>
  last7Days().map((d) => ({
    d,
    done: s.value.fitness.sessions.some((x) => x.date === d)
  }))
)
</script>

<template>
  <PageHeader title="健身计划" :subtitle="`本周 ${weekSessions.length} 次 · ${weekSets} 组 · 容量 ${Math.round(vol)} kg`">
    <template #actions>
      <button class="btn btn-primary" @click="startTraining">{{ draft.length ? '继续记录' : '开始训练' }}</button>
      <button class="btn" @click="openSplit()">新增部位</button>
    </template>
  </PageHeader>

  <div class="kpis" style="margin-bottom: 16px">
    <div class="kpi">
      <div class="kv">{{ weekSessions.length }} <small>次</small></div>
      <div class="kl">本周训练</div>
      <div class="ks">{{ sp ? `今天：${sp.name}` : '今天休息' }}</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ Math.round(vol) }} <small>kg</small></div>
      <div class="kl">周容量</div>
      <div class="ks">重量 × 次数合计</div>
    </div>
    <div class="kpi">
      <div class="kv">{{ lastMetric?.weight || '—' }} <small>kg</small></div>
      <div class="kl">最近体重</div>
      <div class="ks">{{ lastMetric ? lastMetric.date : '还没有体测' }}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 16px">
    <div class="sect-h"><h2>今天</h2><div class="spacer" /><span class="cnt">{{ sp ? sp.name : '休息日' }}</span></div>
    <div style="display: flex; gap: 4px; font-size: 11.5px; color: var(--muted); flex-wrap: wrap">
      <span v-for="x in last7" :key="x.d" :style="{ color: x.done ? 'var(--green)' : 'var(--muted)' }">
        {{ x.d.slice(5) }}{{ x.done ? ' ✓' : '' }}
      </span>
    </div>
    <div style="margin-top: 8px; font-size: 12px; color: var(--muted)">下次建议：{{ nextPart || '先建计划' }}</div>
  </div>

  <div v-if="draft.length" class="card" style="border-color: var(--green); margin-bottom: 16px">
    <div class="sect-h">
      <h2>进行中的记录</h2>
      <span class="cnt">{{ Math.round(draftVolume) }} kg</span>
      <div class="spacer" />
      <button class="mini danger" @click="draft = []">清空</button>
    </div>
    <div class="rows">
      <div v-for="(it, i) in draft" :key="i" class="row">
        <div class="body">
          <div class="title">{{ exerciseName(it.exerciseId) }}</div>
          <div class="meta">{{ it.sets.map((x) => `${x.weight}kg×${x.reps}`).join(' / ') }}</div>
        </div>
        <button class="mini danger" @click="removeSet(i)">删</button>
      </div>
    </div>
    <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap">
      <button class="btn btn-sm" @click="openAddSet">+ 加动作</button>
      <button class="btn btn-primary btn-sm" @click="finishTraining">完成并保存</button>
    </div>
  </div>

  <div class="home-wrap">
    <div>
      <section class="sect">
        <div class="sect-h"><h2>分化计划</h2><span class="cnt">绑定星期</span></div>
        <div v-if="s.fitness.split.length" style="display: grid; gap: 8px">
          <div
            v-for="p in s.fitness.split"
            :key="p.id"
            class="card card-tight"
            style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start"
          >
            <div style="min-width: 0">
              <div style="font-size: 13.5px; font-weight: 600">{{ p.name }}</div>
              <div style="font-size: 11.5px; color: var(--muted); margin-top: 3px">
                周{{ p.weekday.map((d) => ['一', '二', '三', '四', '五', '六', '日'][d]).join('、') || '未排' }}
                · {{ p.exerciseIds.map((id) => exerciseName(id)).filter(Boolean).join(' / ') || '未指定动作' }}
              </div>
            </div>
            <div style="display: flex; gap: 4px">
              <button class="mini" @click="openSplit(p)">改</button>
              <button class="mini danger" @click="removeSplit(p)">删</button>
            </div>
          </div>
        </div>
        <EmptyState v-else title="还没有训练计划" desc="用推 / 拉 / 腿模板一键生成" action="生成模板" @action="genTemplate" />
      </section>

      <section class="sect">
        <div class="sect-h">
          <h2>体重与围度</h2>
          <span class="cnt">{{ s.fitness.metrics.length }}</span>
          <div class="spacer" />
          <button class="mini" @click="openMetric">+ 记一次</button>
        </div>
        <div v-if="s.fitness.metrics.length" class="card flush tbl-wrap">
          <table class="tbl">
            <thead>
              <tr><th>日期</th><th class="num">体重</th><th class="num">腰</th><th class="num">胸</th><th class="num">臂</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in s.fitness.metrics.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)" :key="m.id">
                <td>{{ m.date }}</td>
                <td class="num">{{ m.weight ?? '—' }}</td>
                <td class="num">{{ m.waist ?? '—' }}</td>
                <td class="num">{{ m.chest ?? '—' }}</td>
                <td class="num">{{ m.arm ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="card" style="color: var(--muted); font-size: 13px">还没有体测记录</div>
      </section>
    </div>

    <div>
      <section class="sect">
        <div class="sect-h"><h2>最近训练</h2><span class="cnt">{{ sessions.length }}</span></div>
        <div v-if="sessions.length" class="card flush">
          <div class="rows">
            <div v-for="x in sessions.slice(0, 6)" :key="x.id" class="row">
              <div class="body">
                <div class="title">
                  {{ s.fitness.split.find((p) => p.id === x.splitId)?.name || '训练' }}
                  <span style="font-size: 11.5px; color: var(--muted)">{{ relDay(x.date) }}</span>
                </div>
                <div class="meta">
                  <span>{{ sum(x.entries, (e) => e.sets.length) }} 组</span>
                  <span>{{ Math.round(sessionVolume(x)) }} kg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="card" style="color: var(--muted); font-size: 13px">还没有训练记录</div>
      </section>

      <section class="sect">
        <div class="sect-h">
          <h2>动作库</h2>
          <span class="cnt">{{ s.fitness.exercises.length }}</span>
          <div class="spacer" />
          <button class="mini" @click="openExercise">+ 新动作</button>
        </div>
        <div class="card">
          <div class="chips">
            <span v-for="e in s.fitness.exercises" :key="e.id" class="chip">{{ e.name }}<span style="color: var(--muted)"> · {{ e.part }}</span></span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>