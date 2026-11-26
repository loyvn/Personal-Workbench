<!--
  文件：src/views/OutputView.vue
  说明：作品产出页。AI 视频与全栈开发双领域共用项目壳层；视频侧管理分镜/版本/提示词，开发侧管理迭代与四列看板。
  结构：页头领域切换 → 项目卡与验收条件 → 视频侧分镜/提示词说明；开发侧迭代与四列看板
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
import { shiftYMD, todayStr } from '@/utils/date'
import { nowISO, uid } from '@/utils/misc'
import type { OutputDomain, Priority, Project, Shot, Ticket, TicketStatus } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const t = todayStr()

const domain = ref<OutputDomain>('video')
const activeId = ref('')

const DOMAIN_LABEL: Record<OutputDomain, string> = { video: 'AI 视频创作', dev: 'AI 全栈开发' }

const projects = computed(() => s.value.output.projects.filter((p) => p.domain === domain.value))
const project = computed<Project | null>(() => s.value.output.projects.find((p) => p.id === activeId.value) || null)

watch(
  [domain, projects],
  () => {
    if (!project.value || project.value.domain !== domain.value) activeId.value = projects.value[0]?.id || ''
  },
  { immediate: true }
)

const shots = computed(() => s.value.output.shots.filter((x) => x.projectId === activeId.value).slice().sort((a, b) => a.no - b.no))
const iterations = computed(() => s.value.output.iterations.filter((x) => x.projectId === activeId.value))
const tickets = computed(() => s.value.output.tickets.filter((x) => x.projectId === activeId.value))

const STATUS: Array<{ key: TicketStatus; label: string }> = [
  { key: 'backlog', label: '待排' },
  { key: 'doing', label: '在做' },
  { key: 'verify', label: '待验' },
  { key: 'done', label: '完成' }
]

function col(status: TicketStatus) {
  return tickets.value.filter((x) => x.status === status)
}

const acceptanceDone = computed(() => (project.value ? project.value.acceptance.filter((a) => a.done).length : 0))
const acceptanceRate = computed(() =>
  project.value?.acceptance.length ? Math.round((acceptanceDone.value / project.value.acceptance.length) * 100) : 0
)

/**
 * 打开项目表单；验收条件在此维护，保证每条都可勾选。
 */
function openProject(p?: Project) {
  const fields: FormField[] =
    domain.value === 'video'
      ? [
          { key: 'name', label: '项目名' },
          { key: 'goal', label: '要做什么', type: 'textarea' },
          { key: 'deliverable', label: '最终交付物', placeholder: '例如：60 秒成片 + 字幕' },
          { key: 'version', label: '当前版本', placeholder: 'v0.1' }
        ]
      : [
          { key: 'name', label: '项目名' },
          { key: 'goal', label: '技术目标', type: 'textarea' },
          { key: 'deliverable', label: '交付标准', placeholder: '例如：可登录 + 数据落库' },
          { key: 'repo', label: '仓库 / 目录' },
          { key: 'env', label: '运行环境', placeholder: 'local / 测试 / 线上' }
        ]
  ui.openForm({
    title: p ? '编辑项目' : '新建项目',
    fields,
    values: p
      ? { name: p.name, goal: p.goal, deliverable: p.deliverable, version: p.version, repo: p.repo, env: p.env }
      : { name: '', goal: '', deliverable: '', version: '0.1', repo: '', env: 'local' },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('项目名不能为空', 'err')
        return false
      }
      store.commit((st) => {
        if (p) {
          const x = st.output.projects.find((o) => o.id === p.id)
          if (!x) return
          Object.assign(x, {
            name: String(v.name).trim(),
            goal: String(v.goal || ''),
            deliverable: String(v.deliverable || ''),
            version: String(v.version || p.version),
            repo: String(v.repo || p.repo),
            env: String(v.env || p.env),
            updatedAt: nowISO()
          })
        } else {
          const id = uid()
          st.output.projects.push({
            id,
            domain: domain.value,
            name: String(v.name).trim(),
            goal: String(v.goal || ''),
            deliverable: String(v.deliverable || ''),
            acceptance: [
              { id: uid(), text: '', done: false }
            ].filter((a) => a.text),
            version: String(v.version || '0.1'),
            status: 'active',
            repo: String(v.repo || ''),
            env: String(v.env || 'local'),
            updatedAt: nowISO()
          })
          activeId.value = id
        }
      })
      ui.toast('已保存')
    }
  })
}

