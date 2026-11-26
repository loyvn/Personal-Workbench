<!--
  文件：src/components/MusicMiniCard.vue
  说明：专注页音乐迷你卡。展示当前歌曲、播放/暂停、上下曲、进度、打开播放器与快速选歌入口。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { musicApi, MusicApiError } from '@/api/music'
import type { FocusMusicMode } from '@/api/music'
import {
  initMusic,
  isLiked,
  next,
  onTrackEnd,
  playTrack,
  playQueue,
  playerState,
  prev,
  removeTrackFromQueue,
  seek,
  toggleLike,
  togglePlay
} from '@/services/music'
import { useUiStore } from '@/stores/ui'
import type { MusicTrack } from '@/types'

const FOCUS_BATCH_SIZE = 5
const FOCUS_QUEUE_MAX = 80

const router = useRouter()
const ui = useUiStore()
const hasCurrent = computed(() => Boolean(playerState.current))
const current = computed(() => playerState.current)

interface FocusVariant {
  key: string
  label: string
}

interface FocusGroup {
  label: string
  hint: string
  variants: FocusVariant[]
}

const GROUPS: Record<FocusMusicMode, FocusGroup> = {
  instrumental: {
    label: '纯音乐',
    hint: '无人声，适合长时间专注',
    variants: [
      { key: 'quiet', label: '安静' },
      { key: 'cheerful', label: '欢快' },
      { key: 'study', label: '学习场景' },
      { key: 'sad', label: '悲伤场景' },
      { key: 'healing', label: '治愈' },
      { key: 'sleep', label: '助眠' },
      { key: 'cafe', label: '咖啡馆' },
      { key: 'guofeng', label: '古风' },
      { key: 'cinema', label: '电影配乐' }
    ]
  },
  instrument: {
    label: '乐器',
    hint: '按乐器种类挑选器乐',
    variants: [
      { key: 'piano', label: '钢琴' },
      { key: 'guitar', label: '吉他' },
      { key: 'violin', label: '小提琴' },
      { key: 'cello', label: '大提琴' },
      { key: 'guzheng', label: '古筝' },
      { key: 'guqin', label: '古琴' },
      { key: 'erhu', label: '二胡' },
      { key: 'dizi', label: '笛子' },
      { key: 'saxophone', label: '萨克斯' },
      { key: 'drums', label: '架子鼓' }
    ]
  },
  noise: {
    label: '白噪声',
    hint: '环境声与白噪音，挡住杂音',
    variants: [
      { key: 'rain', label: '雨声' },
      { key: 'forest', label: '森林' },
      { key: 'wave', label: '海浪' },
      { key: 'stream', label: '溪流' },
      { key: 'wind', label: '大风' },
      { key: 'thunder', label: '雷声' },
      { key: 'fire', label: '炉火' },
      { key: 'night', label: '夜晚' },
      { key: 'cafe-noise', label: '咖啡馆' }
    ]
  }
}

const MODES: Array<{ key: FocusMusicMode; label: string; hint: string }> = [
  { key: 'instrumental', label: '纯音乐', hint: GROUPS.instrumental.hint },
  { key: 'instrument', label: '乐器', hint: GROUPS.instrument.hint },
  { key: 'noise', label: '白噪声', hint: GROUPS.noise.hint }
]

const activeMode = ref<FocusMusicMode | ''>('')
const activeVariant = ref('')
const modeTracks = ref<MusicTrack[]>([])
const modeBusy = ref(false)
const modeError = ref('')
const modeLabel = ref('')
const modeHint = ref('')
const focusPage = ref(0)
const focusSeen = ref<string[]>([])
const queueOpen = ref(false)
const queueSwitching = ref(false)
const queueRef = ref<HTMLElement | null>(null)
const queueListRef = ref<HTMLElement | null>(null)
const likeBusy = ref<string[]>([])
const seekValue = ref(0)
const seeking = ref(false)
let offTrackEnd: (() => void) | null = null

