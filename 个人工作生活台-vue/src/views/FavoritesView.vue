<!--
  文件：src/views/FavoritesView.vue
  说明：收藏页。支持收藏夹/标签筛选、多类型收藏新建编辑删除、图片上传压缩、搜索与按文件夹分组展示。
  结构：页头统计 → 新建收藏卡 → 收藏夹与标签筛选 → 分组卡片列表
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { fmtTime } from '@/utils/date'
import { nowISO, uid } from '@/utils/misc'
import { compressImage, isHttpImageUrl } from '@/utils/image'
import type { FavoriteFolder, FavoriteItem, FavoriteKind } from '@/types'
import type { FormField } from '@/stores/ui'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const MAX_FILE_MB = 3

const KIND_OPTIONS: Array<{ key: FavoriteKind; label: string; hint: string }> = [
  { key: 'text', label: '文字', hint: '把一段话、一个判断完整存下来' },
  { key: 'link', label: '链接', hint: '存标题、地址、概述和备注' },
  { key: 'image', label: '图片', hint: '本地压缩后保存，也可以贴图片地址' },
  { key: 'file', label: '文件', hint: `文档、压缩包等，单个不超过 ${MAX_FILE_MB}MB` }
]

const draftKind = ref<FavoriteKind>('text')
const draftTitle = ref('')
const draftFolderId = ref('')
const draftTags = ref('')
const draftSummary = ref('')
const draftNote = ref('')
const draftText = ref('')
const draftUrl = ref('')
const draftImage = ref('')
const draftImageUrl = ref('')
const draftFileData = ref('')
const draftFileName = ref('')
const draftFileType = ref('')
const draftFileSize = ref(0)
const busy = ref(false)
const imageInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const kindHint = computed(() => KIND_OPTIONS.find((x) => x.key === draftKind.value)?.hint || '')
const effectiveImage = computed(() => draftImage.value || draftImageUrl.value)
const imagePreview = computed(
  () => Boolean(effectiveImage.value) && (effectiveImage.value.startsWith('data:image/') || isHttpImageUrl(effectiveImage.value))
)
const folders = computed(() =>
  s.value.favorites.folders.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
)
const totalItems = computed(() => s.value.favorites.items.length)
const folderOptions = computed(() => folders.value.map((x) => ({ value: x.id, label: x.name })))
const folderGroups = computed(() => {
  const items = s.value.favorites.items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const groups: Array<{ id: string; name: string; folder: FavoriteFolder | null; items: FavoriteItem[] }> = folders.value.map((folder) => ({
    id: folder.id,
    name: folder.name,
    folder,
    items: items.filter((x) => x.folderId === folder.id)
  }))
  const known = new Set(folders.value.map((x) => x.id))
  const loose = items.filter((x) => !x.folderId || !known.has(x.folderId))
  if (loose.length) groups.push({ id: '', name: '未分类', folder: null, items: loose })
  return groups
})

function switchKind(kind: FavoriteKind): void {
  draftKind.value = kind
}

function clearPreview(): void {
  draftImage.value = ''
  draftImageUrl.value = ''
}

function pickImage(): void {
  imageInput.value?.click()
}

function pickFile(): void {
  fileInput.value?.click()
}

/**
 * 图片收藏：复用 compressImage 压到 500 KB 内再写入 dataURL。
 */
async function onImageFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  busy.value = true
  try {
    draftImage.value = await compressImage(file)
    draftImageUrl.value = ''
    if (!draftTitle.value.trim()) draftTitle.value = file.name.replace(/\.[^.]+$/, '').slice(0, 80)
    ui.toast('图片已本地压缩')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '图片处理失败', 'err')
  } finally {
    busy.value = false
    input.value = ''
  }
}

/**
 * 文件收藏：读取为 dataURL，超过浏览器存储上限时提示先减小文件。
 */
async function onFileFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    ui.toast(`单个文件请控制在 ${MAX_FILE_MB}MB 以内`, 'err')
    input.value = ''
    return
  }
  busy.value = true
  try {
    draftFileData.value = await readAsDataURL(file)
    draftFileName.value = file.name
    draftFileType.value = file.type || file.name.split('.').pop() || 'file'
    draftFileSize.value = file.size
    if (!draftTitle.value.trim()) draftTitle.value = file.name.replace(/\.[^.]+$/, '').slice(0, 80)
    ui.toast('文件已加入待收藏')
  } catch {
    ui.toast('文件读取失败', 'err')
  } finally {
    busy.value = false
    input.value = ''
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function clearFile(): void {
  draftFileData.value = ''
  draftFileName.value = ''
  draftFileType.value = ''
  draftFileSize.value = 0
}

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '链接收藏'
  }
}

