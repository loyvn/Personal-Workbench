<!--
  文件：src/views/LearningView.vue
  说明：学习规划页。AI 视频与全栈开发双领域共用；包含路线模板、阶段推进、知识点三态、到期复习、资源库与周投入统计。
  结构：页头领域与周期 → 路线卡 → 当前阶段与今日建议 → 周投入柱状 → 知识点清单 → 到期复习 → 资源库
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { LearningStage, LearningTopic, OutputDomain, Resource, StudyLog, Track } from '@/types'
import { nowISO, uid } from '@/utils/misc'
import { shiftYMD, todayStr } from '@/utils/date'
import { templatesFor, type LearningTemplate } from '@/data/learningTemplates'

const route = useRoute()
const store = useDeskStore()
const ui = useUiStore()
const sref = computed(() => store.data)

const domain = computed<OutputDomain>(() => (route.meta.domain === 'dev' ? 'dev' : 'video'))
const domainName = computed(() => (domain.value === 'dev' ? 'AI 全栈开发' : 'AI 视频创作'))
const activeTrackId = ref('')
const stageFilter = ref('all')
const showAllLogs = ref(false)

const REVIEW_GAPS = [1, 3, 7, 14]
const STATUS_ORDER: LearningTopic['status'][] = ['todo', 'doing', 'explain', 'build']
const STATUS_TEXT: Record<LearningTopic['status'], string> = {
  todo: '没开始',
  doing: '在学',
  explain: '能讲清',
  build: '能做出来'
}
const STATUS_TONE: Record<LearningTopic['status'], string> = {
  todo: 'is-todo',
  doing: 'is-doing',
  explain: 'is-explain',
  build: 'is-build'
}
const RESOURCE_TEXT: Record<Resource['type'], string> = {
  course: '课程',
  book: '书',
  doc: '文档',
  video: '视频'
}

const tracks = computed(() =>
  sref.value.learning.tracks.filter((x) => x.domain === domain.value)
)
const templates = computed(() => templatesFor(domain.value))
const availableTemplates = computed(() =>
  templates.value.filter((t) => !sref.value.learning.tracks.some((x) => x.templateId === t.id))
)
const currentTrack = computed<Track | null>(() => {
  const byId = tracks.value.find((x) => x.id === activeTrackId.value)
  return byId || tracks.value[0] || null
})

function ensureTrack() {
  const valid = tracks.value.some((x) => x.id === activeTrackId.value)
  if (!valid) activeTrackId.value = tracks.value[0]?.id || ''
  if (stageFilter.value !== 'all' && !stageRows.value.some((x) => x.name === stageFilter.value)) {
    stageFilter.value = 'all'
  }
}
watch([domain, tracks], ensureTrack)
onMounted(ensureTrack)

const stageModels = computed<LearningStage[]>(() => {
  if (!currentTrack.value) return []
  return sref.value.learning.stages
    .filter((x) => x.trackId === currentTrack.value!.id)
    .slice()
    .sort((a, b) => a.order - b.order)
})
const topics = computed(() => {
  if (!currentTrack.value) return []
  return sref.value.learning.topics.filter((x) => x.trackId === currentTrack.value!.id)
})

interface StageRow {
  id: string
  name: string
  goal: string
  outcome: string
  order: number
  real: boolean
}
const stageRows = computed<StageRow[]>(() => {
  if (stageModels.value.length) {
    const rows = stageModels.value.map((x) => ({
      id: x.id,
      name: x.name,
      goal: x.goal,
      outcome: x.outcome,
      order: x.order,
      real: true
    }))
    const known = new Set(rows.map((x) => x.name))
    const extraNames = Array.from(new Set(topics.value.map((x) => x.stage).filter((x) => x && !known.has(x))))
    return [
      ...rows,
      ...extraNames.map((name, i) => ({
        id: `derived_${name}`,
        name,
        goal: '',
        outcome: '',
        order: rows.length + i + 1,
        real: false
      }))
    ]
  }
  const fallback = ['基础', '进阶', '实战']
  const names = Array.from(new Set(topics.value.map((x) => x.stage).filter(Boolean)))
  return (names.length ? names : fallback).map((name, i) => ({
    id: `derived_${i}`,
    name,
    goal: '',
    outcome: '',
    order: i,
    real: false
  }))
})
const stageOptions = computed(() => {
  const names = stageRows.value.map((x) => x.name)
  return names.length ? names : ['基础', '进阶', '实战']
})
function topicStage(topic: LearningTopic) {
  return stageRows.value.find((x) => x.name === topic.stage)
}
function stageRank(topic: LearningTopic) {
  const found = topicStage(topic)
  return found ? found.order : 99
}
function stageTopics(name: string) {
  return topics.value.filter((x) => x.stage === name)
}
function stageDone(name: string) {
  return stageTopics(name).filter((x) => x.status === 'explain' || x.status === 'build').length
}
function stagePercent(name: string) {
  const list = stageTopics(name)
  return list.length ? Math.round((stageDone(name) / list.length) * 100) : 0
}
const stageCompletion = computed(() => {
  if (!stageRows.value.length) return 0
  const sum = stageRows.value.reduce((acc, x) => acc + stagePercent(x.name), 0)
  return Math.round(sum / stageRows.value.length)
})
const visibleStages = computed(() =>
  stageFilter.value === 'all' ? stageRows.value : stageRows.value.filter((x) => x.name === stageFilter.value)
)

const totalMinutes = computed(() => topics.value.reduce((sum, x) => sum + (Number(x.minutes) || 0), 0))
const masteredCount = computed(() => topics.value.filter((x) => x.status === 'explain' || x.status === 'build').length)
const masteredPercent = computed(() =>
  topics.value.length ? Math.round((masteredCount.value / topics.value.length) * 100) : 0
)
const logs = computed(() => {
  if (!currentTrack.value) return []
  return sref.value.learning.logs
    .filter((x) => x.trackId === currentTrack.value!.id)
    .slice()
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
})
const visibleLogs = computed(() => (showAllLogs.value ? logs.value : logs.value.slice(0, 6)))
const resources = computed(() => {
  if (!currentTrack.value) return []
  return sref.value.learning.resources.filter((x) => x.trackId === currentTrack.value!.id)
})