const displayTracks = computed(() =>
  modeTracks.value.length ? modeTracks.value : playerState.queue.slice(0, FOCUS_BATCH_SIZE)
)
const activeModeMeta = computed(() => {
  const base = MODES.find((x) => x.key === activeMode.value)
  const variant = activeMode.value
    ? GROUPS[activeMode.value].variants.find((x) => x.key === activeVariant.value)
    : null
  if (!base) {
    return {
      key: '',
      label: '当前队列',
      hint: '当前播放器队列的前 5 首'
    }
  }
  return {
    ...base,
    label: modeLabel.value || `${base.label}${variant ? ` · ${variant.label}` : ''}`,
    hint: modeHint.value || base.hint
  }
})
const duration = computed(() => playerState.duration || (current.value?.duration || 0) / 1000)
const activeIndex = computed(() => displayTracks.value.findIndex((x) => x.id === playerState.current?.id))

initMusic()

watch(
  () => playerState.currentTime,
  (value) => {
    if (!seeking.value) seekValue.value = value
  },
  { immediate: true }
)

watch(
  () => playerState.current?.id,
  () => {
    seeking.value = false
    seekValue.value = playerState.currentTime
  }
)

onMounted(() => {
  if (playerState.queue.length) modeTracks.value = playerState.queue.slice(0, 5)
  offTrackEnd = onTrackEnd(() => {
    if (!activeMode.value || !modeTracks.value.length) return false
    if (activeIndex.value !== modeTracks.value.length - 1) return false
    void loadNextBatch()
    return true
  })
})

onBeforeUnmount(() => {
  offTrackEnd?.()
  offTrackEnd = null
})

function openMusic(): void {
  void router.push('/music')
}

function formatClock(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds || 0))
  const minute = Math.floor(value / 60)
  const second = value % 60
  return `${minute}:${second.toString().padStart(2, '0')}`
}

function pad(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function applyFocusResult(result: Awaited<ReturnType<typeof musicApi.focus>>): MusicTrack[] {
  const tracks = result.tracks.slice(0, FOCUS_BATCH_SIZE)
  if (!tracks.length) throw new MusicApiError('这组音乐还没有加载到歌曲', 'FOCUS_EMPTY')
  focusPage.value = result.page
  focusSeen.value = [...new Set([...focusSeen.value, ...tracks.map((x) => x.id)])]
  modeLabel.value = result.label
  modeHint.value = result.variant ? `${result.variant} · ${result.source}` : result.source
  return tracks
}

/**
 * 聚焦页按「场景 → 风格变体」拉取一组音乐。
 * 每次切换先清空当前组和 page/seen，避免上一组的歌混进新队列；
 * 请求失败时清空 activeMode，按钮回到未选状态，并保留 modeError 供页面提示；
 * queueSwitching 用于告诉播放器“正在整组换歌”，抑制切歌瞬间的错误。
 */
async function loadCategory(mode: FocusMusicMode, variantKey: string): Promise<void> {
  if (modeBusy.value) return
  activeMode.value = mode
  activeVariant.value = variantKey
  modeError.value = ''
  modeBusy.value = true
  queueSwitching.value = true
  focusPage.value = 0
  focusSeen.value = []
  try {
    const result = await musicApi.focus(mode, { page: 0, variant: variantKey })
    const tracks = applyFocusResult(result)
    modeTracks.value = tracks
    playQueue(tracks, 0)
  } catch (err) {
    modeError.value = (err as Error)?.message || '这组音乐暂时不可用'
    modeTracks.value = []
    activeMode.value = ''
    activeVariant.value = ''
    modeLabel.value = ''
    modeHint.value = ''
  } finally {
    queueSwitching.value = false
    modeBusy.value = false
  }
}

function selectMode(mode: FocusMusicMode): void {
  void loadCategory(mode, GROUPS[mode].variants[0].key)
}

function selectVariant(key: string): void {
  const mode = activeMode.value
  if (!mode || activeVariant.value === key) return
  void loadCategory(mode, key)
}

/**
 * 队列尾部追加下一批。
 * 服务端按 page 翻页并带 exclude（已出现过的 id），前端再去重；
 * 合并后只保留最近 FOCUS_QUEUE_MAX 首，避免无限增长；
 * 加载期间 modeBusy 阻止重复点击，成功后自动播放新批第一首并滚动到它。
 */
async function loadNextBatch(): Promise<boolean> {
  if (modeBusy.value || !activeMode.value) return false
  modeBusy.value = true
  queueSwitching.value = true
  modeError.value = ''
  let loaded = false
  let firstNewId = ''
  try {
    const result = await musicApi.focus(activeMode.value, {
      page: focusPage.value + 1,
      exclude: focusSeen.value,
      variant: activeVariant.value
    })
    const incoming = applyFocusResult(result).filter((x) => !modeTracks.value.some((old) => old.id === x.id))
    if (!incoming.length) throw new MusicApiError('这一组没有新的歌曲了', 'FOCUS_EMPTY')
    const merged = [...modeTracks.value, ...incoming]
    const kept = merged.length > FOCUS_QUEUE_MAX ? merged.slice(-FOCUS_QUEUE_MAX) : merged
    modeTracks.value = kept
    firstNewId = incoming[0].id
    void playTrack(incoming[0], kept)
    loaded = true
  } catch (err) {
    modeError.value = (err as Error)?.message || '暂时没有更多歌曲了'
  } finally {
    queueSwitching.value = false
    modeBusy.value = false
  }
  if (loaded && queueOpen.value) {
    await nextTick()
    scrollQueueStart()
    revealQueueTrack(firstNewId)
  }
  return loaded
}

function playItem(index: number): void {
  const track = displayTracks.value[index]
  if (!track) return
  if (modeTracks.value.length) {
    void playTrack(track, modeTracks.value)
    return
  }
  void playTrack(track, playerState.queue)
}

function playPrev(): void {
  if (modeTracks.value.length) {
    const index = activeIndex.value
    const target = index > 0
      ? modeTracks.value[index - 1]
      : modeTracks.value[modeTracks.value.length - 1]
    if (target) void playTrack(target, modeTracks.value)
    return
  }
  prev()
}

function playNext(): void {
  if (modeTracks.value.length) {
    if (activeIndex.value >= modeTracks.value.length - 1) {
      void loadNextBatch()
      return
    }
    const target = modeTracks.value[activeIndex.value + 1]
    if (target) void playTrack(target, modeTracks.value)
    return
  }
  next()
}

function scrollQueueStart(): void {
  const el = queueRef.value
  if (!el) return
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 88)
  window.scrollTo({ top })
}

