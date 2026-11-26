<!--
  文件：src/views/HomeView.vue
  说明：今日总览页。聚合今日焦点、今日待办、各模块摘要、快速备忘与今日状态；以只读汇总为主，写操作回到对应模块。
  结构：页头问候与日期 → 三日待办带 → 今日焦点（专注统计 + 今日待办）→ 各模块摘要 → 快速备忘 → 今日状态
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import KpiCard from '@/components/KpiCard.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { focusItems, habitsDueOn, todayHabits, isChecked, todaySplit, maxStreak } from '@/utils/selectors'
import { todayFocusStats } from '@/services/focus'
import { PAGE_MAP } from '@/constants/nav'
import type { PageKey } from '@/constants/nav'
import { WEEK, mmdd, relDay, shiftYMD, todayStr, weekRange, weekdayOf, fmtTime } from '@/utils/date'
import { analyzeIdeaTags } from '@/utils/ideaTags'
import { nowISO, sum, uid, domainLabel, TASK_DOMAIN_OPTIONS } from '@/utils/misc'
import type { TaskDomain } from '@/types'
import { playerState, initMusic } from '@/services/music'

const store = useDeskStore()
const ui = useUiStore()
const router = useRouter()

const today = todayStr()
const days = [0, 1, 2].map((i) => shiftYMD(today, i))
const s = computed(() => store.data)
initMusic()

const greeting = computed(() => {
  const h = new Date().getHours()
  const base = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
  const name = store.data.general.nickname.trim()
  return name ? `${base}，${name}` : base
})

const items = computed(() => focusItems(s.value))
const fs = computed(() => todayFocusStats())
const habits = computed(() => todayHabits(s.value))
const habitDone = computed(() => habits.value.filter((h) => isChecked(s.value, h.id, today)).length)
const fitWeek = computed(() => {
  const { start, end } = weekRange()
  return s.value.fitness.sessions.filter((x) => x.date >= start && x.date <= end).length
})
const sp = computed(() => todaySplit(s.value))
const projectsActive = computed(() => s.value.output.projects.filter((p) => p.status === 'active').length)
const mediaWeek = computed(() => {
  const { start, end } = weekRange()
  return s.value.media.items.filter((i) => i.planDate >= start && i.planDate <= end && i.status !== 'published').length
})
const blocked = computed(() => s.value.output.tickets.filter((t) => t.blocked && t.status !== 'done').length)
const doingTopics = computed(() => s.value.learning.topics.filter((t) => t.status === 'doing'))
const learnPage = computed(() => {
  const track = s.value.learning.tracks.find((t) => t.id === doingTopics.value[0]?.trackId)
  return track?.domain === 'dev' ? 'dev' : 'learning'
})
const learnMin = computed(() => {
  const { start } = weekRange()
  const recentLogs = s.value.learning.logs.filter((t) => t.date >= start)
  if (recentLogs.length) return sum(recentLogs, (t) => Number(t.minutes) || 0)
  return sum(
    s.value.learning.topics.filter((t) => t.updatedAt.slice(0, 10) >= start),
    (t) => Number(t.minutes) || 0
  )
})
const inbox = computed(() => s.value.ideas.filter((i) => !(i.bindings || []).length).length)
const watching = computed(() => s.value.leisure.filter((l) => l.status === 'watching').length)

const todayTasks = computed(() => s.value.tasks.filter((t) => !t.done && t.dueDate === today).slice(0, 6))
const recentIdeas = computed(() => s.value.ideas.filter((i) => !(i.bindings || []).length).slice(0, 3))

const perDay = computed(() =>
  days.map((d) => {
    const tc = s.value.tasks.filter((x) => !x.done && x.dueDate === d).length
    const hc = habitsDueOn(s.value, d).filter((h) => !isChecked(s.value, h.id, d)).length
    const mc = s.value.media.items.filter((x) => x.planDate === d && x.status !== 'published').length
    return { d, tc, hc, mc }
  })
)

const nextMedia = computed(() => {
  const list = s.value.media.items
    .filter((i) => i.status !== 'published' && i.planDate)
    .sort((a, b) => a.planDate.localeCompare(b.planDate))
  return list[0] || null
})
const openFores = computed(() => s.value.novel.foreshadows.filter((f) => f.status !== 'recovered').length)
const blockedTickets = computed(() => s.value.output.tickets.filter((t) => t.blocked && t.status !== 'done'))

/**
 * 打开新建任务弹窗；首页新建后回到待办页继续编辑。
 */
function openTaskForm() {
  ui.openForm({
    title: '新建任务',
    fields: [
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
    ],
    values: { title: '', dueDate: today, domain: 'dev', priority: 'mid', note: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('任务名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        st.tasks.unshift({
          id: uid(),
          title: String(v.title).trim(),
          note: String(v.note || ''),
          dueDate: String(v.dueDate || today),
          domain: v.domain as TaskDomain,
          priority: v.priority as 'high' | 'mid' | 'low',
          done: false,
          doneAt: null,
          createdAt: nowISO(),
          updatedAt: nowISO()
        })
      })
      ui.toast('已新增任务')
    }
  })
}