const today = computed(() => todayStr())
function dayDiff(ymd: string) {
  if (!ymd) return 0
  const d = new Date(`${ymd}T00:00:00`)
  const n = new Date(`${today.value}T00:00:00`)
  return Math.round((d.getTime() - n.getTime()) / 86400000)
}
const dueReviews = computed(() =>
  topics.value
    .filter((x) => x.nextReviewAt && (x.status === 'explain' || x.status === 'build') && dayDiff(x.nextReviewAt) <= 0)
    .slice()
    .sort((a, b) => (a.nextReviewAt > b.nextReviewAt ? 1 : -1))
)
const doingTopic = computed(() =>
  topics.value
    .filter((x) => x.status === 'doing')
    .slice()
    .sort((a, b) => (b.lastStudiedAt || b.updatedAt).localeCompare(a.lastStudiedAt || a.updatedAt))[0] || null
)
const nextTopic = computed(() =>
  topics.value
    .filter((x) => x.status === 'todo')
    .slice()
    .sort((a, b) => stageRank(a) - stageRank(b))[0] || null
)
const currentFocusStage = computed(() => {
  const incomplete = stageRows.value.find((x) => stagePercent(x.name) < 100)
  return incomplete || stageRows.value[stageRows.value.length - 1] || null
})
const dueCount = computed(() => dueReviews.value.length)
const weeklyMinutes = computed(() => {
  const start = shiftYMD(today.value, -6)
  return logs.value.filter((x) => x.date >= start).reduce((sum, x) => sum + x.minutes, 0)
})
const weekBars = computed(() => {
  const days = Array.from({ length: 7 }, (_, i) => shiftYMD(today.value, i - 6))
  const mins = days.map((d) => logs.value.filter((x) => x.date === d).reduce((sum, x) => sum + x.minutes, 0))
  const max = Math.max(...mins, 1)
  return days.map((d, i) => {
    const date = new Date(`${d}T00:00:00`)
    return {
      date: d,
      label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()],
      minutes: mins[i],
      height: mins[i] ? Math.max(10, Math.round((mins[i] / max) * 100)) : 3
    }
  })
})

function fmtMinutes(min: number) {
  if (!min) return '0 分钟'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}
function fmtDate(ymd: string) {
  return ymd ? `${ymd.slice(5, 7)}.${ymd.slice(8, 10)}` : ''
}
function deadlineText(track: Track) {
  if (!track.deadline) return '未设截止'
  const diff = dayDiff(track.deadline)
  if (diff < 0) return `已超期 ${Math.abs(diff)} 天`
  if (diff === 0) return '今天截止'
  return `还剩 ${diff} 天`
}
function reviewText(topic: LearningTopic) {
  if (!topic.nextReviewAt) return '未安排复习'
  const diff = dayDiff(topic.nextReviewAt)
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天复习`
  if (diff === 0) return '今天该复习'
  return `${diff} 天后复习`
}

const kpis = computed(() => [
  { k: '累计投入', v: fmtMinutes(totalMinutes.value), note: `${logs.value.length} 次学习记录`, tone: 'time' },
  { k: '掌握率', v: `${masteredPercent.value}%`, note: `${masteredCount.value}/${topics.value.length} 个能讲清或做出来`, tone: 'master' },
  { k: '到期复习', v: String(dueCount.value), note: dueCount.value ? '先复习再学新的' : '今天没有到期复习', tone: 'review' },
  { k: '阶段完成度', v: `${stageCompletion.value}%`, note: `${stageRows.value.length} 个阶段`, tone: 'stage' }
])

/* ---------- 计时 ---------- */
const activeSession = ref<{ topicId: string; startedAt: number } | null>(null)
const timerNow = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
const activeTopic = computed(() =>
  activeSession.value ? sref.value.learning.topics.find((x) => x.id === activeSession.value!.topicId) || null : null
)
const elapsedSeconds = computed(() =>
  activeSession.value ? Math.max(1, Math.floor((timerNow.value - activeSession.value.startedAt) / 1000)) : 0
)
const elapsedText = computed(() => {
  const sec = elapsedSeconds.value
  const m = Math.floor(sec / 60)
  const rest = sec % 60
  return `${String(m).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
})
/**
 * 开始知识点计时，记录开始时刻；同一时间只允许一个知识点在计时。
 */
function startTimer(topic: LearningTopic) {
  if (activeSession.value && activeSession.value.topicId !== topic.id) {
    ui.toast('先结束当前这段学习，再开始新的', 'err')
    return
  }
  activeSession.value = { topicId: topic.id, startedAt: Date.now() }
  timerNow.value = Date.now()
  if (timer) clearInterval(timer)
  timer = setInterval(() => (timerNow.value = Date.now()), 1000)
  if (topic.status === 'todo') topic.status = 'doing'
  topic.lastStudiedAt = today.value
  topic.updatedAt = nowISO()
}
/**
 * 结束计时并按分钟写学习记录，可选择保存或丢弃本次。
 */
function stopTimer(save: boolean) {
  if (!activeSession.value) return
  const topic = activeTopic.value
  const minutes = Math.max(1, Math.ceil(elapsedSeconds.value / 60))
  activeSession.value = null
  if (timer) clearInterval(timer)
  timer = undefined
  if (!topic) return
  if (!save) return
  openStudyLog(topic, minutes)
}
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

/* ---------- 路线 ---------- */
function openTrack(item?: Track) {
  if (!item && !currentTrack.value && !tracks.value.length) {
    // 没有路线时也能从空白建起来
  }
  ui.openForm({
    title: item ? '编辑学习路线' : '新建学习路线',
    submitText: item ? '保存' : '创建',
    fields: [
      { key: 'name', label: '路线名称', placeholder: '例如：我的视频出片路线' },
      { key: 'goal', label: '能验证的结果', placeholder: '例如：独立完成 3 条可发布短片', type: 'textarea' },
      { key: 'deadline', label: '截止日期', type: 'date' }
    ],
    values: {
      name: item?.name || '',
      goal: item?.goal || '',
      deadline: item?.deadline || shiftYMD(today.value, 84)
    },
    onSubmit(v) {
      const name = String(v.name || '').trim()
      if (!name) {
        ui.toast('先写一个路线名称', 'err')
        return false
      }
      const goal = String(v.goal || '').trim()
      const deadline = String(v.deadline || '')
      if (item) {
        item.name = name
        item.goal = goal
        item.deadline = deadline
      } else {
        const trackId = uid()
        sref.value.learning.tracks.push({
          id: trackId,
          domain: domain.value,
          name,
          goal,
          deadline,
          createdAt: nowISO()
        })
        defaultStages().forEach((x, i) => {
          sref.value.learning.stages.push({
            id: uid(),
            trackId,
            name: x.name,
            goal: x.goal,
            outcome: x.outcome,
            order: i + 1,
            createdAt: nowISO()
          })
        })
        activeTrackId.value = trackId
      }
      ui.toast(item ? '路线已更新' : '路线已创建')
      return true
    }
  })
}
function defaultStages() {
  return [
    { name: '基础', goal: '补齐必要概念', outcome: '完成一个基础练习' },
    { name: '进阶', goal: '把知识串起来用', outcome: '完成一个综合练习' },
    { name: '实战', goal: '按真实交付标准做', outcome: '产出一个可展示的作品' }
  ]
}
function deleteTrack(track: Track) {
  ui.askConfirm({
    title: '删除这条路线',
    message: `路线「${track.name}」下的阶段、知识点、学习记录和资源都会一起删除，且不可恢复。`,
    confirmText: '删除路线',
    danger: true,
    onConfirm() {
      const id = track.id
      sref.value.learning.tracks = sref.value.learning.tracks.filter((x) => x.id !== id)
      sref.value.learning.stages = sref.value.learning.stages.filter((x) => x.trackId !== id)
      sref.value.learning.topics = sref.value.learning.topics.filter((x) => x.trackId !== id)
      sref.value.learning.logs = sref.value.learning.logs.filter((x) => x.trackId !== id)
      sref.value.learning.resources = sref.value.learning.resources.filter((x) => x.trackId !== id)
      activeTrackId.value = tracks.value[0]?.id || ''
      ui.toast('路线已删除')
    }
  })
}