function addAcceptance() {
  const p = project.value
  if (!p) return
  ui.openForm({
    title: '加一条验收条件',
    fields: [{ key: 'text', label: '验收标准', placeholder: '能被判定为做完的一句话' }],
    values: { text: '' },
    onSubmit(v) {
      if (!String(v.text || '').trim()) {
        ui.toast('先写内容', 'err')
        return false
      }
      store.commit((st) => {
        const x = st.output.projects.find((o) => o.id === p.id)
        if (x) x.acceptance.push({ id: uid(), text: String(v.text).trim(), done: false })
      })
    }
  })
}

function toggleAcceptance(id: string) {
  store.commit((st) => {
    const p = st.output.projects.find((o) => o.id === activeId.value)
    const a = p?.acceptance.find((x) => x.id === id)
    if (a) a.done = !a.done
  })
}

function delAcceptance(id: string) {
  store.commit((st) => {
    const p = st.output.projects.find((o) => o.id === activeId.value)
    if (p) p.acceptance = p.acceptance.filter((x) => x.id !== id)
  })
}

function openShot(sh?: Shot) {
  if (!project.value) {
    ui.toast('先选一个项目', 'err')
    return
  }
  const nextNo = shots.value.length ? shots.value[shots.value.length - 1].no + 1 : 1
  ui.openForm({
    title: sh ? '编辑镜头' : '新增镜头',
    fields: [
      { key: 'no', label: '镜号', type: 'number', min: 1 },
      { key: 'desc', label: '画面与动作', type: 'textarea' },
      { key: 'model', label: '用哪个模型', placeholder: '可灵 / 即梦 / Sora' }
    ],
    values: sh ? { no: sh.no, desc: sh.desc, model: sh.model } : { no: nextNo, desc: '', model: '可灵' },
    onSubmit(v) {
      if (!String(v.desc || '').trim()) {
        ui.toast('先写画面内容', 'err')
        return false
      }
      store.commit((st) => {
        if (sh) {
          const x = st.output.shots.find((o) => o.id === sh.id)
          if (!x) return
          Object.assign(x, {
            no: Number(v.no) || x.no,
            desc: String(v.desc).trim(),
            model: String(v.model || ''),
            updatedAt: nowISO()
          })
        } else {
          st.output.shots.push({
            id: uid(),
            projectId: activeId.value,
            no: Number(v.no) || nextNo,
            desc: String(v.desc).trim(),
            promptId: null,
            model: String(v.model || ''),
            versions: [],
            adoptedVersion: null,
            updatedAt: nowISO()
          })
        }
      })
      ui.toast('已保存')
    }
  })
}

/**
 * 给分镜追加一个生成版本，版本号递增且默认未采用。
 */
function addVersion(sh: Shot) {
  const nextV = sh.versions.length ? Math.max(...sh.versions.map((x) => x.v)) + 1 : 1
  ui.openForm({
    title: `镜头 ${sh.no} 加一版`,
    fields: [
      { key: 'status', label: '这版状态', type: 'select', options: [
        { value: '待生成', label: '待生成' },
        { value: '已生成', label: '已生成' },
        { value: '可用', label: '可用' },
        { value: '废弃', label: '废弃' }
      ] },
      { key: 'url', label: '素材链接（可空）' },
      { key: 'note', label: '这版的问题 / 改动', type: 'textarea' }
    ],
    values: { status: '待生成', url: '', note: '' },
    onSubmit(v) {
      store.commit((st) => {
        const x = st.output.shots.find((o) => o.id === sh.id)
        if (!x) return
        x.versions.push({
          v: nextV,
          status: String(v.status || '待生成'),
          url: String(v.url || ''),
          note: String(v.note || '')
        })
        x.updatedAt = nowISO()
      })
      ui.toast(`已加 v${nextV}`)
    }
  })
}

/**
 * 标记分镜采用版本；同一分镜只保留一个 adoptedVersion。
 */
function adopt(sh: Shot, v: number) {
  store.commit((st) => {
    const x = st.output.shots.find((o) => o.id === sh.id)
    if (x) x.adoptedVersion = v
  })
  ui.toast(`镜头 ${sh.no} 采用 v${v}`)
}