/**
 * 把逗号/顿号/空格分隔的输入拆成去重标签。
 */
function parseTags(): string[] {
  return draftTags.value
    .split(/[,，#\s]+/)
    .map((x) => x.trim().slice(0, 24))
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 12)
}

function defaultTitle(): string {
  if (draftKind.value === 'link') return linkHost(draftUrl.value.trim())
  if (draftKind.value === 'file') return draftFileName.value || '文件收藏'
  if (draftKind.value === 'image') return draftFileName.value || '图片收藏'
  return draftText.value.trim().slice(0, 24) || '未命名收藏'
}

/**
 * 校验类型必填项后写入 items；编辑时保留原 id 与创建时间。
 */
function saveFavorite(): void {
  if (draftKind.value === 'text' && !draftText.value.trim()) {
    ui.toast('先写要收藏的文字', 'err')
    return
  }
  if (draftKind.value === 'link' && !/^https?:\/\//i.test(draftUrl.value.trim())) {
    ui.toast('链接需要以 http 或 https 开头', 'err')
    return
  }
  if (draftKind.value === 'image' && !imagePreview.value) {
    ui.toast('先选择图片或填写图片地址', 'err')
    return
  }
  if (draftKind.value === 'file' && !draftFileData.value) {
    ui.toast('先选择一个文件', 'err')
    return
  }
  const title = draftTitle.value.trim().slice(0, 160) || defaultTitle()
  const tags = parseTags()
  const item: FavoriteItem = {
    id: uid(),
    kind: draftKind.value,
    folderId: draftFolderId.value || null,
    title,
    summary: draftSummary.value.trim().slice(0, 2400),
    note: draftNote.value.trim().slice(0, 4000),
    text: draftKind.value === 'text' ? draftText.value.trim().slice(0, 8000) : '',
    url: draftKind.value === 'link' ? draftUrl.value.trim().slice(0, 2000) : '',
    image: draftKind.value === 'image' ? effectiveImage.value : '',
    fileName: draftKind.value === 'file' ? draftFileName.value : '',
    fileType: draftKind.value === 'file' ? draftFileType.value : '',
    fileSize: draftKind.value === 'file' ? draftFileSize.value : 0,
    fileData: draftKind.value === 'file' ? draftFileData.value : '',
    tags,
    createdAt: nowISO(),
    updatedAt: nowISO()
  }
  store.commit((st) => {
    st.favorites.items.unshift(item)
  })
  resetDraft()
  ui.toast('已收藏')
}

function resetDraft(): void {
  draftTitle.value = ''
  draftTags.value = ''
  draftSummary.value = ''
  draftNote.value = ''
  draftText.value = ''
  draftUrl.value = ''
  clearPreview()
  clearFile()
}

function openNewFolder(): void {
  ui.openForm({
    title: '新建收藏夹',
    fields: [{ key: 'name', label: '收藏夹名称', placeholder: '例如：工作资料、灵感图、待读文章' }],
    values: { name: '' },
    onSubmit(v) {
      const name = String(v.name || '').trim().slice(0, 24)
      if (!name) {
        ui.toast('先写收藏夹名称', 'err')
        return false
      }
      const folder: FavoriteFolder = { id: uid(), name, createdAt: nowISO(), updatedAt: nowISO() }
      store.commit((st) => {
        st.favorites.folders.push(folder)
      })
      draftFolderId.value = folder.id
      ui.toast(`已新建「${name}」`)
    }
  })
}

function renameFolder(folder: FavoriteFolder): void {
  ui.openForm({
    title: '修改收藏夹名称',
    fields: [{ key: 'name', label: '收藏夹名称', placeholder: '收藏夹名称' }],
    values: { name: folder.name },
    onSubmit(v) {
      const name = String(v.name || '').trim().slice(0, 24)
      if (!name) {
        ui.toast('收藏夹名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        const target = st.favorites.folders.find((x) => x.id === folder.id)
        if (!target) return
        target.name = name
        target.updatedAt = nowISO()
      })
      ui.toast('收藏夹名称已更新')
    }
  })
}

function editFavorite(item: FavoriteItem): void {
  const fields: FormField[] = [
    { key: 'title', label: '标题名', placeholder: '这条收藏叫什么' },
    {
      key: 'folder',
      label: '收藏夹',
      type: 'select',
      options: [{ value: '', label: '未分类' }, ...folderOptions.value]
    },
    { key: 'tags', label: '标签', placeholder: '自定义标签，逗号分隔' },
    { key: 'summary', label: '概述', type: 'textarea' },
    { key: 'note', label: '备注', type: 'textarea' }
  ]
  if (item.kind === 'text') fields.push({ key: 'text', label: '文字内容', type: 'textarea' })
  if (item.kind === 'link') fields.push({ key: 'url', label: '链接地址' })
  ui.openForm({
    title: '编辑收藏',
    fields,
    values: {
      title: item.title,
      folder: item.folderId || '',
      tags: item.tags.join('，'),
      summary: item.summary,
      note: item.note,
      text: item.text,
      url: item.url
    },
    onSubmit(v) {
      const title = String(v.title || '').trim().slice(0, 160)
      if (!title) {
        ui.toast('标题名不能为空', 'err')
        return false
      }
      if (item.kind === 'link' && !/^https?:\/\//i.test(String(v.url || '').trim())) {
        ui.toast('链接需要以 http 或 https 开头', 'err')
        return false
      }
      store.commit((st) => {
        const target = st.favorites.items.find((x) => x.id === item.id)
        if (!target) return
        target.title = title
        target.folderId = String(v.folder || '') || null
        target.tags = String(v.tags || '')
          .split(/[,，#\s]+/)
          .map((x) => x.trim().slice(0, 24))
          .filter(Boolean)
          .filter((x, i, arr) => arr.indexOf(x) === i)
          .slice(0, 12)
        target.summary = String(v.summary || '').trim().slice(0, 2400)
        target.note = String(v.note || '').trim().slice(0, 4000)
        if (item.kind === 'text') target.text = String(v.text || '').trim().slice(0, 8000)
        if (item.kind === 'link') target.url = String(v.url || '').trim().slice(0, 2000)
        target.updatedAt = nowISO()
      })
      ui.toast('收藏已更新')
    }
  })
}

function removeFavorite(item: FavoriteItem): void {
  ui.askConfirm({
    title: '删除收藏',
    message: `「${item.title}」会从收藏列表删除，文件数据也一起移除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.favorites.items = st.favorites.items.filter((x) => x.id !== item.id)
      })
      ui.toast('已删除')
    }
  })
}

function kindLabel(kind: FavoriteKind): string {
  return { text: '文字', link: '链接', image: '图片', file: '文件' }[kind]
}

function formatSize(bytes: number): string {
  if (!bytes) return '未知大小'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function displayImage(item: FavoriteItem): string {
  return item.image
}

function fileHref(item: FavoriteItem): string {
  return item.fileData
}
</script>

<template>
  <PageHeader
    title="收藏"
    :subtitle="`${totalItems} 条收藏 · ${folders.length} 个收藏夹`"
  >
    <template #actions>
      <button class="btn" @click="openNewFolder">+ 新建收藏夹</button>
    </template>
  </PageHeader>

  <input ref="imageInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onImageFile" />
  <input ref="fileInput" type="file" hidden @change="onFileFile" />

  <div class="card fav-composer">
    <div class="composer-head">
      <div class="seg kind-seg">
        <button
          v-for="k in KIND_OPTIONS"
          :key="k.key"
          :class="{ on: draftKind === k.key }"
          @click="switchKind(k.key)"
        >
          {{ k.label }}
        </button>
      </div>
      <span class="composer-hint">{{ kindHint }}</span>
    </div>

    <input v-model="draftTitle" class="field" placeholder="标题名（可空，会按内容自动补）" />

    <div class="folder-row">
      <label class="folder-label">
        <span>收藏夹</span>
        <select v-model="draftFolderId" class="field">
          <option value="">未分类</option>
          <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
        </select>
      </label>
      <button class="mini folder-new" @click="openNewFolder">+ 新建</button>
    </div>
    <input v-model="draftTags" class="field tags-field" placeholder="标签，逗号分隔（可空）" />

    <template v-if="draftKind === 'text'">
      <textarea v-model="draftText" class="field area body-area" rows="3" placeholder="要收藏的文字内容" />
    </template>

    <template v-else-if="draftKind === 'link'">
      <input v-model="draftUrl" class="field" type="url" placeholder="https://..." />
    </template>

    <template v-else-if="draftKind === 'image'">
      <div class="image-pick">
        <div v-if="imagePreview" class="image-preview">
          <img :src="effectiveImage" alt="收藏图片预览" />
          <button class="mini danger" @click="clearPreview">移除</button>
        </div>
        <button v-else class="image-add" :disabled="busy" @click="pickImage">
          {{ busy ? '压缩中…' : '+ 选择图片' }}
        </button>
        <input v-model="draftImageUrl" class="field" type="url" placeholder="或粘贴图片地址 https://..." @input="draftImage = ''" />
      </div>
    </template>

    <template v-else>
      <div v-if="draftFileData" class="file-chip">
        <div class="file-mark">文件</div>
        <div class="file-copy">
          <b>{{ draftFileName }}</b>
          <span>{{ formatSize(draftFileSize) }} · {{ draftFileType || '未知类型' }}</span>
        </div>
        <button class="mini danger" @click="clearFile">移除</button>
      </div>
      <button v-else class="image-add" :disabled="busy" @click="pickFile">
        {{ busy ? '读取中…' : `+ 选择文件（≤ ${MAX_FILE_MB}MB）` }}
      </button>
    </template>

    <textarea v-model="draftSummary" class="field area" rows="2" placeholder="概述：这条收藏讲了什么，以后为什么用得上" />
    <textarea v-model="draftNote" class="field area" rows="2" placeholder="备注：补充说明、出处、下一步动作（可空）" />

    <div class="composer-actions">
      <span class="save-tip">文字、链接、图片和文件都会保存在本机，可随数据一起导入导出。</span>
      <button class="btn btn-primary" @click="saveFavorite">收藏</button>
    </div>
  </div>

  <div class="folder-list">
    <section v-for="group in folderGroups" :key="group.id || 'loose'" class="folder-block">
      <div class="folder-head">
        <div class="folder-title">
          <span class="folder-glyph" aria-hidden="true">◆</span>
          <h2>{{ group.name }}</h2>
          <span class="folder-count">{{ group.items.length }}</span>
        </div>
        <button v-if="group.folder" class="mini" @click="renameFolder(group.folder)">改名</button>
      </div>

      <div v-if="group.items.length" class="fav-grid">
        <article v-for="item in group.items" :key="item.id" class="fav-item">
          <div class="fav-top">
            <span class="tag soft">{{ kindLabel(item.kind) }}</span>
            <span class="fav-time">{{ fmtTime(item.updatedAt) }}</span>
            <div class="fav-actions">
              <button class="mini" @click="editFavorite(item)">改</button>
              <button class="mini danger" @click="removeFavorite(item)">删</button>
            </div>
          </div>

          <div class="fav-title">{{ item.title }}</div>

          <div v-if="item.kind === 'text'" class="fav-text">{{ item.text }}</div>
          <div v-else-if="item.kind === 'link'" class="fav-link">
            <a :href="item.url" target="_blank" rel="noreferrer">{{ item.url }} ↗</a>
          </div>
          <div v-else-if="item.kind === 'image'" class="fav-image">
            <img :src="displayImage(item)" :alt="item.title" loading="lazy" />
          </div>
          <div v-else class="fav-file">
            <div class="file-mark">文件</div>
            <div class="file-copy">
              <b>{{ item.fileName || item.title }}</b>
              <span>{{ formatSize(item.fileSize) }} · {{ item.fileType || '未知类型' }}</span>
            </div>
            <a v-if="item.fileData" class="file-open" :href="fileHref(item)" :download="item.fileName || item.title">打开</a>
          </div>

          <div v-if="item.summary" class="fav-summary">{{ item.summary }}</div>
          <div v-if="item.note" class="fav-note"><span>备注</span>{{ item.note }}</div>
          <div v-if="item.tags.length" class="fav-tags">
            <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </article>
      </div>
      <div v-else class="folder-empty">这个收藏夹还是空的，新建收藏时选择它即可归入这里。</div>
    </section>

    <div v-if="!folderGroups.length" class="fav-empty">
      <div class="fav-empty-title">还没有收藏</div>
      <div>先在上面的新建收藏栏存一条文字、链接、图片或文件，也可以先建一个收藏夹。</div>
    </div>
  </div>
</template>

<style scoped>
.fav-composer { margin-bottom: 16px; }
.composer-head { display: flex; align-items: center; gap: 9px 12px; flex-wrap: wrap; }
.kind-seg { width: auto; }
.kind-seg button { min-width: 52px; }
.composer-hint { font-size: 11.5px; color: var(--muted); line-height: 1.5; }

.field {
  width: 100%; min-width: 0; height: 34px; margin-top: 8px; padding: 0 10px;
  border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--surface);
  color: var(--ink); font: inherit; font-size: 12.5px; outline: none;
}
.field:focus { border-color: var(--green); }
.tags-field { width: 100%; margin-top: 8px; }
.folder-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 8px; }
.folder-label { display: flex; align-items: center; gap: 6px; flex: none; font-size: 11.5px; color: var(--muted); }
.folder-label .field { width: 172px; height: 32px; margin-top: 0; }
.folder-new { flex: none; min-height: 32px; }
.area { height: auto; min-height: 62px; padding: 8px 10px; line-height: 1.6; resize: vertical; }
.body-area { min-height: 82px; }

.image-pick { display: grid; gap: 8px; margin-top: 8px; }
.image-add {
  width: 100%; min-height: 82px; border: 1px dashed var(--line); border-radius: var(--r-sm);
  background: var(--surface-soft); color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer;
}
.image-add:disabled { opacity: 0.6; cursor: wait; }
.image-preview { position: relative; width: fit-content; max-width: 100%; }
.image-preview img {
  display: block; max-width: 100%; max-height: 220px; border: 1px solid var(--line);
  border-radius: var(--r-sm); object-fit: contain; background: var(--surface-soft);
}
.image-preview .mini { position: absolute; top: 6px; right: 6px; background: var(--surface); }
.file-chip {
  display: flex; align-items: center; gap: 9px; margin-top: 8px; padding: 9px 10px;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-soft);
}
.file-mark {
  flex: none; padding: 3px 6px; border-radius: var(--r-xs); background: var(--green-soft);
  color: var(--green); font-family: var(--mono); font-size: 9px; letter-spacing: 0.5px;
}
.file-copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
.file-copy b { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-copy span { font-size: 9.5px; color: var(--muted); }

.composer-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.save-tip { font-size: 10.5px; color: var(--muted); line-height: 1.5; }

.folder-list { display: grid; gap: 12px; }
.folder-block { min-width: 0; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); }
.folder-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.folder-title { display: flex; align-items: center; gap: 7px; min-width: 0; }
.folder-glyph { color: var(--amber); font-size: 10px; }
.folder-title h2 { margin: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.folder-count { font-family: var(--mono); font-size: 10px; color: var(--muted); }
.folder-empty { padding: 14px 0 4px; font-size: 11.5px; color: var(--muted); line-height: 1.6; }

.fav-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 11px; }
.fav-item { min-width: 0; padding: 11px; border: 1px solid var(--line-soft); border-radius: var(--r-sm); background: var(--surface-soft); }
.fav-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.fav-time { font-size: 9.5px; color: var(--muted); }
.fav-actions { margin-left: auto; display: flex; gap: 3px; }
.fav-actions .mini { min-height: 26px; padding: 0 7px; }
.fav-title { margin-top: 6px; font-size: 13px; font-weight: 700; line-height: 1.45; word-break: break-word; }
.fav-text {
  margin-top: 5px; font-size: 12px; line-height: 1.6; color: var(--ink);
  display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;
  white-space: pre-wrap; word-break: break-word;
}
.fav-link a { display: block; margin-top: 5px; color: var(--green); font-size: 11px; word-break: break-all; }
.fav-image img {
  display: block; width: 100%; max-height: 190px; margin-top: 7px; object-fit: cover;
  border-radius: var(--r-xs); border: 1px solid var(--line); background: var(--surface);
}
.fav-file { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 8px; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--surface); }
.file-open { flex: none; color: var(--green); font-size: 10.5px; text-decoration: none; }
.file-open:hover { text-decoration: underline; }
.fav-summary { margin-top: 7px; font-size: 11.5px; line-height: 1.6; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
.fav-note {
  margin-top: 7px; padding-top: 6px; border-top: 1px dashed var(--line); font-size: 11px;
  line-height: 1.55; color: var(--amber); white-space: pre-wrap; word-break: break-word;
}
.fav-note span { display: inline-block; margin-right: 5px; font-size: 9.5px; color: var(--muted); }
.fav-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 7px; }

.fav-empty { padding: 40px 14px; border: 1px dashed var(--line); border-radius: var(--r-sm); text-align: center; background: var(--surface); }
.fav-empty-title { margin-bottom: 5px; font-size: 14px; font-weight: 700; }
.fav-empty div:last-child { font-size: 11.5px; color: var(--muted); line-height: 1.6; }

@media (max-width: 900px) {
  .fav-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .kind-seg button { min-width: 0; flex: 1; }
  .kind-seg { width: 100%; }
  .folder-row { flex-wrap: nowrap; }
  .folder-label { flex: 1 1 auto; min-width: 0; }
  .folder-label .field { flex: 1; width: 100%; min-width: 0; }
  .folder-new { flex: none; }
  .composer-actions .btn { width: 100%; }
  .fav-item { padding: 10px; }
  .fav-actions { flex-wrap: wrap; }
}
</style>