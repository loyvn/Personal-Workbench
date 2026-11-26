<!--
  文件：src/views/settings/DataPanel.vue
  说明：数据设置面板。展示存储体积构成，处理导出/导入合并或覆盖、快照创建恢复、自动快照、备份提醒、示例与清空。
  结构：体积构成 → 导出/导入 → 快照列表 → 自动快照与备份提醒 → 示例/清空
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { buildExport, exportFileName, mergeStates, validateImport } from '@/utils/transfer'
import { dataUrlBytes, humanBytes } from '@/utils/image'
import { fmtTime } from '@/utils/date'
import type { AppState, GeneralSettings } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const importInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

const totalBytes = computed(() => {
  try {
    return JSON.stringify(s.value).length
  } catch {
    return 0
  }
})

const bgBytes = computed(() => {
  const bg = s.value.appearance.background
  const all = bg.image ? [bg.image, ...bg.imageHistory] : bg.imageHistory
  return all.reduce((sum, src, i, list) => {
    if (!src || list.indexOf(src) !== i || !src.startsWith('data:')) return sum
    return sum + dataUrlBytes(src)
  }, 0)
})

const mainBytes = computed(() => Math.max(0, totalBytes.value - bgBytes.value))
const snapshotBytes = computed(() => store.snapshots.reduce((a, m) => a + m.size, 0))

const saveLabel = computed(() => {
  if (store.saving) return '保存中…'
  if (store.lastSavedAt) return `已保存 ${fmtTime(store.lastSavedAt)}`
  return '等待修改'
})

const remindOptions: Array<{ value: GeneralSettings['backupRemindDays']; label: string }> = [
  { value: 7, label: '7 天' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
  { value: 0, label: '关闭' }
]

function setRemind(value: number): void {
  const v = (value === 0 || value === 14 || value === 30 ? value : 7) as GeneralSettings['backupRemindDays']
  store.commit((st) => {
    st.general.backupRemindDays = v
  })
}

function toggleAutoSnapshot(): void {
  store.commit((st) => {
    st.dataPrefs.autoSnapshot = !st.dataPrefs.autoSnapshot
  })
}

/** 危险操作前的保险：失败不阻断主流程，只提示 */
/**
 * 危险操作前的自动快照：开关关闭或刚建过同标签快照时跳过。
 */
async function ensureAutoSnapshot(reason: string): Promise<void> {
  if (!s.value.dataPrefs.autoSnapshot) return
  try {
    await store.flush()
    const meta = await store.createSnapshot(`自动 · ${reason} · ${fmtTime(new Date().toISOString())}`)
    if (meta) ui.toast(`已自动建快照（${reason}）`)
    else ui.toast('自动快照失败：存储空间不足', 'err')
  } catch (e) {
    ui.toast(`自动快照失败：${(e as Error).message}`, 'err')
  }
}

/**
 * 生成带 app/version 的导出文件，更新 lastExportAt 后触发下载。
 */
async function doExport(): Promise<void> {
  busy.value = true
  try {
    await store.flush()
    const payload = buildExport(JSON.parse(JSON.stringify(s.value)) as AppState)
    const now = new Date().toISOString()
    payload.data.meta.lastExportAt = now
    store.commit((st) => {
      st.meta.lastExportAt = now
    })
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = exportFileName()
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    ui.toast('已导出备份文件')
  } catch (e) {
    ui.toast(`导出失败：${(e as Error).message}`, 'err')
  } finally {
    busy.value = false
  }
}

function pickImport(): void {
  importInput.value?.click()
}

/**
 * 读取导入文件并做 JSON/来源/版本校验，失败时不改当前数据。
 */
function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    let remote: ReturnType<typeof validateImport>
    try {
      remote = validateImport(JSON.parse(String(reader.result || '')))
    } catch (err) {
      ui.toast(`导入失败：${(err as Error).message}`, 'err')
      return
    }
    askImportMode(remote, file.name)
  }
  reader.readAsText(file, 'utf-8')
}

/**
 * 让用户选择合并或覆盖；覆盖前自动快照，合并走 mergeStates。
 */