function chooseTemplate() {
  if (!availableTemplates.value.length) {
    ui.toast('该领域的内置路线已经导入过了', 'err')
    return
  }
  if (!tracks.value.length && availableTemplates.value.length === 1) {
    importTemplate(availableTemplates.value[0])
    return
  }
  ui.openForm({
    title: '导入路线模板',
    submitText: '查看并导入',
    fields: [
      {
        key: 'tpl',
        label: '选择模板',
        type: 'select',
        options: availableTemplates.value.map((x) => ({ value: x.id, label: x.name }))
      }
    ],
    values: { tpl: availableTemplates.value[0]?.id || '' },
    onSubmit(v) {
      const tpl = templates.value.find((x) => x.id === String(v.tpl))
      if (tpl) importTemplate(tpl)
      return true
    }
  })
}
/**
 * 把 12/16 周模板展开成路线、阶段和知识点，已有同模板路线时先提示。
 */
function importTemplate(tpl: LearningTemplate) {
  ui.askConfirm({
    title: '导入这条路线',
    message: `${tpl.name}会生成 ${tpl.stages.length} 个阶段、${tpl.stages.reduce((n, x) => n + x.topics.length, 0)} 个知识点，后续都可以改。`,
    confirmText: '导入路线',
    onConfirm() {
      if (sref.value.learning.tracks.some((x) => x.templateId === tpl.id)) {
        ui.toast('该模板已经导入过了', 'err')
        return
      }
      const trackId = uid()
      sref.value.learning.tracks.push({
        id: trackId,
        domain: tpl.domain,
        name: tpl.name,
        goal: tpl.goal,
        deadline: shiftYMD(today.value, tpl.weeks * 7),
        templateId: tpl.id,
        createdAt: nowISO()
      })
      tpl.stages.forEach((stage, si) => {
        sref.value.learning.stages.push({
          id: uid(),
          trackId,
          name: stage.name,
          goal: stage.goal,
          outcome: stage.outcome,
          order: si + 1,
          createdAt: nowISO()
        })
        stage.topics.forEach((topic) => {
          sref.value.learning.topics.push({
            id: uid(),
            trackId,
            stage: stage.name,
            title: topic.title,
            status: 'todo',
            minutes: 0,
            estMinutes: topic.estMinutes,
            note: '',
            prerequisite: '',
            artifact: stage.outcome,
            lastStudiedAt: '',
            nextReviewAt: '',
            reviewCount: 0,
            updatedAt: nowISO()
          })
        })
      })
      activeTrackId.value = trackId
      stageFilter.value = 'all'
      ui.toast(`已导入 ${tpl.name}`)
    }
  })
}

function openStage(item?: StageRow) {
  if (!currentTrack.value) return
  ui.openForm({
    title: item?.real ? '编辑阶段' : '新增阶段',
    submitText: '保存',
    fields: [
      { key: 'name', label: '阶段名称', placeholder: '例如：基础表达' },
      { key: 'goal', label: '这个阶段练什么', type: 'textarea', placeholder: '用一句话说清楚能力目标' },
      { key: 'outcome', label: '交出什么来验收', type: 'textarea', placeholder: '例如：一份可拍的分镜脚本' }
    ],
    values: {
      name: item?.name || '',
      goal: item?.goal || '',
      outcome: item?.outcome || ''
    },
    onSubmit(v) {
      const name = String(v.name || '').trim()
      if (!name) {
        ui.toast('阶段需要一个名称', 'err')
        return false
      }
      const same = stageRows.value.find((x) => x.name === name && (!item?.real || x.id !== item.id))
      if (same) {
        ui.toast('已经有同名阶段了', 'err')
        return false
      }
      const goal = String(v.goal || '').trim()
      const outcome = String(v.outcome || '').trim()
      if (item?.real) {
        const real = sref.value.learning.stages.find((x) => x.id === item.id)
        if (real) {
          real.name = name
          real.goal = goal
          real.outcome = outcome
        }
        const oldName = item.name
        if (oldName !== name) {
          topics.value.forEach((x) => {
            if (x.stage === oldName) x.stage = name
          })
          if (stageFilter.value === oldName) stageFilter.value = name
        }
      } else {
        sref.value.learning.stages.push({
          id: uid(),
          trackId: currentTrack.value!.id,
          name,
          goal,
          outcome,
          order: stageModels.value.length + 1,
          createdAt: nowISO()
        })
      }
      ui.toast('阶段已保存')
      return true
    }
  })
}

/* ---------- 知识点 ---------- */
function openTopic(item?: LearningTopic) {
  if (!currentTrack.value) return
  const defaultStage = stageFilter.value !== 'all' ? stageFilter.value : stageOptions.value[0]
  ui.openForm({
    title: item ? '编辑知识点' : '新增知识点',
    submitText: item ? '保存' : '加入路线',
    fields: [
      { key: 'title', label: '知识点', placeholder: '例如：首尾帧与镜头衔接' },
      {
        key: 'stage',
        label: '所属阶段',
        type: 'select',
        options: stageOptions.value.map((x) => ({ value: x, label: x }))
      },
      {
        key: 'status',
        label: '掌握程度',
        type: 'select',
        options: STATUS_ORDER.map((x) => ({ value: x, label: STATUS_TEXT[x] }))
      },
      { key: 'estMinutes', label: '预计分钟', type: 'number', min: 0, max: 100000 },
      { key: 'prerequisite', label: '前置知识点', placeholder: '先学过什么，才能学这个', span: true },
      { key: 'artifact', label: '怎么算学会', placeholder: '例如：能独立生成一组连续镜头', span: true },
      { key: 'note', label: '笔记与卡点', type: 'textarea', span: true }
    ],
    values: {
      title: item?.title || '',
      stage: item?.stage || defaultStage,
      status: item?.status || 'todo',
      estMinutes: item?.estMinutes || 60,
      prerequisite: item?.prerequisite || '',
      artifact: item?.artifact || '',
      note: item?.note || ''
    },
    onSubmit(v) {
      const title = String(v.title || '').trim()
      if (!title) {
        ui.toast('先给知识点起个名字', 'err')
        return false
      }
      const stage = String(v.stage || defaultStage)
      const status = STATUS_ORDER.includes(String(v.status) as LearningTopic['status'])
        ? (String(v.status) as LearningTopic['status'])
        : 'todo'
      const est = Math.max(0, Math.round(Number(v.estMinutes) || 0))
      const prerequisite = String(v.prerequisite || '').trim()
      const artifact = String(v.artifact || '').trim()
      const note = String(v.note || '').trim()
      if (item) {
        const prev = item.status
        item.title = title
        item.stage = stage
        item.status = status
        item.estMinutes = est
        item.prerequisite = prerequisite
        item.artifact = artifact
        item.note = note
        item.updatedAt = nowISO()
        if ((status === 'explain' || status === 'build') && prev !== status) scheduleReview(item)
      } else {
        sref.value.learning.topics.push({
          id: uid(),
          trackId: currentTrack.value!.id,
          stage,
          title,
          status,
          minutes: 0,
          estMinutes: est,
          note,
          prerequisite,
          artifact,
          lastStudiedAt: '',
          nextReviewAt: '',
          reviewCount: 0,
          updatedAt: nowISO()
        })
      }
      ui.toast(item ? '知识点已更新' : '知识点已加入路线')
      return true
    }
  })
}
/**
 * 按 1/3/7/14 天节奏安排下次复习，已掌握知识点才进入复习队列。
 */