/**
 * 把新批第一首滚到队列可视区上部。
 * 等 60ms 让刚插入的行完成布局，再用 offsetTop 计算相对列表的绝对位置；
 * 与全局播放条相同的“三分之一处”策略，保证前后几首都能看到。
 */
function revealQueueTrack(trackId: string): void {
  const list = queueListRef.value
  if (!list || !trackId) return
  window.setTimeout(() => {
    const row = list.querySelector<HTMLElement>(`[data-track-id="${trackId}"]`)
    if (!row) return
    const target = Math.max(0, row.offsetTop - Math.floor(list.clientHeight / 3))
    list.scrollTo({ top: target, behavior: 'smooth' })
  }, 60)
}

function dropTrack(track: MusicTrack): void {
  if (modeBusy.value) return
  modeTracks.value = modeTracks.value.filter((x) => x.id !== track.id)
  const removed = removeTrackFromQueue(track.id)
  if (!removed) {
    modeTracks.value = playerState.queue.slice()
  }
  ui.toast('已从队列和最近播放中删除')
}

async function favoriteTrack(track: MusicTrack): Promise<void> {
  if (likeBusy.value.includes(track.id)) return
  likeBusy.value = [...likeBusy.value, track.id]
  try {
    await toggleLike(track)
  } finally {
    likeBusy.value = likeBusy.value.filter((x) => x !== track.id)
  }
}

/**
 * 展开队列并滚动到面板底部。
 * 专注页的迷你卡在页面中部，展开后如果面板向下延伸，需要把视口带到列表区域；
 * 这里先 nextTick 拿到新高度，再延迟 120ms 等待展开动画结束，避免滚动目标算短。
 */