function askImportMode(remote: ReturnType<typeof validateImport>, fileName: string): void {
  ui.openForm({
    title: '怎么导入',
    fields: [
      {
        key: 'mode',
        label: '导入方式',
        type: 'select',
        options: [
          { value: 'merge', label: '合并（推荐）：保留本机，按 id 取较新的' },
          { value: 'replace', label: '覆盖：用文件里的数据替换本机全部' }
        ],
        hint: fileName
      }
    ],
    values: { mode: 'merge' },
    submitText: '导入',
    onSubmit(v) {
      if (v.mode === 'replace') {
        ui.closeForm()
        ui.askConfirm({
          title: '确认覆盖',
          message: '本机现有数据会被文件内容完全替换，建议先导出一份备份。',
          confirmText: '仍然覆盖',
          onConfirm: async () => {
            await ensureAutoSnapshot('覆盖导入前')
            store.replaceState(remote)
            ui.toast('已覆盖导入')
            void store.refreshSnapshots()
          }
        })
        return false
      }
      const { state, report } = mergeStates(JSON.parse(JSON.stringify(s.value)) as AppState, remote)
      store.replaceState(state)
      ui.toast(`合并完成：新增 ${report.added}，更新 ${report.updated}，跳过 ${report.skipped}`)
      return true
    }
  })
}

/**
 * 手动创建快照，最多保留 5 份，成功后刷新列表。
 */
async function makeSnapshot(): Promise<void> {
  busy.value = true
  try {
    await store.flush()
    const label = `手动备份 ${fmtTime(new Date().toISOString())}`
    const meta = await store.createSnapshot(label)
    ui.toast(meta ? '快照已建立（最多保留 5 份）' : '快照建立失败：存储空间不足', meta ? 'ok' : 'err')
  } catch (e) {
    ui.toast(`快照失败：${(e as Error).message}`, 'err')
  } finally {
    busy.value = false
  }
}

/**
 * 恢复快照前先备份当前状态，避免恢复动作本身造成不可逆丢失。
 */
function restore(meta: { key: string; label: string }): void {
  ui.askConfirm({
    title: '恢复快照',
    message: `「${meta.label}」会覆盖当前数据，恢复前建议先建一份快照。`,
    confirmText: '恢复',
    onConfirm: async () => {
      try {
        await ensureAutoSnapshot('恢复快照前')
        await store.restoreSnapshot(meta.key)
        ui.toast('已恢复到该快照')
      } catch (e) {
        ui.toast(`恢复失败：${(e as Error).message}`, 'err')
      }
    }
  })
}

function loadDemo(): void {
  ui.askConfirm({
    title: '载入示例数据',
    message: '当前数据会被示例数据替换，示例含任务、习惯、训练、小说等演示条目。',
    confirmText: '载入示例',
    onConfirm: async () => {
      await ensureAutoSnapshot('载入示例前')
      await store.resetState(true)
      ui.toast('已载入示例')
    }
  })
}

/**
 * 二次确认后清空；执行前按设置自动快照，再调用 clearAll 接口。
 */
function clearAll(): void {
  ui.askConfirm({
    title: '清空全部数据',
    message: '所有模块数据将被清空且不可恢复，建议先导出备份。',
    confirmText: '继续',
    danger: true,
    onConfirm() {
      ui.askConfirm({
        title: '最后确认',
        message: '真的要清空吗？这个操作没有撤销。',
        confirmText: '确认清空',
        danger: true,
        onConfirm: async () => {
          await ensureAutoSnapshot('清空前')
          await store.clearAll()
          ui.toast('已清空')
        }
      })
    }
  })
}

function prettyDate(iso: string): string {
  if (!iso) return '—'
  return iso.replace('T', ' ').slice(0, 16)
}
</script>