function scheduleReview(topic: LearningTopic, baseDate = today.value) {
  const gap = REVIEW_GAPS[Math.min(topic.reviewCount, REVIEW_GAPS.length - 1)]
  topic.nextReviewAt = shiftYMD(baseDate, gap)
  topic.reviewCount += 1
}
/**
 * 在待学/学习中/已掌握之间循环，切换到已掌握时自动安排复习。
 */
function cycleStatus(topic: LearningTopic) {
  const index = STATUS_ORDER.indexOf(topic.status)
  const next = STATUS_ORDER[(index + 1) % STATUS_ORDER.length]
  const prev = topic.status
  topic.status = next
  topic.updatedAt = nowISO()
  if (next === 'doing') topic.lastStudiedAt = today.value
  if (next === 'explain' || next === 'build') {
    if (prev !== 'explain' && prev !== 'build') scheduleReview(topic)
  } else {
    topic.nextReviewAt = ''
    if (prev === 'explain' || prev === 'build') topic.reviewCount = 0
  }
  ui.toast(`已标为「${STATUS_TEXT[next]}」`)
}
function deleteTopic(topic: LearningTopic) {
  ui.askConfirm({
    title: '删除知识点',
    message: `「${topic.title}」和它的学习记录会一起删除。`,
    confirmText: '删除',
    danger: true,
    onConfirm() {
      const id = topic.id
      sref.value.learning.topics = sref.value.learning.topics.filter((x) => x.id !== id)
      sref.value.learning.logs = sref.value.learning.logs.filter((x) => x.topicId !== id)
      sref.value.learning.resources.forEach((x) => {
        if (x.topicId === id) x.topicId = undefined
      })
      ui.toast('知识点已删除')
    }
  })
}

/* ---------- 学习记录 ---------- */
function openStudyLog(topic: LearningTopic, presetMinutes = 30) {
  ui.openForm({
    title: `记录学习 · ${topic.title}`,
    submitText: '保存记录',
    fields: [
      { key: 'date', label: '日期', type: 'date' },
      { key: 'minutes', label: '这次投入分钟', type: 'number', min: 1, max: 1440 },
      {
        key: 'status',
        label: '学完之后',
        type: 'select',
        options: STATUS_ORDER.map((x) => ({ value: x, label: STATUS_TEXT[x] }))
      },
      { key: 'learned', label: '今天能讲清什么', type: 'textarea', span: true, placeholder: '用自己的话写一句，不要复制定义' },
      { key: 'blocker', label: '卡在哪里', type: 'textarea', span: true },
      { key: 'nextAction', label: '下一步做什么', type: 'textarea', span: true },
      { key: 'artifact', label: '作品或链接', placeholder: '仓库、成片、部署地址，可留空', span: true }
    ],
    values: {
      date: today.value,
      minutes: presetMinutes,
      status: topic.status === 'todo' ? 'doing' : topic.status,
      learned: '',
      blocker: '',
      nextAction: '',
      artifact: ''
    },
    onSubmit(v) {
      const learned = String(v.learned || '').trim()
      if (!learned) {
        ui.toast('写一句今天真正能讲清的内容', 'err')
        return false
      }
      const minutes = Math.max(1, Math.min(1440, Math.round(Number(v.minutes) || 1)))
      const date = String(v.date || today.value)
      const status = STATUS_ORDER.includes(String(v.status) as LearningTopic['status'])
        ? (String(v.status) as LearningTopic['status'])
        : topic.status
      const prev = topic.status
      sref.value.learning.logs.push({
        id: uid(),
        trackId: topic.trackId,
        topicId: topic.id,
        date,
        minutes,
        learned,
        blocker: String(v.blocker || '').trim(),
        nextAction: String(v.nextAction || '').trim(),
        artifact: String(v.artifact || '').trim(),
        createdAt: nowISO()
      })
      topic.minutes += minutes
      topic.lastStudiedAt = date
      topic.status = status
      topic.updatedAt = nowISO()
      if (String(v.artifact || '').trim()) topic.artifact = String(v.artifact || '').trim()
      if (status === 'explain' || status === 'build') {
        if (prev !== status || !topic.nextReviewAt) scheduleReview(topic, date)
      } else {
        topic.nextReviewAt = ''
        if (prev === 'explain' || prev === 'build') topic.reviewCount = 0
      }
      ui.toast(`已记录 ${minutes} 分钟`)
      return true
    }
  })
}
function openReview(topic: LearningTopic) {
  ui.openForm({
    title: `复习 · ${topic.title}`,
    submitText: '保存复习',
    fields: [
      {
        key: 'result',
        label: '这次复习的结果',
        type: 'select',
        options: [
          { value: 'clear', label: '还能讲清' },
          { value: 'vague', label: '已经模糊' },
          { value: 'relearn', label: '需要重学' }
        ]
      },
      { key: 'minutes', label: '复习分钟', type: 'number', min: 1, max: 600 },
      { key: 'learned', label: '还能讲清的部分', type: 'textarea', span: true, placeholder: '写一句现在还能复述的内容' }
    ],
    values: { result: 'clear', minutes: 10, learned: '' },
    onSubmit(v) {
      const result = String(v.result || 'clear')
      const minutes = Math.max(1, Math.min(600, Math.round(Number(v.minutes) || 1)))
      const learned = String(v.learned || '').trim() || (result === 'clear' ? '复习后仍能讲清' : '复习时发现需要补')
      sref.value.learning.logs.push({
        id: uid(),
        trackId: topic.trackId,
        topicId: topic.id,
        date: today.value,
        minutes,
        learned: `复习：${learned}`,
        blocker: result === 'clear' ? '' : result === 'vague' ? '记忆已经模糊' : '基本讲不清，需要重学',
        nextAction: result === 'clear' ? '按下次复习日期回来' : result === 'vague' ? '明天补一遍' : '重新排进在学',
        artifact: '',
        createdAt: nowISO()
      })
      topic.minutes += minutes
      topic.lastStudiedAt = today.value
      topic.updatedAt = nowISO()
      if (result === 'clear') {
        topic.status = 'explain'
        scheduleReview(topic)
      } else if (result === 'vague') {
        topic.status = 'explain'
        topic.nextReviewAt = shiftYMD(today.value, 1)
      } else {
        topic.status = 'doing'
        topic.nextReviewAt = ''
        topic.reviewCount = 0
      }
      ui.toast('复习结果已记录')
      return true
    }
  })
}
function deleteLog(log: StudyLog) {
  ui.askConfirm({
    title: '删除一条学习记录',
    message: `删除 ${fmtDate(log.date)} 的 ${log.minutes} 分钟记录，知识点累计时长不会自动回退。`,
    confirmText: '删除记录',
    danger: true,
    onConfirm() {
      sref.value.learning.logs = sref.value.learning.logs.filter((x) => x.id !== log.id)
      ui.toast('记录已删除')
    }
  })
}