async function toggleQueue(): Promise<void> {
  if (queueOpen.value) {
    queueOpen.value = false
    return
  }
  queueOpen.value = true
  await nextTick()
  window.setTimeout(() => {
    const el = queueRef.value
    if (!el) return
    const bottom = el.getBoundingClientRect().bottom + window.scrollY
    const top = Math.max(0, bottom - (window.innerHeight - 120))
    window.scrollTo({ top })
  }, 120)
}

function previewSeek(event: Event): void {
  const input = event.target as HTMLInputElement
  seeking.value = true
  seekValue.value = Number(input.value)
}

function commitSeek(): void {
  seek(seekValue.value)
  seeking.value = false
}
</script>

<template>
  <div class="card music-mini">
    <div class="focus-modes" role="tablist" aria-label="专注音乐模式">
      <button
        v-for="item in MODES"
        :key="item.key"
        class="focus-mode"
        :class="{ active: activeMode === item.key }"
        :aria-label="`${item.label}：${item.hint}`"
        @click="selectMode(item.key)"
      >
        {{ item.label }}
      </button>
    </div>
    <div v-if="activeMode" class="focus-variants" role="group" aria-label="专注音乐分类">
      <button
        v-for="item in GROUPS[activeMode].variants"
        :key="item.key"
        class="focus-variant"
        :class="{ active: activeVariant === item.key }"
        :disabled="modeBusy"
        @click="selectVariant(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="hasCurrent" class="mini-now">
      <div class="mini-cover" :style="current?.cover ? { backgroundImage: `url(${current.cover})` } : {}">
        <Icon v-if="!current?.cover" name="music" :size="20" />
      </div>
      <div class="mini-copy">
        <div class="mini-kicker">
          {{ playerState.playing ? '正在播放' : '已暂停' }} · {{ activeModeMeta.label }}
        </div>
        <div class="mini-title">{{ current?.name }}</div>
        <div class="mini-artist">{{ current?.artists || '未知歌手' }}</div>
      </div>
      <div class="mini-controls">
        <button class="mini-round" aria-label="上一曲" @click="playPrev">‹</button>
        <button class="mini-play" :aria-label="playerState.playing ? '暂停' : '播放'" @click="togglePlay">
          {{ playerState.playing ? '暂停' : playerState.blocked ? '继续' : '播放' }}
        </button>
        <button class="mini-round" aria-label="下一曲" @click="playNext">›</button>
      </div>
    </div>

    <div v-else class="mini-empty">
      <div class="mini-empty-icon"><Icon name="music" :size="22" /></div>
      <div class="mini-empty-copy">
        <div class="mini-kicker">音乐</div>
        <div class="mini-empty-title">选一种专注背景声</div>
        <div class="mini-empty-sub">纯音乐按场景、乐器按种类、白噪声按环境；点上方大类后可以继续选细分。</div>
      </div>
    </div>

    <div v-if="hasCurrent" class="seek-row">
      <span class="seek-time">{{ formatClock(seekValue) }}</span>
      <input
        class="seek"
        type="range"
        min="0"
        :max="Math.max(1, Math.floor(duration))"
        step="1"
        :value="seekValue"
        aria-label="音乐播放进度"
        @input="previewSeek"
        @change="commitSeek"
      />
      <span class="seek-time">{{ formatClock(duration) }}</span>
    </div>
    <div v-if="hasCurrent" class="seek-hint">拖动进度条可调整播放位置</div>

    <div v-if="modeError" class="mini-note error">{{ modeError }}</div>
    <div v-else-if="playerState.blocked" class="mini-note">浏览器拦截了自动播放，点「继续」恢复。</div>
    <div v-else-if="playerState.error" class="mini-note error">{{ playerState.error }}</div>

    <div class="queue-block">
      <button
        class="queue-head queue-toggle"
        :aria-expanded="queueOpen"
        @click="toggleQueue"
      >
        <span class="queue-title">队列</span>
        <span class="queue-actions">
          <span class="queue-count">{{ modeBusy ? '加载中…' : `${displayTracks.length} 首` }}</span>
          <span class="queue-chev">{{ queueOpen ? '收起' : '展开' }}</span>
        </span>
      </button>
      <div v-show="queueOpen" ref="queueRef" class="queue-body">
        <div v-if="queueSwitching" class="queue-loading">正在加载下一组 5 首…</div>
        <div v-if="displayTracks.length" ref="queueListRef" class="queue-list">
          <div
            v-for="(track, index) in displayTracks"
            :key="track.id"
            class="queue-row"
            :class="{ active: index === activeIndex }"
            :data-track-id="track.id"
          >
            <button class="queue-row-main" @click="playItem(index)">
              <span class="queue-index">{{ pad(index) }}</span>
              <span class="queue-copy">
                <span class="queue-name">{{ track.name }}</span>
                <span class="queue-artist">{{ track.artists || '未知歌手' }}</span>
              </span>
              <span v-if="index === activeIndex" class="queue-playing">{{ playerState.playing ? '播放中' : '已暂停' }}</span>
            </button>
            <button
              class="queue-act"
              :class="{ on: isLiked(track.id) }"
              :disabled="likeBusy.includes(track.id)"
              :title="isLiked(track.id) ? '取消收藏' : '添加到收藏歌单'"
              @click.stop="favoriteTrack(track)"
            >
              {{ isLiked(track.id) ? '已藏' : '收藏' }}
            </button>
            <button
              class="queue-act del"
              :disabled="modeBusy"
              title="从队列和最近播放中删除"
              @click.stop="dropTrack(track)"
            >
              ×
            </button>
          </div>
        </div>
        <div v-else-if="!queueSwitching" class="queue-empty">点上方「纯音乐 / 乐器 / 白噪声」，再选一个细分分类加载 5 首。</div>
      </div>
    </div>

    <div class="mini-link-line">
      <span>{{ activeModeMeta.hint }}</span>
      <button class="mini-link" @click="openMusic">打开音乐播放器 →</button>
    </div>
  </div>
