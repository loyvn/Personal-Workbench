<!--
  文件：src/views/IdeasView.vue
  说明：灵感与摘要页。快速记录灵感、标签过滤、摘要卡编辑，支持绑定作品以及转任务、转选题、转学习知识点。
  结构：页头统计 → 快速记录框 → 标签筛选 → 灵感列表 → 摘要卡
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
import { analyzeIdeaTags, mergeTags, ideaKindLabel, IDEA_CATEGORY_OPTIONS, IDEA_SUBCATEGORY_OPTIONS, IDEA_KEYWORD_OPTIONS } from '@/utils/ideaTags'
import { bindingGroup, bindingKey, currentBindingTitle, listBindingTargets } from '@/utils/bindings'
import type { ContentBinding, Idea, IdeaKind } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)

const draftKind = ref<IdeaKind>('text')
const draftText = ref('')
const draftTitle = ref('')
const draftUrl = ref('')
const draftImageUrl = ref('')
const draftImage = ref('')
const draftKeyword = ref('')
const imageBusy = ref(false)
const imageFileInput = ref<HTMLInputElement | null>(null)

const IDEA_KIND_OPTIONS: Array<{ key: 'all' | IdeaKind; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文字' },
  { key: 'link', label: '链接' },
  { key: 'image', label: '图片' }
]
const ideaTypeFilter = ref<'all' | IdeaKind>('all')
const ideaQuery = ref('')

const draftAuto = computed(() =>
  analyzeIdeaTags({ kind: draftKind.value, text: draftText.value, title: draftTitle.value, url: draftUrl.value })
)
const effectiveImage = computed(() => draftImage.value || draftImageUrl.value)
const imagePreview = computed(
  () => Boolean(effectiveImage.value) && (effectiveImage.value.startsWith('data:image/') || isHttpImageUrl(effectiveImage.value))
)

const ideas = computed(() =>
  s.value.ideas
    .slice()
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
)
const visibleIdeas = computed(() => {
  const q = ideaQuery.value.trim().toLowerCase()
  return ideas.value
    .filter((x) => (ideaTypeFilter.value === 'all' ? true : x.kind === ideaTypeFilter.value))
    .filter((x) =>
      q
        ? [x.title, x.text, x.url, ...(x.categories || []), ...(x.subcategories || []), ...(x.keywords || []), ...(x.bindings || []).map((b) => b.title)]
            .some((v) => (v || '').toLowerCase().includes(q))
        : true
    )
})
const totalBindings = computed(
  () => s.value.ideas.reduce((n, x) => n + (x.bindings || []).length, 0)
)
const bindTargets = computed(() => listBindingTargets(s.value))

const tagEditingId = ref('')
const keywordDraft = ref('')

function setDraftKind(k: 'all' | IdeaKind) {
  if (k !== 'all') draftKind.value = k
}

function resetDraft() {
  draftText.value = ''
  draftTitle.value = ''
  draftUrl.value = ''
  draftImageUrl.value = ''
  draftImage.value = ''
  draftKeyword.value = ''
}

function pickImage() {
  imageFileInput.value?.click()
}

/**
 * 图片灵感：压缩后转 dataURL 存入草稿，失败时提示格式或体积。
 */
async function onImageFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  imageBusy.value = true
  try {
    draftImage.value = await compressImage(file)
    draftImageUrl.value = ''
    if (!draftTitle.value.trim()) draftTitle.value = file.name.replace(/\.[^.]+$/, '').slice(0, 80)
    ui.toast('图片已本地压缩')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '图片处理失败', 'err')
  } finally {
    imageBusy.value = false
    input.value = ''
  }
}

function removeImage() {
  draftImage.value = ''
  draftImageUrl.value = ''
}

function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return '链接'
  }
}

/**
 * 保存一条灵感；按类型生成标题、自动标签并写 capturedAt。
 */