/* ---------- 资源 ---------- */
function openResource(item?: Resource) {
  if (!currentTrack.value) return
  ui.openForm({
    title: item ? '编辑资源' : '添加资源',
    submitText: item ? '保存' : '添加',
    fields: [
      { key: 'title', label: '资源名称' },
      {
        key: 'type',
        label: '类型',
        type: 'select',
        options: [
          { value: 'course', label: '课程' },
          { value: 'book', label: '书' },
          { value: 'doc', label: '文档' },
          { value: 'video', label: '视频' }
        ]
      },
      { key: 'topicId', label: '关联知识点', type: 'select', options: [{ value: '', label: '不关联' }, ...topics.value.map((x) => ({ value: x.id, label: x.title }))], span: true },
      { key: 'url', label: '链接', placeholder: '课程、文档或视频地址', span: true },
      { key: 'estMinutes', label: '预计分钟', type: 'number', min: 0, max: 100000 }
    ],
    values: {
      title: item?.title || '',
      type: item?.type || 'course',
      topicId: item?.topicId || '',
      url: item?.url || '',
      estMinutes: item?.estMinutes || 60
    },
    onSubmit(v) {
      const title = String(v.title || '').trim()
      if (!title) {
        ui.toast('给资源写个名字', 'err')
        return false
      }
      const type = ['course', 'book', 'doc', 'video'].includes(String(v.type)) ? (String(v.type) as Resource['type']) : 'doc'
      const topicId = String(v.topicId || '')
      const url = String(v.url || '').trim()
      const estMinutes = Math.max(0, Math.round(Number(v.estMinutes) || 0))
      if (item) {
        item.title = title
        item.type = type
        item.topicId = topicId || undefined
        item.url = url
        item.estMinutes = estMinutes
      } else {
        sref.value.learning.resources.push({
          id: uid(),
          trackId: currentTrack.value!.id,
          topicId: topicId || undefined,
          title,
          type,
          url,
          estMinutes,
          consumed: false
        })
      }
      ui.toast(item ? '资源已更新' : '资源已添加')
      return true
    }
  })
}
function deleteResource(item: Resource) {
  ui.askConfirm({
    title: '删除资源',
    message: `删除「${item.title}」。`,
    confirmText: '删除',
    danger: true,
    onConfirm() {
      sref.value.learning.resources = sref.value.learning.resources.filter((x) => x.id !== item.id)
      ui.toast('资源已删除')
    }
  })
}
function isLink(value: string) {
  return /^https?:\/\//i.test(value)
}
function linkedTopic(item: Resource) {
  return topics.value.find((x) => x.id === item.topicId)
}
</script>