</template>

<style scoped>
.music-mini { padding: 12px 14px; }
.focus-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.focus-mode {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 17px;
  background: var(--surface);
  color: var(--muted);
  font-size: 11px;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.focus-mode:hover { border-color: var(--green); color: var(--green); }
.focus-mode.active { border-color: var(--green); background: var(--green-soft); color: var(--ink); font-weight: 600; }
.focus-variants { display: flex; flex-wrap: wrap; gap: 4px; margin: -5px 0 11px; }
.focus-variant {
  min-height: 25px; padding: 0 8px; border: 1px solid var(--line-soft); border-radius: 13px;
  background: transparent; color: var(--muted); font-size: 9.5px; white-space: nowrap;
}
.focus-variant:hover { border-color: var(--green); color: var(--green); }
.focus-variant.active { border-color: var(--green); background: var(--green-soft); color: var(--green); font-weight: 600; }
.focus-variant:disabled { opacity: 0.5; }
.mini-now { display: flex; align-items: center; gap: 10px; }
.mini-cover {
  width: 48px; height: 48px; border-radius: var(--r-xs); flex: none; display: grid; place-items: center;
  background: linear-gradient(140deg, #3c6a5c 0%, #18362e 100%); background-size: cover; background-position: center;
  color: color-mix(in srgb, var(--on-cover) 90%, transparent); overflow: hidden;
}
.mini-copy { flex: 1; min-width: 0; }
.mini-kicker { font-family: var(--mono); font-size: 9.5px; letter-spacing: 1px; color: var(--green); }
.mini-title { margin-top: 2px; font-size: 13px; font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.mini-artist { margin-top: 1px; font-size: 10.5px; color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.mini-controls { display: flex; align-items: center; gap: 6px; flex: none; }
.mini-round {
  width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 50%;
  background: var(--surface); color: var(--ink); font-size: 20px; line-height: 1;
}
.mini-play {
  min-width: 64px; height: 44px; padding: 0 12px; border: 1px solid var(--green);
  border-radius: 22px; background: var(--green); color: var(--on-green); font-size: 11.5px;
}
.seek-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.seek-time { flex: none; min-width: 28px; font-family: var(--mono); font-size: 9.5px; color: var(--muted); text-align: right; }
.seek {
  width: 100%; height: 20px; margin: 0; padding: 0; appearance: none; -webkit-appearance: none;
  background: transparent; cursor: pointer;
}
.seek::-webkit-slider-runnable-track { height: 4px; border-radius: var(--r-xs); background: var(--line-soft); }
.seek::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4px;
  border-radius: 50%; border: 1px solid var(--green); background: var(--green);
}
.seek::-moz-range-track { height: 4px; border-radius: var(--r-xs); background: var(--line-soft); }
.seek::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--green); background: var(--green); }
.seek-hint { margin-top: 2px; font-size: 9.5px; color: var(--muted); }
.mini-note { margin-top: 8px; font-size: 10.5px; color: var(--muted); }
.mini-note.error { color: var(--red); }
.queue-block { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line-soft); }
.queue-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.queue-head > span:first-child { font-size: 11px; font-weight: 600; }
.queue-toggle {
  width: 100%; min-height: 32px; padding: 0; border: 0; background: transparent;
  color: inherit; text-align: left; cursor: pointer;
}
.queue-toggle:hover .queue-title { color: var(--green); }
.queue-actions { display: flex; align-items: center; gap: 8px; }
.queue-chev { font-size: 9.5px; color: var(--green); }
.queue-count { font-size: 9.5px; color: var(--muted); }
.queue-body { padding-top: 2px; scroll-margin-top: 72px; }
.queue-note { margin-top: 4px; font-size: 9.5px; color: var(--muted); }
.queue-loading { padding: 2px 2px 5px; font-size: 9.5px; color: var(--green); }
.queue-list {
  position: relative;
  display: grid;
  gap: 1px;
  max-height: 264px;
  margin-top: 3px;
  overflow-y: auto;
  scrollbar-width: thin;
  overscroll-behavior: contain;
}
.queue-list::-webkit-scrollbar { width: 4px; }
.queue-list::-webkit-scrollbar-thumb { border-radius: var(--r-xs); background: var(--line); }
.queue-row {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-height: 34px;
  padding: 2px 4px;
  border-radius: var(--r-xs);
}
.queue-row:hover { background: var(--line-soft); }
.queue-row.active { background: var(--green-soft); }
.queue-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
.queue-act {
  flex: none;
  min-width: 38px;
  height: 30px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}