<template>
  <div class="kpis" style="margin-bottom: 16px">
    <div class="kpi">
      <div class="kv" style="font-size: 15px">{{ store.modeLabel }}</div>
      <div class="kl">数据接口</div>
      <div class="ks">{{ saveLabel }}</div>
    </div>
    <div class="kpi">
      <div class="kv" style="font-size: 16px">{{ humanBytes(mainBytes) }}</div>
      <div class="kl">主数据体积</div>
      <div class="ks">背景图 {{ bgBytes ? humanBytes(bgBytes) : '未使用' }}</div>
    </div>
    <div class="kpi">
      <div class="kv" style="font-size: 16px">{{ store.snapshots.length }}/5</div>
      <div class="kl">快照份数</div>
      <div class="ks">共 {{ snapshotBytes ? humanBytes(snapshotBytes) : '0 KB' }}；最近：{{ store.snapshots[0] ? prettyDate(store.snapshots[0].at) : '还没有' }}</div>
    </div>
  </div>

  <div v-if="store.error" class="card" style="border-color: var(--red); margin-bottom: 16px">
    <div style="font-size: 12.5px; color: var(--red)">{{ store.error }}</div>
  </div>

  <section class="sect">
    <div class="sect-h"><h2>备份与恢复</h2><span class="cnt">导出 / 导入 / 快照</span></div>
    <div class="card">
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">导出备份</div>
            <div class="meta">下载一个 JSON，含全部模块与背景图；换设备时带过去</div>
            <div class="meta">上次导出：{{ s.meta.lastExportAt ? prettyDate(s.meta.lastExportAt) : '从未' }}</div>
          </div>
          <button class="btn btn-sm" :disabled="busy" @click="doExport">导出</button>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">导入备份</div>
            <div class="meta">合并按 id 取较新的记录；覆盖会整份替换（含背景）</div>
          </div>
          <button class="btn btn-sm" @click="pickImport">选择文件</button>
          <input ref="importInput" type="file" accept="application/json,.json" hidden @change="onImportFile" />
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">快照</div>
            <div class="meta">本机保留最近 5 份，恢复会用快照覆盖当前数据</div>
          </div>
          <button class="btn btn-sm" :disabled="busy" @click="makeSnapshot">建一份</button>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0; border-bottom: 0">
          <div class="body">
            <div class="title">危险操作前自动快照</div>
            <div class="meta">覆盖导入、恢复快照、清空、载入示例前各存一份</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.dataPrefs.autoSnapshot" @change="toggleAutoSnapshot" />
            <i />
          </label>
        </div>
      </div>
      <div v-if="store.snapshots.length" class="rule" />
      <div class="rows">
        <div v-for="m in store.snapshots" :key="m.key" class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title" style="font-size: 12.5px">{{ m.label }}</div>
            <div class="meta">{{ prettyDate(m.at) }} · {{ (m.size / 1024).toFixed(1) }} KB</div>
          </div>
          <button class="mini" @click="restore(m)">恢复</button>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>备份提醒</h2><span class="cnt">顶栏铃铛的角标</span></div>
    <div class="card">
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0; border-bottom: 0">
          <div class="body">
            <div class="title">多久没导出就提醒</div>
            <div class="meta">超过这个天数，顶栏备份按钮会出现小红点</div>
          </div>
          <div class="seg">
            <button v-for="r in remindOptions" :key="r.value" :class="{ on: s.general.backupRemindDays === r.value }" @click="setRemind(r.value)">
              {{ r.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>危险操作</h2><span class="cnt">先导出再动手</span></div>
    <div class="card">
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn" @click="loadDemo">载入示例数据</button>
        <button class="btn btn-danger" @click="clearAll">清空全部数据</button>
      </div>
      <div style="font-size: 11.5px; color: var(--muted); margin-top: 9px">
        清空只影响本机，已导出的 JSON 与快照不会被删除。开启自动快照时，这两项操作前会先留一份。
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>数据说明</h2></div>
    <div class="card">
      <div style="font-size: 12px; color: var(--muted); line-height: 1.9">
        开发态用 mock（`npm run dev`）：数据写在浏览器 localStorage。<br />
        正式态用 express（`npm run start`）：数据写在 server/data/state.json。<br />
        两种模式业务代码一致；关页面、关电脑都不会丢，换设备用导出 / 导入。<br />
        导入合并时设置以本机为准：称呼、主题、背景、模块开关、提醒阈值不会被远端覆盖。<br />
        数据结构 v{{ s.version }} · 建立时间 {{ prettyDate(s.meta.createdAt) }}
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (max-width: 759px) {
  .kpis .kpi:last-child { grid-column: 1 / -1; }
}
</style>