function capture() {
  if (draftKind.value === 'text' && !draftText.value.trim()) {
    ui.toast('先写点什么', 'err')
    return
  }
  if (draftKind.value === 'link') {
    if (!/^https?:\/\//i.test(draftUrl.value.trim())) {
      ui.toast('链接需要以 http 或 https 开头', 'err')
      return
    }
  }
  if (draftKind.value === 'image' && !imagePreview.value) {
    ui.toast('先选一张图片或填图片地址', 'err')
    return
  }
  const auto = draftAuto.value
  const manual = draftKeyword.value.split(/[,，#\s]+/).map((x) => x.trim()).filter(Boolean)
  const keywords = mergeTags(auto.keywords, manual)
  const image = draftKind.value === 'image' ? effectiveImage.value : ''
  const url = draftKind.value === 'link' ? draftUrl.value.trim() : ''
  const title =
    draftKind.value === 'link'
      ? draftTitle.value.trim() || linkHost(url)
      : draftKind.value === 'image'
        ? draftTitle.value.trim()
        : ''
  const text = draftText.value.trim().slice(0, 4000)
  store.commit((st) => {
    st.ideas.unshift({
      id: uid(),
      kind: draftKind.value,
      text,
      title,
      url,
      image,
      tags: [],
      categories: auto.categories,
      subcategories: auto.subcategories,
      keywords,
      source: 'quick',
      capturedAt: nowISO(),
      bindings: []
    })
  })
  resetDraft()
  ui.toast(manual.length ? '已记下，并加上手动关键字' : '已记下，自动标签已生成')
}

function ideaLabel(x: Idea): string {
  return x.title || x.text || x.url || '图片'
}

function ideaMatchesTag(x: Idea, group: 'categories' | 'subcategories' | 'keywords', label: string) {
  return (x[group] || []).includes(label)
}

function toggleTag(x: Idea, group: 'categories' | 'subcategories' | 'keywords', label: string) {
  store.commit((st) => {
    const target = st.ideas.find((i) => i.id === x.id)
    if (!target) return
    const list = target[group]
    const at = list.indexOf(label)
    if (at >= 0) list.splice(at, 1)
    else list.push(label)
  })
}

function addKeyword(x: Idea) {
  const values = keywordDraft.value.split(/[,，#\s]+/).map((v) => v.trim()).filter(Boolean)
  if (!values.length) return
  store.commit((st) => {
    const target = st.ideas.find((i) => i.id === x.id)
    if (!target) return
    for (const v of values) if (!target.keywords.includes(v)) target.keywords.push(v.slice(0, 24))
  })
  keywordDraft.value = ''
  ui.toast('关键字已添加')
}

/**
 * 按当前文本重新推断标签，保留用户已手工添加的关键词。
 */
function retag(x: Idea) {
  const auto = analyzeIdeaTags({ kind: x.kind, text: x.text, title: x.title, url: x.url })
  const added = auto.categories.length + auto.subcategories.length + auto.keywords.length
  if (!added) {
    ui.toast('这段内容没有识别到可用的词', 'err')
    return
  }
  store.commit((st) => {
    const target = st.ideas.find((i) => i.id === x.id)
    if (!target) return
    target.categories = mergeTags(target.categories, auto.categories)
    target.subcategories = mergeTags(target.subcategories, auto.subcategories)
    target.keywords = mergeTags(target.keywords, auto.keywords)
  })
  ui.toast('已补充自动标签')
}

function openTags(x: Idea) {
  tagEditingId.value = tagEditingId.value === x.id ? '' : x.id
  keywordDraft.value = ''
}

function removeIdea(idea: Idea) {
  ui.askConfirm({
    title: '删除灵感',
    message: `「${ideaLabel(idea).slice(0, 30)}」会删除，绑定关系也会一起移除。`,
    confirmText: '删除',
    onConfirm() {
      store.commit((st) => {
        st.ideas = st.ideas.filter((x) => x.id !== idea.id)
      })
      ui.toast('已删除')
    }
  })
}

/**
 * 打开绑定选择器，把灵感关联到自媒体/小说/产出作品。
 */
function openBind(item: Idea) {
  if (!bindTargets.value.length) {
    ui.toast('先在自媒体、小说、视频或开发里建一条内容', 'err')
    return
  }
  ui.openForm({
    title: '绑定到已有作品',
    fields: [{ key: 'target', label: '选择作品', type: 'select', options: bindTargets.value.map((x) => ({ value: x.key, label: `${x.group} · ${x.title}` })) }],
    values: { target: bindTargets.value[0].key },
    onSubmit(v) {
      const target = bindTargets.value.find((x) => x.key === String(v.target || ''))
      if (!target) {
        ui.toast('这个作品已不存在', 'err')
        return false
      }
      const existing = s.value.ideas.find((x) => x.id === item.id)?.bindings || []
      if (existing.some((b) => b.module === target.module && b.id === target.id)) {
        ui.toast('已经绑定过这个作品', 'err')
        return false
      }
      const binding: ContentBinding = { module: target.module, id: target.id, title: target.title, group: target.group }
      store.commit((st) => {
        const x = st.ideas.find((o) => o.id === item.id)
        if (x && !x.bindings.some((b) => b.module === binding.module && b.id === binding.id)) x.bindings.push(binding)
      })
      ui.toast(`已绑定到「${target.title}」`)
    }
  })
}

/**
 * 解除一条绑定；只删关系，不删除灵感原文或目标作品。
 */
function unbind(item: Idea, binding: ContentBinding) {
  store.commit((st) => {
    const x = st.ideas.find((o) => o.id === item.id)
    if (!x) return
    x.bindings = x.bindings.filter((b) => !(b.module === binding.module && b.id === binding.id))
  })
  ui.toast('已解除绑定')
}

</script>

<template>
  <PageHeader
    title="灵感"
    :subtitle="`${s.ideas.length} 条灵感 · ${totalBindings} 个作品绑定`"
  >
  </PageHeader>

  <input ref="imageFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onImageFile" />

  <div class="card idea-composer">
    <div class="composer-head">
      <div class="seg kind-seg">
        <button v-for="k in IDEA_KIND_OPTIONS.filter((x) => x.key !== 'all')" :key="k.key" :class="{ on: draftKind === k.key }" @click="setDraftKind(k.key)">
          {{ k.label }}
        </button>
      </div>
      <span class="composer-hint">
        {{ draftKind === 'text' ? '一句想法、一个判断' : draftKind === 'link' ? '只存标题、地址和说明，不抓正文' : '图片本地压缩后保存，不上传' }}
      </span>
    </div>

    <template v-if="draftKind === 'text'">
      <textarea
        v-model="draftText"
        class="composer-text"
        rows="3"
        maxlength="4000"
        placeholder="记一句：看到的、想到的、想做的"
        @keydown.ctrl.enter="capture"
      />
    </template>

    <template v-else-if="draftKind === 'link'">
      <input v-model="draftUrl" class="composer-input full" type="url" placeholder="https://..." />
      <div class="composer-grid">
        <input v-model="draftTitle" class="composer-input" placeholder="标题（可空，默认取域名）" />
        <input v-model="draftText" class="composer-input" placeholder="一句说明（可空）" />
      </div>
    </template>

    <template v-else>
      <div class="image-pick">
        <div v-if="imagePreview" class="image-preview">
          <img :src="effectiveImage" alt="灵感图片预览" />
          <button class="mini danger" @click="removeImage">移除</button>
        </div>
        <button v-else class="image-add" :disabled="imageBusy" @click="pickImage">
          {{ imageBusy ? '压缩中…' : '+ 选择图片' }}
        </button>
        <input
          v-model="draftImageUrl"
          class="composer-input full"
          type="url"
          placeholder="或粘贴图片地址 https://..."
          @input="draftImage = ''"
        />
      </div>
      <div class="composer-grid">
        <input v-model="draftTitle" class="composer-input" placeholder="图片标题（可空）" />
        <input v-model="draftText" class="composer-input" placeholder="配文（可空）" />
      </div>
    </template>

    <div class="auto-tag-line">
      <span class="auto-label">自动标签</span>
      <span v-for="c in draftAuto.categories" :key="`c-${c}`" class="tag">{{ c }}</span>
      <span v-for="c in draftAuto.subcategories" :key="`s-${c}`" class="tag soft">{{ c }}</span>
      <span v-for="c in draftAuto.keywords" :key="`k-${c}`" class="tag soft">#{{ c }}</span>
      <span v-if="!draftAuto.categories.length && !draftAuto.subcategories.length && !draftAuto.keywords.length" class="auto-empty">未识别到关键词，记下后可手动补</span>
    </div>

    <div class="composer-actions">
      <input v-model="draftKeyword" class="composer-input keyword-input" placeholder="补充关键字，逗号分隔（可空）" @keydown.enter="capture" />
      <button class="btn btn-primary" @click="capture">记下</button>
    </div>
  </div>

  <div class="ideas-shell">
    <section class="ideas-panel">
      <div class="panel-h">
        <div class="panel-title">
          <h2>灵感</h2>
          <span class="cnt">{{ visibleIdeas.length }}/{{ ideas.length }}</span>
        </div>
        <span class="panel-note">标签可手改，绑定作品后可回看</span>
      </div>
      <div class="panel-tools">
        <div class="chips type-chips">
          <button v-for="f in IDEA_KIND_OPTIONS" :key="f.key" class="chip" :class="{ on: ideaTypeFilter === f.key }" @click="ideaTypeFilter = f.key">{{ f.label }}</button>
        </div>
        <input v-model="ideaQuery" class="panel-search" type="search" placeholder="搜内容、标签或绑定作品" />
      </div>

      <div v-if="visibleIdeas.length" class="idea-list">
        <article v-for="x in visibleIdeas" :key="x.id" class="idea-item">
          <div class="idea-top">
            <div class="idea-meta">
              <span class="tag soft">{{ ideaKindLabel(x.kind) }}</span>
              <span class="idea-time">{{ fmtTime(x.capturedAt) }}</span>
            </div>
            <div class="idea-actions">
              <button class="mini" @click="openTags(x)">标签</button>
              <button class="mini" @click="openBind(x)">绑定</button>
              <button class="mini danger" @click="removeIdea(x)">删</button>
            </div>
          </div>

          <div v-if="x.kind === 'text'" class="idea-text" :title="x.text">{{ x.text }}</div>
          <div v-else-if="x.kind === 'link'" class="idea-link">
            <a :href="x.url" target="_blank" rel="noreferrer">{{ x.title || linkHost(x.url) }} ↗</a>
            <div v-if="x.text" class="idea-desc">{{ x.text }}</div>
            <div class="idea-url">{{ x.url }}</div>
          </div>
          <div v-else class="idea-image">
            <img :src="x.image" :alt="x.title || '灵感图片'" loading="lazy" />
            <div class="idea-image-body">
              <div v-if="x.title" class="idea-image-title">{{ x.title }}</div>
              <div v-if="x.text" class="idea-desc">{{ x.text }}</div>
            </div>
          </div>

          <div v-if="x.categories.length || x.subcategories.length || x.keywords.length" class="idea-tags">
            <span v-for="c in x.categories" :key="`c-${c}`" class="tag">{{ c }}</span>
            <span v-for="c in x.subcategories" :key="`s-${c}`" class="tag soft">{{ c }}</span>
            <span v-for="c in x.keywords" :key="`k-${c}`" class="tag soft">#{{ c }}</span>
          </div>

          <div v-if="(x.bindings || []).length" class="bind-chips">
            <span v-for="b in x.bindings" :key="bindingKey(b)" class="bind-chip">
              <span class="bind-group">{{ bindingGroup(b) }}</span>
              <span class="bind-name">{{ currentBindingTitle(s, b) }}</span>
              <button class="bind-x" title="解除绑定" @click="unbind(x, b)">×</button>
            </span>
          </div>

          <div v-if="tagEditingId === x.id" class="tag-editor">
            <div class="tag-group">
              <span class="tag-group-label">分类</span>
              <button
                v-for="c in IDEA_CATEGORY_OPTIONS"
                :key="c"
                class="tag-toggle"
                :class="{ on: ideaMatchesTag(x, 'categories', c) }"
                @click="toggleTag(x, 'categories', c)"
              >
                {{ c }}
              </button>
            </div>
            <div class="tag-group">
              <span class="tag-group-label">细分</span>
              <button
                v-for="c in IDEA_SUBCATEGORY_OPTIONS"
                :key="c"
                class="tag-toggle"
                :class="{ on: ideaMatchesTag(x, 'subcategories', c) }"
                @click="toggleTag(x, 'subcategories', c)"
              >
                {{ c }}
              </button>
            </div>
            <div class="tag-group">
              <span class="tag-group-label">关键字</span>
              <button
                v-for="c in IDEA_KEYWORD_OPTIONS"
                :key="c"
                class="tag-toggle"
                :class="{ on: ideaMatchesTag(x, 'keywords', c) }"
                @click="toggleTag(x, 'keywords', c)"
              >
                #{{ c }}
              </button>
            </div>
            <div class="tag-group keyword-add">
              <input v-model="keywordDraft" class="tag-input" placeholder="加自定义关键字，逗号分隔" @keydown.enter="addKeyword(x)" />
              <button class="mini" @click="addKeyword(x)">加</button>
              <button class="mini" @click="retag(x)">补自动标签</button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="panel-empty">{{ ideaQuery || ideaTypeFilter !== 'all' ? '没有符合条件的灵感' : '还没有灵感，上面记一条。' }}</div>
    </section>
  </div>
</template>

<style scoped>
.idea-composer {
  margin-bottom: 16px;
}

.composer-head {
  display: flex;
  align-items: center;
  gap: 9px 12px;
  flex-wrap: wrap;
}

.kind-seg {
  width: auto;
}

.kind-seg button {
  min-width: 52px;
}

.composer-hint {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.5;
}

.composer-text {
  width: 100%;
  margin-top: 10px;
  min-height: 76px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.composer-text:focus,
.composer-input:focus {
  border-color: var(--green);
}

.composer-input {
  height: 34px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 12.5px;
  outline: none;
}

.composer-input.full {
  width: 100%;
  margin-top: 10px;
}

.composer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.image-pick {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin-top: 10px;
}

.image-add {
  width: 100%;
  min-height: 88px;
  border: 1px dashed var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-soft);
  color: var(--muted);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.image-add:disabled {
  opacity: 0.6;
  cursor: wait;
}

.image-preview {
  position: relative;
  width: fit-content;
  max-width: 100%;
}

.image-preview img {
  display: block;
  max-width: 100%;
  max-height: 220px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  object-fit: contain;
  background: var(--surface-soft);
}

.image-preview .mini {
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--surface);
}

.auto-tag-line {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 9px;
  min-height: 24px;
}

.auto-label {
  font-size: 11px;
  color: var(--muted);
}

.auto-empty {
  font-size: 11px;
  color: var(--muted);
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.keyword-input {
  flex: 1;
}

.ideas-shell {
  display: block;
}

.ideas-panel {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}

.panel-h {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.panel-title h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.cnt {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
}

.panel-note {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}

.panel-tools {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 9px;
}

.type-chips {
  gap: 4px;
}

.type-chips .chip {
  padding: 4px 8px;
  min-height: 28px;
}

.panel-search {
  width: 100%;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  outline: none;
}

.panel-search:focus {
  border-color: var(--green);
}

.idea-list {
  margin-top: 12px;
}

.idea-item {
  padding: 10px 0;
  border-top: 1px solid var(--line-soft);
}

.idea-item:first-child {
  border-top: 0;
  padding-top: 0;
}

.idea-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.idea-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-wrap: wrap;
}

.idea-time {
  font-size: 10.5px;
  color: var(--muted);
}

.idea-actions {
  display: flex;
  gap: 3px;
  flex: none;
}

.idea-actions .mini {
  min-height: 27px;
  padding: 0 7px;
}

.idea-text {
  margin-top: 5px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.idea-link a {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--green);
  line-height: 1.5;
  word-break: break-word;
}

.idea-desc {
  margin-top: 3px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.55;
  word-break: break-word;
}

.idea-url {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--muted);
  font-family: var(--mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idea-image {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 7px;
}

.idea-image img {
  width: 92px;
  height: 70px;
  flex: none;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface-soft);
}

.idea-image-body {
  min-width: 0;
  flex: 1;
}

.idea-image-title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
}

.idea-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 7px;
}

.bind-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 7px;
}

.bind-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 4px 2px 6px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface-soft);
  font-size: 10.5px;
  color: var(--muted);
}