.queue-act:hover { color: var(--green); background: color-mix(in srgb, var(--green) 9%, transparent); }
.queue-act.on { color: var(--green); background: var(--green-soft); font-weight: 600; }
.queue-act.del { min-width: 28px; width: 28px; font-size: 14px; line-height: 1; }
.queue-act.del:hover { color: var(--red); background: color-mix(in srgb, var(--red) 9%, transparent); }
.queue-act:disabled { opacity: 0.55; }
.queue-index { width: 18px; flex: none; font-family: var(--mono); font-size: 9px; color: var(--muted); text-align: center; }
.queue-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.queue-name { font-size: 11px; color: var(--ink); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.queue-artist { font-size: 9px; color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.queue-playing { flex: none; font-size: 9px; color: var(--green); }
.queue-empty { padding: 10px 2px; font-size: 10.5px; color: var(--muted); line-height: 1.5; }
.mini-link-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; color: var(--muted); font-size: 10px; flex-wrap: wrap; }
.mini-link { border: 0; background: none; padding: 0; color: var(--green); font-size: 10.5px; }
.mini-link:hover { text-decoration: underline; }
.mini-empty { display: flex; align-items: center; gap: 10px; }
.mini-empty-icon {
  width: 44px; height: 44px; flex: none; display: grid; place-items: center;
  border-radius: 50%; background: var(--green-soft); color: var(--green);
}
.mini-empty-copy { flex: 1; min-width: 0; }
.mini-empty-title { font-size: 13.5px; font-weight: 600; margin-top: 1px; }
.mini-empty-sub { color: var(--muted); font-size: 10.5px; margin-top: 2px; line-height: 1.5; }
@media (max-width: 420px) {
  .mini-now {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 8px;
  }
  .mini-controls {
    grid-column: 1 / -1;
    margin-left: 0;
    justify-content: flex-end;
  }
  .mini-play { min-width: 58px; }
  .focus-mode { min-height: 44px; }
  .focus-variant { min-height: 32px; padding: 0 10px; }
  .queue-toggle { min-height: 44px; }
  .queue-row { min-height: 44px; }
}
</style>