function delShot(sh: Shot) {
  ui.askConfirm({
    title: '删除镜头',
    message: `镜头 ${sh.no} 及其 ${sh.versions.length} 个版本会删除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.output.shots = st.output.shots.filter((x) => x.id !== sh.id)
      })
    }
  })
}

function openTicket(status: TicketStatus = 'backlog') {
  if (!project.value) {
    ui.toast('先选一个项目', 'err')
    return
  }
  ui.openForm({
    title: '加一个任务',
    fields: [
      { key: 'title', label: '要做什么' },
      { key: 'type', label: '类型', type: 'select', options: [
        { value: 'feature', label: '功能' },
        { value: 'bug', label: '缺陷' },
        { value: 'chore', label: '杂务' }
      ] },
      { key: 'priority', label: '优先级', type: 'select', options: [
        { value: 'high', label: '高' },
        { value: 'mid', label: '中' },
        { value: 'low', label: '低' }
      ] },
      { key: 'iterationId', label: '所属迭代', type: 'select', options: [{ value: '', label: '不指定' }, ...iterations.value.map((x) => ({ value: x.id, label: x.name }))] }
    ],
    values: { title: '', type: 'feature', priority: 'mid', iterationId: '' },
    onSubmit(v) {
      if (!String(v.title || '').trim()) {
        ui.toast('先写任务', 'err')
        return false
      }
      store.commit((st) => {
        st.output.tickets.push({
          id: uid(),
          projectId: activeId.value,
          iterationId: v.iterationId ? String(v.iterationId) : null,
          title: String(v.title).trim(),
          type: (v.type as Ticket['type']) || 'feature',
          priority: (v.priority as Priority) || 'mid',
          status,
          blocked: false,
          blockedReason: '',
          updatedAt: nowISO()
        })
      })
    }
  })
}

/**
 * 看板卡片向后移动一列，到 done 时写完成时间。
 */
function advanceTicket(tk: Ticket) {
  const idx = STATUS.findIndex((x) => x.key === tk.status)
  if (idx < 0 || idx >= STATUS.length - 1) return
  const next = STATUS[idx + 1].key
  store.commit((st) => {
    const x = st.output.tickets.find((o) => o.id === tk.id)
    if (x) {
      x.status = next
      x.updatedAt = nowISO()
    }
  })
}

function backTicket(tk: Ticket) {
  const idx = STATUS.findIndex((x) => x.key === tk.status)
  if (idx <= 0) return
  const prev = STATUS[idx - 1].key
  store.commit((st) => {
    const x = st.output.tickets.find((o) => o.id === tk.id)
    if (x) {
      x.status = prev
      x.updatedAt = nowISO()
    }
  })
}

/**
 * 切换阻塞标记并记录原因，阻塞卡在列内单独提示。
 */
function blockTicket(tk: Ticket) {
  ui.openForm({
    title: '标记卡住',
    fields: [{ key: 'reason', label: '卡在哪', placeholder: '缺接口 / 等素材 / 不确定需求' }],
    values: { reason: tk.blockedReason },
    onSubmit(v) {
      store.commit((st) => {
        const x = st.output.tickets.find((o) => o.id === tk.id)
        if (x) {
          x.blocked = !x.blocked
          x.blockedReason = x.blocked ? String(v.reason || '') : ''
          x.updatedAt = nowISO()
        }
      })
    }
  })
}

function delTicket(tk: Ticket) {
  store.commit((st) => {
    st.output.tickets = st.output.tickets.filter((x) => x.id !== tk.id)
  })
}

function openIteration() {
  if (!project.value) {
    ui.toast('先选一个项目', 'err')
    return
  }
  ui.openForm({
    title: '新建迭代',
    fields: [
      { key: 'name', label: '迭代名', placeholder: '例如：第九周 · 打通接口' },
      { key: 'startDate', label: '开始', type: 'date' },
      { key: 'endDate', label: '结束', type: 'date' },
      { key: 'goal', label: '这轮只做什么', type: 'textarea' }
    ],
    values: { name: '', startDate: t, endDate: shiftYMD(t, 13), goal: '' },
    onSubmit(v) {
      if (!String(v.name || '').trim()) {
        ui.toast('先写迭代名', 'err')
        return false
      }
      store.commit((st) => {
        st.output.iterations.push({
          id: uid(),
          projectId: activeId.value,
          name: String(v.name).trim(),
          startDate: String(v.startDate || t),
          endDate: String(v.endDate || shiftYMD(t, 13)),
          goal: String(v.goal || ''),
          status: 'active'
        })
      })
      ui.toast('迭代已建立')
    }
  })
}

function endIteration(id: string) {
  store.commit((st) => {
    const x = st.output.iterations.find((o) => o.id === id)
    if (x) x.status = 'done'
  })
}

const priorityTag = (p: Priority) => (p === 'high' ? 'high' : p === 'low' ? '' : '')
</script>

<template>
  <PageHeader title="作品产出" :subtitle="`${DOMAIN_LABEL[domain]} · ${projects.length} 个项目`">
    <template #actions>
      <button class="btn btn-primary" @click="openProject()">+ 新建项目</button>
    </template>
  </PageHeader>

  <div class="card" style="margin-bottom: 16px">
    <div class="seg">
      <button :class="{ on: domain === 'video' }" @click="domain = 'video'">AI 视频创作</button>
      <button :class="{ on: domain === 'dev' }" @click="domain = 'dev'">AI 全栈开发</button>
    </div>
    <div v-if="projects.length" class="chips" style="margin-top: 12px">
      <button v-for="p in projects" :key="p.id" class="chip" :class="{ on: p.id === activeId }" @click="activeId = p.id">
        {{ p.name }}
      </button>
    </div>
  </div>

  <EmptyState
    v-if="!project"
    :title="`还没有${DOMAIN_LABEL[domain]}项目`"
    desc="一个项目 = 一个能交付的成果，不是一个愿望"
    action="新建项目"
    @action="openProject()"
  />

  <template v-else>
    <div class="card" style="margin-bottom: 16px">
      <div style="display: flex; justify-content: space-between; gap: 10px; align-items: flex-start">
        <div>
          <div style="font-size: 16px; font-weight: 700">{{ project.name }}</div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 3px">
            {{ project.goal || '没写目标' }}
          </div>
          <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px">
            v{{ project.version }} · {{ project.env }} · {{ project.repo || '本地目录未填' }}
          </div>
          <BoundIdeas module="output" :target-id="project.id" />
        </div>
        <div style="display: flex; gap: 4px">
          <button class="mini" @click="openProject(project)">编辑</button>
        </div>
      </div>
      <div class="sect-h" style="margin-top: 14px">
        <h2>验收条件</h2>
        <span class="cnt">{{ acceptanceDone }}/{{ project.acceptance.length }} · {{ acceptanceRate }}%</span>
        <div class="spacer" />
        <button class="mini" @click="addAcceptance">+ 加一条</button>
      </div>
      <div class="pbar"><i :style="{ width: acceptanceRate + '%' }" /></div>
      <div v-if="project.acceptance.length" class="rows" style="margin-top: 10px">
        <div v-for="a in project.acceptance" :key="a.id" class="row">
          <button class="cb" :class="{ on: a.done }" @click="toggleAcceptance(a.id)">{{ a.done ? '✓' : '' }}</button>
          <div class="body"><div class="title" :style="{ textDecoration: a.done ? 'line-through' : 'none', opacity: a.done ? 0.6 : 1 }">{{ a.text }}</div></div>
          <button class="mini danger" @click="delAcceptance(a.id)">删</button>
        </div>
      </div>
      <div v-else style="font-size: 12px; color: var(--muted); margin-top: 8px">没有验收条件，就无法判断做完没有</div>
    </div>

    <template v-if="domain === 'video'">
      <section class="sect">
        <div class="sect-h">
          <h2>分镜表</h2>
          <span class="cnt">{{ shots.length }} 镜 · 采用 {{ shots.filter((x) => x.adoptedVersion).length }}</span>
          <div class="spacer" />
          <button class="mini" @click="openShot()">+ 镜头</button>
        </div>
        <div v-if="shots.length" class="rows">
          <div v-for="sh in shots" :key="sh.id" class="card card-tight">
            <div style="display: flex; justify-content: space-between; gap: 8px; align-items: flex-start">
              <div style="min-width: 0">
                <div style="font-size: 13px; font-weight: 600">
                  <span style="font-family: var(--mono); color: var(--muted)">{{ String(sh.no).padStart(2, '0') }}</span>
                  {{ sh.desc }}
                </div>
                <div style="font-size: 11.5px; color: var(--muted); margin-top: 3px">{{ sh.model || '未指定模型' }}</div>
              </div>
              <div style="display: flex; gap: 4px">
                <button class="mini" @click="addVersion(sh)">+ 版本</button>
                <button class="mini" @click="openShot(sh)">改</button>
                <button class="mini danger" @click="delShot(sh)">删</button>
              </div>
            </div>
            <div v-if="sh.versions.length" class="chips" style="margin-top: 8px">
              <button
                v-for="v in sh.versions"
                :key="v.v"
                class="chip"
                :class="{ on: sh.adoptedVersion === v.v }"
                @click="adopt(sh, v.v)"
                :title="v.note"
              >
                v{{ v.v }} · {{ v.status }}
              </button>
            </div>
            <div v-else style="font-size: 11.5px; color: var(--muted); margin-top: 6px">还没有试生成，先加一版</div>
          </div>
        </div>
        <EmptyState v-else title="还没有分镜" desc="先把画面一段段写下来，再谈生成" action="加第一个镜头" @action="openShot()" />
      </section>

      <section class="sect">
        <div class="sect-h"><h2>提示词怎么放</h2><span class="cnt">跟着镜头走，不单独建库</span></div>
        <div class="card" style="font-size: 12px; color: var(--muted)">
          每个镜头的版本里写清“这版改了什么、问题在哪”，提示词随镜头版本一起留档，避免和画面脱节。
        </div>
      </section>
    </template>

    <template v-else>
      <section class="sect">
        <div class="sect-h">
          <h2>迭代</h2>
          <span class="cnt">{{ iterations.length }}</span>
          <div class="spacer" />
          <button class="mini" @click="openIteration">+ 迭代</button>
        </div>
        <div v-if="iterations.length" class="rows">
          <div v-for="it in iterations" :key="it.id" class="card card-tight">
            <div style="display: flex; justify-content: space-between; gap: 8px; align-items: flex-start">
              <div>
                <div style="font-size: 13px; font-weight: 600">{{ it.name }}</div>
                <div style="font-size: 11.5px; color: var(--muted); margin-top: 3px">{{ it.startDate }} → {{ it.endDate }} · {{ it.goal || '无目标' }}</div>
              </div>
              <div style="display: flex; gap: 4px">
                <span class="tag" :class="it.status === 'done' ? 'ok' : 'amber'">{{ it.status === 'done' ? '已结束' : '进行中' }}</span>
                <button v-if="it.status !== 'done'" class="mini" @click="endIteration(it.id)">结束</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="card" style="color: var(--muted); font-size: 13px">还没有迭代，建议两周一轮</div>
      </section>

      <section class="sect">
        <div class="sect-h">
          <h2>迭代看板</h2>
          <span class="cnt">{{ tickets.length }} 个任务</span>
          <div class="spacer" />
          <button class="mini" @click="openTicket()">+ 任务</button>
        </div>
        <div class="kanban">
          <div v-for="st in STATUS" :key="st.key" class="kb-col">
            <div class="kb-h">{{ st.label }}<span>{{ col(st.key).length }}</span></div>
            <div v-for="tk in col(st.key)" :key="tk.id" class="kb-card">
              <div style="font-size: 12.5px; font-weight: 600; line-height: 1.4">{{ tk.title }}</div>
              <div style="display: flex; gap: 4px; margin-top: 5px; flex-wrap: wrap">
                <span class="tag soft">{{ tk.type === 'bug' ? '缺陷' : tk.type === 'chore' ? '杂务' : '功能' }}</span>
                <span class="tag" :class="priorityTag(tk.priority)">{{ tk.priority === 'high' ? '高' : tk.priority === 'mid' ? '中' : '低' }}</span>
                <span v-if="tk.blocked" class="tag amber" :title="tk.blockedReason">卡住</span>
              </div>
              <div style="display: flex; gap: 3px; margin-top: 7px; flex-wrap: wrap">
                <button v-if="tk.status !== 'backlog'" class="mini" @click="backTicket(tk)">←</button>
                <button v-if="tk.status !== 'done'" class="mini" @click="advanceTicket(tk)">→</button>
                <button class="mini" @click="blockTicket(tk)">{{ tk.blocked ? '解卡' : '卡住' }}</button>
                <button class="mini danger" @click="delTicket(tk)">删</button>
              </div>
            </div>
            <button class="mini" style="width: 100%; margin-top: 6px" @click="openTicket(st.key)">+ 加到{{ st.label }}</button>
          </div>
        </div>
      </section>
    </template>
  </template>
</template>