<template>
  <section class="page learn-page">
    <PageHeader
      :title="domainName"
      :subtitle="`${tracks.length ? '能讲清楚，也能做出来' : '从一条可验收的路线开始'} · ${templates.length ? (domain === 'video' ? '12 周路线' : '16 周路线') : ''}`"
    >
      <template #actions>
        <button v-if="availableTemplates.length" class="btn btn-ghost" @click="chooseTemplate">导入路线模板</button>
        <button class="btn btn-primary" @click="openTrack()">新建路线</button>
      </template>
    </PageHeader>

    <div v-if="!currentTrack" class="card empty-route">
      <div class="empty-head">
        <span class="eyebrow">{{ domain === 'video' ? 'AI 视频创作' : 'AI 全栈开发' }}</span>
        <h2>先把学习变成一条有验收的路线</h2>
        <p>不建议继续堆零散知识点。选一条内置路线，软件会自动拆好阶段、知识点和阶段作品，你只需要按顺序学习和记录。</p>
      </div>
      <div v-if="availableTemplates.length" class="template-list">
        <div v-for="tpl in availableTemplates" :key="tpl.id" class="template-card">
          <div class="template-main">
            <h3>{{ tpl.name }}</h3>
            <p>{{ tpl.summary }}</p>
            <div class="template-meta">
              <span>{{ tpl.stages.length }} 个阶段</span>
              <span>{{ tpl.stages.reduce((n, x) => n + x.topics.length, 0) }} 个知识点</span>
              <span>{{ tpl.weeks }} 周</span>
            </div>
          </div>
          <button class="btn btn-primary" @click="importTemplate(tpl)">导入这条路线</button>
        </div>
      </div>
      <div class="empty-foot">
        <button class="btn btn-ghost" @click="openTrack()">或者手动建一条路线</button>
      </div>
    </div>

    <template v-else>
      <div class="card route-bar">
        <div class="route-chips">
          <button
            v-for="track in tracks"
            :key="track.id"
            class="route-chip"
            :class="{ on: track.id === currentTrack.id }"
            @click="activeTrackId = track.id"
          >
            <span>{{ track.name }}</span>
            <small>{{ deadlineText(track) }}</small>
          </button>
          <button v-if="availableTemplates.length" class="route-add" @click="chooseTemplate">+ 模板</button>
          <button class="route-add" @click="openTrack()">+ 路线</button>
        </div>
        <div class="route-actions">
          <button class="icon-btn" title="编辑路线" @click="openTrack(currentTrack)">编辑</button>
          <button class="icon-btn danger" title="删除路线" @click="deleteTrack(currentTrack)">删除</button>
        </div>
        <p class="route-goal">
          <span>目标</span>{{ currentTrack.goal || '还没写目标。补一句能验证的结果，路线才有终点。' }}
        </p>
      </div>

      <div class="kpis learn-kpis">
        <div v-for="k in kpis" :key="k.k" class="kpi" :class="`kpi-${k.tone}`">
          <div class="kpi-k">{{ k.k }}</div>
          <div class="kpi-v">{{ k.v }}</div>
          <div class="kpi-note">{{ k.note }}</div>
        </div>
      </div>

      <div class="card today-card">
        <div class="section-head">
          <div>
            <span class="eyebrow">今日学习</span>
            <h2>{{ currentFocusStage ? `当前阶段：${currentFocusStage.name}` : '今天从最小一步开始' }}</h2>
          </div>
          <div class="week-mini">
            <span v-for="d in weekBars" :key="d.date" class="week-col" :title="`${d.date} · ${d.minutes} 分钟`">
              <i :style="{ height: `${d.height}%` }" :class="{ on: d.minutes > 0 }"></i>
              <small>{{ d.label }}</small>
            </span>
            <em>本周 {{ fmtMinutes(weeklyMinutes) }}</em>
          </div>
        </div>

        <div v-if="activeSession" class="timer-strip">
          <div class="timer-dot"></div>
          <div class="timer-main">
            <strong>{{ activeTopic?.title || '正在学习' }}</strong>
            <small>计时中，结束后直接写记录，不用自己记分钟</small>
          </div>
          <div class="timer-time">{{ elapsedText }}</div>
          <button class="btn btn-primary small" @click="stopTimer(true)">结束并记录</button>
          <button class="btn btn-ghost small" @click="stopTimer(false)">取消</button>
        </div>

        <div class="today-grid">
          <div class="today-item">
            <span class="today-tag">继续在学</span>
            <h3>{{ doingTopic?.title || '没有进行中的知识点' }}</h3>
            <p v-if="doingTopic">
              已投入 {{ fmtMinutes(doingTopic.minutes) }} · 预计 {{ doingTopic.estMinutes }} 分钟
            </p>
            <p v-else>从下面挑一个“没开始”的知识点，点开始学习就会进入在学。</p>
            <div class="today-actions">
              <button v-if="doingTopic" class="btn btn-primary small" @click="startTimer(doingTopic)">开始计时</button>
              <button v-if="doingTopic" class="btn btn-ghost small" @click="openStudyLog(doingTopic, 30)">直接记录</button>
              <button v-if="doingTopic" class="btn btn-ghost small" @click="openTopic(doingTopic)">编辑</button>
            </div>
          </div>

          <div class="today-item">
            <span class="today-tag review">到期复习</span>
            <h3>{{ dueReviews.length ? `${dueReviews.length} 个知识点到期` : '今天没有到期复习' }}</h3>
            <p v-if="dueReviews.length">{{ dueReviews[0].title }} · {{ reviewText(dueReviews[0]) }}</p>
            <p v-else>掌握后的知识点会按 1 / 3 / 7 / 14 天自动回来。</p>
            <div class="today-actions">
              <button v-if="dueReviews.length" class="btn btn-primary small" @click="openReview(dueReviews[0])">开始复习</button>
              <button v-if="dueReviews.length" class="btn btn-ghost small" @click="stageFilter = dueReviews[0].stage; showAllLogs = false">
                看知识清单
              </button>
            </div>
          </div>

          <div class="today-item">
            <span class="today-tag new">今天该做的小练习</span>
            <h3>{{ nextTopic?.title || '没有待开始的知识点' }}</h3>
            <p v-if="currentFocusStage?.outcome">阶段要交出的东西：{{ currentFocusStage.outcome }}</p>
            <p v-else-if="nextTopic">预计 {{ nextTopic.estMinutes }} 分钟，先做一个最小练习。</p>
            <p v-else>当前路线没有未开始的知识点，可以补一个或去复盘。</p>
            <div class="today-actions">
              <button v-if="nextTopic" class="btn btn-primary small" @click="startTimer(nextTopic)">开始这个</button>
              <button v-if="nextTopic" class="btn btn-ghost small" @click="openTopic(nextTopic)">编辑</button>
              <button class="btn btn-ghost small" @click="openTopic()">+ 知识点</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card route-map">
        <div class="section-head">
          <div>
            <span class="eyebrow">课程路线图</span>
            <h2>从基础到作品，每一段都有验收</h2>
          </div>
          <div class="map-actions">
            <button class="btn btn-ghost small" @click="stageFilter = 'all'">看全部</button>
            <button class="btn btn-ghost small" @click="openStage()">+ 阶段</button>
          </div>
        </div>
        <div class="stages">
          <div
            v-for="(stage, i) in stageRows"
            :key="stage.id"
            class="stage-card"
            :class="{ on: stageFilter === stage.name }"
            @click="stageFilter = stageFilter === stage.name ? 'all' : stage.name"
          >
            <div class="stage-top">
              <span class="stage-no">0{{ i + 1 }}</span>
              <span class="stage-pct">{{ stagePercent(stage.name) }}%</span>
            </div>
            <h3>{{ stage.name }}</h3>
            <p class="stage-goal">{{ stage.goal || '还没有写这个阶段练什么' }}</p>
            <div class="stage-outcome">
              <span>交出</span>{{ stage.outcome || '还没有写验收作品' }}
            </div>
            <div class="stage-progress"><i :style="{ width: `${stagePercent(stage.name)}%` }"></i></div>
            <div class="stage-foot">
              <span>{{ stageDone(stage.name) }}/{{ stageTopics(stage.name).length }} 个掌握</span>
              <button v-if="stage.real" class="mini-link" @click.stop="openStage(stage)">编辑</button>
            </div>
          </div>
        </div>
      </div>

      <div class="learn-columns">
        <div class="learn-main">
          <div class="card topic-card">
            <div class="section-head">
              <div>
                <span class="eyebrow">知识点清单</span>
                <h2>{{ stageFilter === 'all' ? '按阶段逐个拿下' : `只看「${stageFilter}」` }}</h2>
              </div>
              <div class="map-actions">
                <button v-if="stageFilter !== 'all'" class="btn btn-ghost small" @click="stageFilter = 'all'">清除筛选</button>
                <button class="btn btn-primary small" @click="openTopic()">+ 知识点</button>
              </div>
            </div>

            <div v-if="!topics.length" class="soft-empty">
              <p>这条路线还没有知识点。导入模板或先加一个最想学的。</p>
              <div class="today-actions">
                <button v-if="availableTemplates.length" class="btn btn-primary small" @click="chooseTemplate">导入模板</button>
                <button class="btn btn-ghost small" @click="openTopic()">手动添加</button>
              </div>
            </div>

            <div v-else class="stage-groups">
              <div v-for="stage in visibleStages" :key="stage.id" class="stage-group">
                <div class="group-head">
                  <div class="group-title">
                    <h3>{{ stage.name }}</h3>
                    <span>{{ stageDone(stage.name) }}/{{ stageTopics(stage.name).length }}</span>
                  </div>
                  <button v-if="stage.real" class="mini-link" @click="openStage(stage)">阶段设置</button>
                </div>
                <p v-if="stage.outcome" class="group-outcome">阶段验收：{{ stage.outcome }}</p>

                <div v-if="!stageTopics(stage.name).length" class="group-empty">这一阶段还没有知识点</div>
                <div v-for="topic in stageTopics(stage.name)" :key="topic.id" class="topic-row">
                  <button
                    class="status-pill"
                    :class="STATUS_TONE[topic.status]"
                    :title="`点击切换到下一个状态`"
                    @click="cycleStatus(topic)"
                  >
                    {{ STATUS_TEXT[topic.status] }}
                  </button>
                  <div class="topic-main">
                    <h4 :class="{ done: topic.status === 'explain' || topic.status === 'build' }">{{ topic.title }}</h4>
                    <div class="topic-meta">
                      <span>{{ fmtMinutes(topic.minutes) }} / 预计 {{ topic.estMinutes }} 分钟</span>
                      <span v-if="topic.prerequisite">前置：{{ topic.prerequisite }}</span>
                      <span v-if="topic.status === 'explain' || topic.status === 'build'" class="review-meta">{{ reviewText(topic) }}</span>
                    </div>
                    <p v-if="topic.artifact" class="topic-artifact">验收：{{ topic.artifact }}</p>
                    <p v-if="topic.note" class="topic-note">{{ topic.note }}</p>
                  </div>
                  <div class="topic-btns">
                    <button v-if="topic.status !== 'explain' && topic.status !== 'build'" class="btn btn-ghost tiny" @click="startTimer(topic)">开始</button>
                    <button v-if="topic.status === 'explain' || topic.status === 'build'" class="btn btn-ghost tiny" @click="openReview(topic)">复习</button>
                    <button class="btn btn-ghost tiny" @click="openStudyLog(topic, 30)">记录</button>
                    <button class="btn btn-ghost tiny" @click="openTopic(topic)">编辑</button>
                    <button class="btn btn-ghost tiny danger" @click="deleteTopic(topic)">删</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="learn-side">
          <div class="card log-card">
            <div class="section-head">
              <div>
                <span class="eyebrow">学习记录</span>
                <h2>每次留下可复用的东西</h2>
              </div>
              <span class="side-count">{{ logs.length }} 次</span>
            </div>
            <div v-if="!logs.length" class="soft-empty compact">
              <p>还没有记录。学完后写一句“今天能讲清什么”，比只看时长更有用。</p>
            </div>
            <div v-else class="log-list">
              <div v-for="log in visibleLogs" :key="log.id" class="log-item">
                <div class="log-top">
                  <span class="log-date">{{ fmtDate(log.date) }}</span>
                  <span>{{ log.minutes }} 分钟</span>
                  <button class="log-del" title="删除记录" @click="deleteLog(log)">×</button>
                </div>
                <h4>{{ topics.find((x) => x.id === log.topicId)?.title || '已删除知识点' }}</h4>
                <p>{{ log.learned }}</p>
                <p v-if="log.blocker" class="log-blocker">卡点：{{ log.blocker }}</p>
                <p v-if="log.nextAction" class="log-next">下一步：{{ log.nextAction }}</p>
                <a v-if="log.artifact && isLink(log.artifact)" class="log-artifact" :href="log.artifact" target="_blank" rel="noreferrer">{{ log.artifact }}</a>
                <p v-else-if="log.artifact" class="log-artifact-text">作品：{{ log.artifact }}</p>
              </div>
              <button v-if="logs.length > 6" class="btn btn-ghost small log-more" @click="showAllLogs = !showAllLogs">
                {{ showAllLogs ? '收起' : `看全部 ${logs.length} 条` }}
              </button>
            </div>
          </div>

          <div class="card resource-card">
            <div class="section-head">
              <div>
                <span class="eyebrow">资源库</span>
                <h2>课程和文档挂在知识点上</h2>
              </div>
              <button class="btn btn-ghost small" @click="openResource()">+ 资源</button>
            </div>
            <div v-if="!resources.length" class="soft-empty compact">
              <p>把要看的课程、文档、视频放进来，并关联到具体知识点，避免收藏了却不看。</p>
            </div>
            <div v-else class="resource-list">
              <div v-for="item in resources" :key="item.id" class="resource-item">
                <button class="resource-check" :class="{ on: item.consumed }" @click="item.consumed = !item.consumed">
                  {{ item.consumed ? '已看' : '未看' }}
                </button>
                <div class="resource-main">
                  <h4>{{ item.title }}</h4>
                  <div class="resource-meta">
                    <span>{{ RESOURCE_TEXT[item.type] }}</span>
                    <span v-if="item.estMinutes">预计 {{ item.estMinutes }} 分钟</span>
                    <span v-if="linkedTopic(item)">关联：{{ linkedTopic(item)?.title }}</span>
                  </div>
                </div>
                <div class="resource-btns">
                  <a v-if="item.url" class="mini-link" :href="item.url" target="_blank" rel="noreferrer">打开</a>
                  <button class="mini-link" @click="openResource(item)">编辑</button>
                  <button class="mini-link danger" @click="deleteResource(item)">删</button>
                </div>
              </div>
            </div>
          </div>

          <div class="card note-card">
            <span class="eyebrow">路线使用说明</span>
            <h2>按这个顺序用，不会散</h2>
            <ol class="how-list">
              <li><b>先看路线图</b><span>知道这一阶段练什么、最后交什么。</span></li>
              <li><b>从知识点开始计时</b><span>结束后写能讲清什么、卡点、下一步。</span></li>
              <li><b>掌握后按 1/3/7/14 天复习</b><span>模糊就明天补，讲不清就回到在学。</span></li>
              <li><b>用作品验收</b><span>阶段作品和资源都绑定在具体知识点上。</span></li>
            </ol>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.learn-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.empty-route {
  padding: 28px;
  display: grid;
  gap: 22px;
}
.empty-head h2 {
  margin: 8px 0 8px;
  font-size: 24px;
  letter-spacing: -0.02em;
}
.empty-head p {
  color: var(--muted);
  line-height: 1.75;
  max-width: 720px;
}
.template-list {
  display: grid;
  gap: 12px;
}
.template-card {
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 20px;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.template-main h3 {
  margin: 0 0 6px;
  font-size: 17px;
}
.template-main p {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 10px;
}
.template-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.template-meta span {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 8px;
}
.empty-foot {
  display: flex;
  gap: 10px;
}
.route-bar {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.route-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 220px;
}
.route-chip {
  border: 1px solid var(--line);
  background: transparent;
  border-radius: var(--r-sm);
  padding: 7px 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  font-size: 13px;
}
.route-chip small {
  color: var(--muted);
  font-size: 10px;
}
.route-chip.on {
  background: var(--green);
  color: var(--on-green);
  border-color: var(--green);
}
.route-chip.on small {
  color: color-mix(in srgb, var(--on-green) 70%, transparent);
}
.route-add {
  border: 1px dashed var(--line);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  padding: 7px 10px;
  font-size: 12px;
}
.route-add:hover {
  color: var(--ink);
  border-color: var(--green);
}
.route-actions {
  display: flex;
  gap: 4px;
}
.icon-btn {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 5px 6px;
  white-space: nowrap;
}
.icon-btn:hover {
  color: var(--ink);
}
.icon-btn.danger:hover {
  color: var(--red);
}
.route-goal {
  flex-basis: 100%;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
}
.route-goal span {
  color: var(--ink);
  font-weight: 600;
  flex: none;
}
.learn-kpis {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.kpi-note {
  margin-top: 6px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.today-card {
  padding: 22px;
}
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.section-head h2 {
  font-size: 18px;
  letter-spacing: -0.01em;
  margin: 5px 0 0;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.week-mini {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 42px;
}
.week-col {
  width: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  height: 100%;
}
.week-col i {
  width: 100%;
  min-height: 2px;
  background: var(--line);
  border-radius: 3px 3px 1px 1px;
}
.week-col i.on {
  background: var(--green);
  opacity: 0.72;
}
.week-col small {
  font-size: 9px;
  color: var(--muted);
}
.week-mini em {
  font-size: 10px;
  color: var(--muted);
  font-style: normal;
  margin-left: 4px;
  padding-bottom: 10px;
  white-space: nowrap;
}
.timer-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--r);
  background: var(--green-soft);
  border: 1px solid color-mix(in srgb, var(--green) 25%, transparent);
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.timer-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  50% { opacity: 0.25; }
}
.timer-main {
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.timer-main strong {
  font-size: 13px;
}
.timer-main small {
  color: var(--muted);
  font-size: 11px;
}
.timer-time {
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.today-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.today-item {
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 16px;
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.today-tag {
  align-self: flex-start;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green);
  letter-spacing: 0.05em;
}
.today-tag.review {
  background: color-mix(in srgb, var(--amber) 12%, transparent);
  color: var(--amber);
}
.today-tag.new {
  background: color-mix(in srgb, var(--ok) 10%, transparent);
  color: var(--ok);
}
.today-item h3 {
  font-size: 15px;
  margin: 2px 0 0;
  line-height: 1.45;
}
.today-item p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
  flex: 1;
}
.today-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}
.btn.small,
.btn.tiny {
  padding: 5px 9px;
  font-size: 11px;
  border-radius: var(--r-sm);
}
.btn.tiny {
  padding: 3px 7px;
  font-size: 10px;
}
.route-map {
  padding: 22px;
}
.map-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.stages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}
.stage-card {
  border: 1px solid var(--line);
  border-radius: 13px;
  padding: 14px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stage-card:hover {
  border-color: color-mix(in srgb, var(--green) 40%, var(--line));
  transform: translateY(-1px);
}
.stage-card.on {
  border-color: var(--green);
  background: var(--green-soft);
}
.stage-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stage-no {
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.08em;
}
.stage-pct {
  font-size: 11px;
  font-weight: 600;
}
.stage-card h3 {
  font-size: 15px;
  margin: 2px 0 0;
}
.stage-goal {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.55;
  margin: 0;
  min-height: 34px;
}
.stage-outcome {
  font-size: 11px;
  line-height: 1.55;
  border-left: 2px solid var(--green);
  padding-left: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stage-outcome span {
  font-size: 9px;
  color: var(--muted);
}
.stage-progress {
  height: 4px;
  border-radius: 99px;
  background: var(--line);
  overflow: hidden;
  margin-top: 6px;
}
.stage-progress i {
  display: block;
  height: 100%;
  background: var(--green);
  border-radius: inherit;
}
.stage-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--muted);
}
.mini-link {
  border: 0;
  background: transparent;
  color: var(--green);
  font-size: 11px;
  padding: 2px;
  text-decoration: none;
}
.mini-link.danger {
  color: var(--red);
}
.learn-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.learn-main,
.learn-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.topic-card,
.log-card,
.resource-card,
.note-card {
  padding: 22px;
}
.soft-empty {
  border: 1px dashed var(--line);
  border-radius: var(--r);
  padding: 22px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
.soft-empty.compact {
  padding: 16px;
}
.soft-empty p {
  margin: 0 0 10px;
}
.stage-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.stage-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
}
.group-title {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.group-title h3 {
  font-size: 14px;
  margin: 0;
}
.group-title span {
  font-size: 10px;
  color: var(--muted);
}
.group-outcome {
  font-size: 11px;
  color: var(--muted);
  margin: 0;
  line-height: 1.6;
}
.group-empty {
  font-size: 11px;
  color: var(--muted);
  padding: 8px 0;
}
.topic-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px dashed var(--line);
}
.topic-row:last-child {
  border-bottom: 0;
}
.status-pill {
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 10px;
  padding: 3px 7px;
  flex: none;
  white-space: nowrap;
  cursor: pointer;
}
.status-pill.is-todo {
  background: var(--line-soft);
  color: var(--muted);
  border-color: var(--line);
}
.status-pill.is-doing {
  background: var(--green-soft);
  color: var(--green);
}
.status-pill.is-explain {
  background: color-mix(in srgb, var(--amber) 13%, transparent);
  color: var(--amber);
}
.status-pill.is-build {
  background: color-mix(in srgb, var(--ok) 13%, transparent);
  color: var(--ok);
}
.topic-main {
  flex: 1;
  min-width: 0;
}
.topic-main h4 {
  font-size: 13px;
  margin: 0 0 4px;
  line-height: 1.45;
  font-weight: 600;
}
.topic-main h4.done {
  color: var(--muted);
}
.topic-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 10px;
  color: var(--muted);
}
.review-meta {
  color: var(--amber);
}
.topic-artifact,
.topic-note {
  font-size: 11px;
  color: var(--muted);
  margin: 5px 0 0;
  line-height: 1.55;
}
.topic-artifact {
  color: color-mix(in srgb, var(--ink) 72%, transparent);
}
.topic-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  justify-content: flex-end;
  max-width: 120px;
}
.side-count {
  font-size: 11px;
  color: var(--muted);
}
.log-list {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.log-item {
  padding-bottom: 13px;
  border-bottom: 1px dashed var(--line);
}
.log-item:last-of-type {
  border-bottom: 0;
}
.log-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--muted);
}
.log-date {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink);
}
.log-del {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
}
.log-del:hover {
  color: var(--red);
}
.log-item h4 {
  font-size: 12px;
  margin: 5px 0 4px;
}
.log-item p {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
}
.log-blocker {
  color: var(--red) !important;
  margin-top: 3px !important;
}
.log-next {
  color: var(--ink) !important;
  margin-top: 3px !important;
}
.log-artifact {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--green);
  margin-top: 4px;
}
.log-artifact-text {
  font-size: 10px;
  color: var(--muted);
  margin-top: 4px;
}
.log-more {
  align-self: flex-start;
}
.resource-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.resource-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--line);
}
.resource-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.resource-check {
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  font-size: 9px;
  padding: 3px 5px;
  flex: none;
}
.resource-check.on {
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  color: var(--ok);
  background: color-mix(in srgb, var(--ok) 9%, transparent);
}
.resource-main {
  flex: 1;
  min-width: 0;
}
.resource-main h4 {
  font-size: 12px;
  margin: 0 0 3px;
  line-height: 1.45;
}
.resource-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 8px;
  font-size: 10px;
  color: var(--muted);
}
.resource-btns {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.how-list {
  margin: 12px 0 0;
  padding: 0 0 0 17px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--muted);
}
.how-list b {
  color: var(--ink);
  font-weight: 600;
  margin-right: 5px;
}

@media (max-width: 900px) {
  .learn-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .learn-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 680px) {
  .route-bar {
    padding: 12px;
    align-items: flex-start;
    gap: 8px;
  }
  .route-chips {
    flex: 0 0 100%;
    min-width: 0;
  }
  .route-actions {
    order: 2;
    margin-left: auto;
  }
  .route-goal {
    order: 3;
  }
  .template-card {
    flex-direction: column;
    align-items: flex-start;
  }
  .today-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .today-card,
  .route-map,
  .topic-card,
  .log-card,
  .resource-card,
  .note-card {
    padding: 16px;
  }
  .empty-route {
    padding: 20px;
  }
  .week-mini {
    display: none;
  }
  .route-actions {
    order: 3;
  }
  .learn-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .kpi {
    padding: 12px;
  }
  .topic-row {
    flex-wrap: wrap;
  }
  .topic-btns {
    max-width: none;
    justify-content: flex-start;
    margin-left: 0;
    flex-basis: 100%;
  }
  .stage-card {
    padding: 12px;
  }
  .stages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .timer-strip {
    gap: 8px;
  }
  .timer-main {
    min-width: 120px;
  }
}
</style>