.bind-group {
  color: var(--green);
  flex: none;
}

.bind-name {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}

.bind-x {
  flex: none;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: var(--r-xs);
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.bind-x:hover {
  background: color-mix(in srgb, var(--red) 10%, transparent);
  color: var(--red);
}

.tag-editor {
  margin-top: 9px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface-soft);
}

.tag-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.tag-group:last-child {
  margin-bottom: 0;
}

.tag-group-label {
  width: 36px;
  flex: none;
  font-size: 11px;
  color: var(--muted);
}

.tag-toggle {
  min-height: 25px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.tag-toggle.on {
  border-color: var(--green);
  background: color-mix(in srgb, var(--green) 9%, transparent);
  color: var(--green);
}

.keyword-add {
  flex-wrap: nowrap;
}

.tag-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: var(--r-xs);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 11.5px;
  outline: none;
}

.tag-input:focus {
  border-color: var(--green);
}

.panel-empty {
  padding: 18px 0 8px;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.65;
}

@media (max-width: 560px) {
  .composer-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .composer-actions {
    flex-wrap: wrap;
  }

  .keyword-input {
    flex: 1 1 100%;
  }

  .composer-actions .btn {
    width: 100%;
  }

  .type-chips .chip {
    flex: 1;
  }

  .idea-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .bind-name {
    max-width: 130px;
  }

  .keyword-add {
    flex-wrap: wrap;
  }

  .tag-input {
    flex: 1 1 100%;
  }
}
</style>