/**
 * 勾选/撤销今日待办；写完成时间后由 store 自动落盘。
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

/**
 * 快速备忘：写入 summaries 并清空输入，不打断当前浏览。
 */
function quickSave() {
  const el = document.getElementById('quickInput') as HTMLInputElement | null
  const text = (el?.value || '').trim()
  if (!text) {
    ui.toast('先写点什么', 'err')
    return
  }
  const auto = analyzeIdeaTags({ kind: 'text', text })
  store.commit((st) => {
    st.ideas.unshift({
      id: uid(),
      kind: 'text',
      text,
      title: '',
      url: '',
      image: '',
      tags: [],
      categories: auto.categories,
      subcategories: auto.subcategories,
      keywords: auto.keywords,
      source: 'quick',
      capturedAt: nowISO(),
      bindings: []
    })
  })
  if (el) el.value = ''
  ui.toast('已存入灵感收件箱')
}

/**
 * 按日期跳转到待办页，用 query 参数带上筛选日期。
 */
function goTaskFilter(date: string) {
  void router.push({ path: '/tasks', query: { date } })
}

function goPage(page: PageKey) {
  void router.push(page === 'home' ? '/' : `/${page}`)
}
</script>

<template>
  <PageHeader :title="greeting" :subtitle="`${today.replace(/-/g, '.')} 周${WEEK[weekdayOf(today)]}`">
    <template #actions>
      <span style="font-size: 12px; color: var(--muted)">今日焦点 {{ items.length }}/3</span>
    </template>
  </PageHeader>

  <div class="threeday">
    <button
      v-for="(cell, i) in perDay"
      :key="cell.d"
      class="td-cell"
      :class="{ 'is-today': cell.d === today }"
      @click="goTaskFilter(cell.d)"
    >
      <div class="td-day">{{ i === 0 ? '今天' : i === 1 ? '明天' : '后天' }}</div>
      <div class="td-date">{{ mmdd(cell.d) }} <span style="font-size: 11px; color: var(--muted)">周{{ WEEK[weekdayOf(cell.d)] }}</span></div>
      <div class="td-meta">
        <span><span class="n">{{ cell.tc }}</span> 任务</span>
        <span><span class="n">{{ cell.hc }}</span> 待打卡</span>
        <span v-if="cell.mc"><span class="n">{{ cell.mc }}</span> 排期</span>
      </div>
    </button>
  </div>

  <div class="home-wrap">
    <div>
      <section class="sect">
        <div class="sect-h">
          <h2>今日焦点</h2>
          <span class="cnt">{{ items.length }}/3</span>
          <div class="spacer" />
          <button class="mini" @click="goPage('tasks')">全部待办 →</button>
        </div>
        <div class="card">
          <div v-if="items.length">
            <div v-for="(it, i) in items" :key="it.kind + it.id" class="focus-item">
              <div class="idx">0{{ i + 1 }}</div>
              <div class="body">
                <div class="title">{{ it.title }}</div>
                <div class="meta">
                  <span>{{ it.tag }}</span> · <span>{{ PAGE_MAP[it.page].title }}</span>
                </div>
              </div>
              <button v-if="it.kind === 'task'" class="mini primary" @click="toggleTask(it.id)">完成</button>
              <button v-else class="mini" @click="goPage(it.page)">前往</button>
            </div>
          </div>
          <div v-else style="padding: 12px 0; color: var(--muted); font-size: 13px">
            今天没有硬性安排<template v-if="doingTopics.length">，可以推进「{{ doingTopics[0].title }}」</template>。去灵感收件箱挑一条转化也不错。
          </div>
        </div>

        <div class="sect-h" style="margin-top: 18px">
          <h2>今日待办</h2>
          <span class="cnt">{{ todayTasks.length }}</span>
          <div class="spacer" />
          <button class="mini" @click="openTaskForm">+ 加一条</button>
        </div>
        <div class="card flush">
          <div v-if="todayTasks.length" class="rows">
            <div v-for="t in todayTasks" :key="t.id" class="row">
              <button class="cb" :class="{ on: t.done }" @click="toggleTask(t.id)">{{ t.done ? '✓' : '' }}</button>
              <div class="body">
                <div class="title">{{ t.title }}</div>
                <div class="meta">
                  <span>{{ relDay(t.dueDate) }}</span>
                  <span class="tag">{{ domainLabel(t.domain) }}</span>
                  <span v-if="t.priority === 'high'" class="tag red">优先</span>
                </div>
              </div>
              <div class="acts">
                <span v-if="(t.note || '').length" class="tag">有备注</span>
              </div>
            </div>
          </div>
          <div v-else style="padding: 16px; color: var(--muted); font-size: 13px">今天还没有安排任务</div>
        </div>
      </section>

      <section class="sect">
        <div class="sect-h">
          <h2>各模块摘要</h2>
          <span class="cnt">只挑要处理的</span>
        </div>
        <div class="card">
          <div class="rows">
            <div class="row" style="padding: 8px 0">
              <div class="body">
                <div class="title" style="font-size: 13px">自媒体 · 下一条排期</div>
                <div class="meta">
                  <span v-if="nextMedia">{{ nextMedia.title }} · {{ relDay(nextMedia.planDate) }}</span>
                  <span v-else>还没有排期，去选题库挑一条</span>
                </div>
              </div>
              <button class="mini" @click="goPage('media')">打开</button>
            </div>
            <div class="row" style="padding: 8px 0">
              <div class="body">
                <div class="title" style="font-size: 13px">小说 · 未回收伏笔</div>
                <div class="meta"><span>{{ openFores }} 条埋着没收</span><span>{{ s.novel.works.length }} 部作品</span></div>
              </div>
              <button class="mini" @click="goPage('novel')">打开</button>
            </div>
            <div class="row" style="padding: 8px 0">
              <div class="body">
                <div class="title" style="font-size: 13px">作品产出 · 阻塞项</div>
                <div class="meta">
                  <span v-if="blockedTickets.length">{{ blockedTickets.length }} 项被卡：{{ blockedTickets.map((t) => t.title).join('、') }}</span>
                  <span v-else>没有阻塞，{{ projectsActive }} 个项目在推进</span>
                </div>
              </div>
              <button class="mini" @click="goPage('output')">打开</button>
            </div>
            <div class="row" style="padding: 8px 0; border-bottom: 0">
              <div class="body">
                <div class="title" style="font-size: 13px">学习 · 正在学</div>
                <div class="meta">
                  <span v-if="doingTopics.length">{{ doingTopics.map((t) => t.title).join('、') }}</span>
                  <span v-else>没有进行中的知识点</span>
                </div>
              </div>
              <button class="mini" @click="goPage(learnPage)">打开</button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div>
      <section class="sect">
        <div class="sect-h">
          <h2>快速备忘</h2>
          <div class="spacer" />
          <button class="mini" @click="goPage('ideas')">收件箱 →</button>
        </div>
        <div class="quickbox">
          <input id="quickInput" type="text" placeholder="想到什么，回车存进收件箱" @keydown.enter="quickSave" />
          <button class="btn btn-primary" @click="quickSave">存入</button>
        </div>
        <div v-if="recentIdeas.length" style="margin-top: 9px; display: flex; flex-direction: column; gap: 5px">
          <button
            v-for="i in recentIdeas"
            :key="i.id"
            class="mini"
            style="text-align: left; border: 0; background: none; color: var(--muted); padding: 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"
            @click="goPage('ideas')"
          >
            · {{ i.title || i.text || i.url || '图片' }}
          </button>
        </div>
      </section>

      <div class="kpis" style="margin-bottom: 18px">
        <KpiCard label="专注" :value="fs.count" unit="次专注" :sub="`今日 ${fs.minutes} 分钟`" to="/focus" />
        <KpiCard label="打卡" :value="`${habitDone}/${habits.length}`" :sub="`最长连续 ${maxStreak(s)} 天`" to="/habits" />
        <KpiCard label="健身" :value="fitWeek" unit="次" :sub="sp ? `今天：${sp.name}` : '今天休息'" to="/fitness" :tone="fitWeek >= 3 ? '' : 'warn'" />
        <KpiCard label="产出" :value="projectsActive" unit="个项目" :sub="`本周排期 ${mediaWeek}` + (blocked ? ` · 阻塞 ${blocked}` : '')" to="/output" :tone="blocked ? 'warn' : ''" />
        <KpiCard label="学习" :value="learnMin" unit="分钟" :sub="`学习中 ${doingTopics.length} 个知识点`" :to="`/${learnPage}`" />
        <KpiCard label="收件箱" :value="inbox" unit="条" :sub="`在追 ${watching} 部`" to="/ideas" />
      </div>

      <section class="sect">
        <div class="sect-h"><h2>今日状态</h2></div>
        <div class="card">
          <div style="display: flex; flex-direction: column; gap: 7px; font-size: 12.5px; color: var(--muted)">
            <div>专注：{{ fs.count }} 次 / {{ fs.minutes }} 分钟</div>
            <div>习惯：{{ habitDone }}/{{ habits.length }}，最长连续 {{ maxStreak(s) }} 天</div>
            <div>音乐：{{ playerState.playing ? `播放中 · ${playerState.current?.name || ''}` : '未播放' }}</div>
            <div>数据：{{ store.modeLabel }}，{{ store.saving ? '写入中' : store.lastSavedAt ? `已保存 ${fmtTime(store.lastSavedAt)}` : '本地尚无改动' }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>