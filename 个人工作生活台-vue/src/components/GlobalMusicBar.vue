<!--
  文件：src/components/GlobalMusicBar.vue
  说明：全局播放条与播放队列。所有路由共用；负责播放/暂停、上下曲、进度、收藏、模式、音量、队列展开与当前歌曲自动定位。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Icon from '@/components/Icon.vue'
import {
  isLiked,
  next,
  playerState,
  playTrack,
  prev,
  removeTrackFromQueue,
  seek,
  setMode,
  setVolume,
  toggleLike,
  togglePlay
} from '@/services/music'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import type { MusicMode } from '@/types'

const route = useRoute()
const store = useDeskStore()
const ui = useUiStore()
const queueOpen = ref(false)
const seeking = ref(false)
const seekValue = ref(0)
const volumeValue = ref(playerState.volume)
const likeBusy = ref(false)
const queueListRef = ref<HTMLElement | null>(null)

const MODES: Array<{ value: MusicMode; label: string }> = [
  { value: 'sequence', label: '顺序' },
  { value: 'loop', label: '列表循环' },
  { value: 'single', label: '单曲循环' },
  { value: 'shuffle', label: '随机' }
]

const enabled = computed(() => store.data.music.settings.showGlobalBar !== false)
const visible = computed(() => Boolean(playerState.current) && enabled.value)
const current = computed(() => playerState.current)
const total = computed(() => playerState.duration || (current.value?.duration || 0) / 1000)
const modeLabel = computed(() => MODES.find((x) => x.value === playerState.mode)?.label || '列表循环')
const liked = computed(() => (current.value ? isLiked(current.value.id) : false))
const activeIndex = computed(() => playerState.queue.findIndex((x) => x.id === current.value?.id))
const timeLabel = computed(() => formatClock(seekValue.value))
const totalLabel = computed(() => formatClock(total.value))
const coverStyle = computed(() => (current.value?.cover ? { backgroundImage: `url("${current.value.cover.replace(/"/g, '%22')}")` } : {}))

watch(
  () => playerState.currentTime,
  (value) => {
    if (!seeking.value) seekValue.value = value
  },
  { immediate: true }
)

watch(
  () => current.value?.id,
  () => {
    seeking.value = false
    seekValue.value = playerState.currentTime
    volumeValue.value = playerState.volume
  }
)

/**
 * 切歌后自动定位队列中的当前行。
 * 监听当前歌曲 id、activeIndex 和队列长度三个来源：
 * - 手动点歌 / 上下曲会改 id；
 * - 自动结束、删除队列会改索引或长度，但 id 可能不变。
 * DOM 必须等 nextTick 后才有新行，scrollActiveRow 再按“行顶部距列表顶部 + 当前滚动量”换算，
 * 把目标行放到可视区上方约三分之一处，给上下文留出前后几首。
 */
watch(
  [() => current.value?.id, activeIndex, () => playerState.queue.length],
  async () => {
    if (!queueOpen.value || activeIndex.value < 0) return
    await nextTick()
    scrollActiveRow()
  }
)

watch(
  () => playerState.volume,
  (value) => {
    volumeValue.value = value
  }
)

watch(
  () => route.fullPath,
  () => {
    queueOpen.value = false
  }
)

watch(visible, (on) => {
  if (!on) queueOpen.value = false
})

function formatClock(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

function previewSeek(event: Event): void {
  seeking.value = true
  seekValue.value = Number((event.target as HTMLInputElement).value) || 0
}

function commitSeek(): void {
  seek(seekValue.value)
  seeking.value = false
}

function changeVolume(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value) || 0
  volumeValue.value = value
  setVolume(value)
}

function cycleMode(): void {
  const index = MODES.findIndex((x) => x.value === playerState.mode)
  const nextMode = MODES[(index + 1) % MODES.length]
  setMode(nextMode.value)
  ui.toast(`播放模式：${nextMode.label}`)
}

function selectMode(mode: MusicMode): void {
  setMode(mode)
  ui.toast(`播放模式：${MODES.find((x) => x.value === mode)?.label || mode}`)
}

async function favoriteCurrent(): Promise<void> {
  if (!current.value || likeBusy.value) return
  likeBusy.value = true
  try {
    await toggleLike(current.value)
  } finally {
    likeBusy.value = false
  }
}

/**
 * 展开队列后立即定位当前歌曲。
 * 首次展开时 activeIndex 监听不会触发（值没变），所以这里主动 nextTick + scroll，
 * 避免一次 100 多首的队列总是从第一首开始显示。
 */
async function toggleQueue(): Promise<void> {
  if (queueOpen.value) {
    queueOpen.value = false
    return
  }
  queueOpen.value = true
  await nextTick()
  scrollActiveRow()
}

/**
 * 把当前歌曲行滚到列表上部约 1/3 处。
 * getBoundingClientRect 的 top 是视口坐标，两行相减得到相对列表的偏移，
 * 再加 list.scrollTop 转为 scrollTo 需要的绝对内容坐标；
 * 先算 rowTop 再减可视高度三分之一，避免把目标行滚到最顶部导致看不到上一首的上下文。
 */
function scrollActiveRow(): void {
  const list = queueListRef.value
  if (!list) return
  const row = list.querySelector<HTMLElement>('.gm-queue-row.active')
  if (!row) return
  const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
  const target = Math.max(0, rowTop - Math.floor(list.clientHeight / 3))
  list.scrollTo({ top: target, behavior: 'smooth' })
}

function pickTrack(trackId: string): void {
  if (current.value?.id === trackId) {
    void togglePlay()
    return
  }
  const track = playerState.queue.find((x) => x.id === trackId)
  if (track) void playTrack(track, playerState.queue)
}

function dropTrack(trackId: string): void {
  if (removeTrackFromQueue(trackId)) ui.toast('已从队列和最近播放中删除')
}
</script>

<template>
  <div v-if="visible && queueOpen" class="gm-queue-panel">
    <div class="gm-queue-head">
      <div class="gm-queue-title">
        播放队列 <span>{{ playerState.queue.length }} 首</span>
      </div>
      <div class="gm-queue-tools">
        <button
          v-for="m in MODES"
          :key="m.value"
          class="gm-queue-mode"
          :class="{ on: playerState.mode === m.value }"
          @click="selectMode(m.value)"
        >
          {{ m.label }}
        </button>
        <button class="gm-queue-close" aria-label="收起播放队列" @click="queueOpen = false">×</button>
      </div>
    </div>
    <div ref="queueListRef" class="gm-queue-list">
      <div
        v-for="(track, index) in playerState.queue"
        :key="track.id"
        class="gm-queue-row"
        :class="{ active: index === activeIndex }"
      >
        <button class="gm-queue-main" @click="pickTrack(track.id)">
          <span class="gm-q-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="gm-q-copy">
            <span class="gm-q-name">{{ track.name }}</span>
            <span class="gm-q-artist">{{ track.artists || '未知歌手' }}</span>
          </span>
          <span v-if="index === activeIndex" class="gm-q-state">{{ playerState.playing ? '播放中' : '已暂停' }}</span>
        </button>
        <button
          class="gm-q-act"
          :class="{ on: isLiked(track.id) }"
          :title="isLiked(track.id) ? '取消收藏' : '添加到收藏歌单'"
          @click="toggleLike(track)"
        >
          {{ isLiked(track.id) ? '已藏' : '收藏' }}
        </button>
        <button class="gm-q-act del" title="从队列和最近播放中删除" @click="dropTrack(track.id)">×</button>
      </div>
    </div>
  </div>

  <div v-if="visible" class="global-musicbar">
    <RouterLink to="/music" class="gm-track">
      <span class="gm-cover" :style="coverStyle">
        <Icon v-if="!current?.cover" name="music" :size="16" />
      </span>
      <span class="gm-copy">
        <span class="gm-kicker">{{ playerState.playing ? '正在播放' : '已暂停' }} · {{ modeLabel }}</span>
        <b>{{ current?.name }}</b>
        <span>{{ current?.artists || '未知歌手' }}</span>
      </span>
    </RouterLink>

    <button class="gm-like" :class="{ on: liked }" :disabled="likeBusy" @click="favoriteCurrent">
      {{ liked ? '已收藏' : '收藏' }}
    </button>

    <div class="gm-seek">
      <input
        class="gm-range"
        type="range"
        min="0"
        :max="Math.max(1, Math.floor(total))"
        step="1"
        :value="seekValue"
        aria-label="拖动调整播放进度"
        @input="previewSeek"
        @change="commitSeek"
      />
      <span class="gm-time">{{ timeLabel }} / {{ totalLabel }}</span>
    </div>

    <div class="gm-controls">
      <button class="gm-btn" aria-label="上一曲" @click="prev">‹</button>
      <button class="gm-play" :aria-label="playerState.playing ? '暂停' : '播放'" @click="togglePlay">
        {{ playerState.playing ? '暂停' : playerState.blocked ? '继续' : '播放' }}
      </button>
      <button class="gm-btn" aria-label="下一曲" @click="next()">›</button>
    </div>

    <button class="gm-mode" :title="`当前播放模式：${modeLabel}，点击切换`" @click="cycleMode">
      {{ modeLabel }}
    </button>

    <div class="gm-volume">
      <span class="gm-vol-label">音量</span>
      <input
        class="gm-vol-range"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumeValue"
        aria-label="调整音量"
        @input="changeVolume"
      />
      <b>{{ volumeValue }}</b>
    </div>

    <button class="gm-list" :class="{ on: queueOpen }" :aria-expanded="queueOpen" @click="toggleQueue">
      列表 <b>{{ playerState.queue.length }}</b>
    </button>

    <RouterLink v-if="route.name !== 'music'" to="/music" class="gm-open">播放器</RouterLink>
  </div>
</template>

<style scoped>
.global-musicbar {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 25;
  display: flex; align-items: center; gap: 8px; padding: 8px 11px 8px 9px;
  width: min(980px, calc(100vw - 40px));
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent); border-radius: var(--r);
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(16px) saturate(1.04);
}
html[data-theme='dark'] .global-musicbar { box-shadow: 0 16px 42px -18px rgba(0, 0, 0, 0.72); }
.gm-track {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 150px;
  color: var(--ink); text-decoration: none;
}
.gm-cover {
  width: 40px; height: 40px; flex: none; display: grid; place-items: center; overflow: hidden;
  border-radius: var(--r-xs); background: linear-gradient(140deg, #3c6a5c 0%, #18362e 100%);
  background-size: cover; background-position: center; color: color-mix(in srgb, var(--on-cover) 90%, transparent);
}
.gm-copy { min-width: 0; display: flex; flex-direction: column; gap: 0; }
.gm-kicker { font-family: var(--mono); font-size: 8.5px; letter-spacing: 0.6px; color: var(--green); }
.gm-copy b { font-size: 11.5px; font-weight: 600; line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-copy > span:last-child { font-size: 9.5px; color: var(--muted); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-like {
  width: 44px; flex: none; height: 29px; padding: 0 7px; border: 1px solid var(--line);
  border-radius: 15px; background: transparent; color: var(--muted); font-size: 9.5px; white-space: nowrap;
}
.gm-like:hover, .gm-like.on { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.gm-like:disabled { opacity: 0.6; }
.gm-seek { display: flex; align-items: center; gap: 5px; width: 176px; flex: none; }
.gm-range, .gm-vol-range {
  min-width: 0; margin: 0; padding: 0; height: 20px; appearance: none; -webkit-appearance: none;
  background: transparent; cursor: pointer;
}
.gm-range { flex: 1; }
.gm-range::-webkit-slider-runnable-track { height: 3px; border-radius: var(--r-xs); background: var(--line-soft); }
.gm-range::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none; width: 12px; height: 12px; margin-top: -4.5px;
  border-radius: 50%; border: 1px solid var(--green); background: var(--green);
}
.gm-range::-moz-range-track { height: 3px; border-radius: var(--r-xs); background: var(--line-soft); }
.gm-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--green); background: var(--green); }
.gm-time { flex: none; width: 61px; font-family: var(--mono); font-size: 8.5px; color: var(--muted); text-align: right; white-space: nowrap; }
.gm-controls { display: flex; align-items: center; gap: 1px; flex: none; }
.gm-btn { width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); font-size: 18px; line-height: 1; }
.gm-btn:hover { color: var(--green); background: var(--green-soft); }
.gm-play {
  min-width: 58px; height: 34px; padding: 0 8px; border: 1px solid var(--green); border-radius: 17px;
  background: var(--green); color: var(--on-green); font-size: 10px;
}
.gm-mode {
  flex: none; min-width: 46px; height: 29px; padding: 0 7px; border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--surface); color: var(--green); font-size: 9px; white-space: nowrap;
}
.gm-mode:hover { border-color: var(--green); background: var(--green-soft); }
.gm-volume { display: flex; align-items: center; gap: 5px; width: 104px; flex: none; }
.gm-vol-label { flex: none; font-size: 8.5px; color: var(--muted); }
.gm-vol-range { flex: 1; }
.gm-vol-range::-webkit-slider-runnable-track { height: 3px; border-radius: var(--r-xs); background: var(--line-soft); }
.gm-vol-range::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none; width: 10px; height: 10px; margin-top: -3.5px;
  border-radius: 50%; border: 1px solid var(--muted); background: var(--surface);
}
.gm-vol-range::-moz-range-track { height: 3px; border-radius: var(--r-xs); background: var(--line-soft); }
.gm-vol-range::-moz-range-thumb { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--muted); background: var(--surface); }
.gm-volume b { flex: none; width: 18px; font-family: var(--mono); font-size: 8.5px; color: var(--muted); text-align: right; }
.gm-list {
  flex: none; height: 29px; min-width: 53px; padding: 0 8px; border: 1px solid var(--line);
  border-radius: 15px; background: var(--surface); color: var(--muted); font-size: 9.5px; white-space: nowrap;
}
.gm-list b { margin-left: 2px; font-family: var(--mono); font-size: 8.5px; color: var(--green); }
.gm-list:hover, .gm-list.on { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.gm-open { flex: none; min-width: 42px; color: var(--green); font-size: 9.5px; text-align: right; text-decoration: none; white-space: nowrap; }
.gm-open:hover { text-decoration: underline; }

.gm-queue-panel {
  position: fixed; left: 50%; bottom: 86px; transform: translateX(-50%); z-index: 26;
  width: min(600px, calc(100vw - 40px)); max-height: min(440px, 58vh);
  display: flex; flex-direction: column;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent); border-radius: var(--r);
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(16px) saturate(1.04);
}
html[data-theme='dark'] .gm-queue-panel { box-shadow: 0 20px 54px -22px rgba(0, 0, 0, 0.8); }
.gm-queue-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 11px 12px 9px; border-bottom: 1px solid var(--line-soft);
}
.gm-queue-title { flex: none; font-size: 11px; font-weight: 600; }
.gm-queue-title span { margin-left: 5px; font-family: var(--mono); font-size: 9px; font-weight: 400; color: var(--muted); }
.gm-queue-tools { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; flex-wrap: wrap; }
.gm-queue-mode {
  height: 25px; padding: 0 7px; border: 1px solid transparent; border-radius: var(--r-xs);
  background: transparent; color: var(--muted); font-size: 9px; white-space: nowrap;
}
.gm-queue-mode:hover { color: var(--green); }
.gm-queue-mode.on { border-color: var(--green); background: var(--green-soft); color: var(--green); font-weight: 600; }
.gm-queue-close { width: 30px; height: 30px; border: 0; background: transparent; color: var(--muted); font-size: 15px; }
.gm-queue-close:hover { color: var(--green); }
.gm-queue-list {
  padding: 4px; overflow-y: auto; max-height: 380px; scrollbar-width: thin;
  overscroll-behavior: contain;
}
.gm-queue-list::-webkit-scrollbar { width: 4px; }
.gm-queue-list::-webkit-scrollbar-thumb { border-radius: var(--r-xs); background: var(--line); }
.gm-queue-row { display: flex; align-items: center; gap: 2px; min-height: 38px; padding: 2px 4px; border-radius: var(--r-sm); }
.gm-queue-row:hover { background: var(--line-soft); }
.gm-queue-row.active { background: var(--green-soft); }
.gm-queue-main {
  flex: 1; min-width: 0; min-height: 34px; display: flex; align-items: center; gap: 8px;
  padding: 0; border: 0; background: transparent; text-align: left;
}
.gm-q-index { width: 20px; flex: none; text-align: center; font-family: var(--mono); font-size: 9px; color: var(--muted); }
.gm-q-copy { flex: 1; min-width: 0; display: grid; gap: 1px; }
.gm-q-name { font-size: 11px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-q-artist { font-size: 9px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gm-q-state { flex: none; font-size: 9px; color: var(--green); }
.gm-q-act {
  flex: none; min-width: 38px; height: 30px; padding: 0 4px; border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted); font-size: 9px; white-space: nowrap;
}
.gm-q-act:hover { color: var(--green); background: color-mix(in srgb, var(--green) 10%, transparent); }
.gm-q-act.on { color: var(--green); background: var(--green-soft); font-weight: 600; }
.gm-q-act.del { min-width: 26px; width: 26px; font-size: 14px; line-height: 1; }
.gm-q-act.del:hover { color: var(--red); background: color-mix(in srgb, var(--red) 10%, transparent); }

@media (max-width: 1140px) {
  .gm-open { display: none; }
  .gm-seek { width: 150px; }
}
@media (max-width: 820px) {
  .global-musicbar { width: calc(100vw - 24px); gap: 6px; }
  .gm-track { min-width: 130px; }
  .gm-seek { width: 128px; }
  .gm-mode { min-width: 42px; }
  .gm-volume { width: 84px; }
  .gm-vol-label { display: none; }
}
@media (max-width: 720px) {
  .global-musicbar {
    bottom: 70px; width: calc(100vw - 20px);
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'track like list'
      'seek seek seek'
      'controls volume mode';
    gap: 5px 7px; padding: 7px 8px; border-radius: var(--r-sm);
  }
  .gm-track { grid-area: track; min-width: 0; }
  .gm-like { grid-area: like; width: 100%; height: 30px; }
  .gm-list { grid-area: list; height: 30px; }
  .gm-seek { grid-area: seek; width: auto; min-width: 0; }
  .gm-controls { grid-area: controls; justify-content: flex-start; }
  .gm-volume { grid-area: volume; width: 86px; }
  .gm-mode { grid-area: mode; min-width: 48px; }
  .gm-cover { width: 38px; height: 38px; }
  .gm-copy b { font-size: 11px; }
  .gm-time { width: 57px; font-size: 8px; }
  .gm-btn { width: 36px; height: 34px; }
  .gm-play { min-width: 54px; height: 34px; }
  .gm-queue-panel { width: min(600px, calc(100vw - 20px)); bottom: 196px; max-height: min(420px, 55vh); border-radius: var(--r-sm); }
  .gm-queue-head { align-items: flex-start; padding: 9px 10px 7px; }
  .gm-queue-tools { gap: 2px; }
  .gm-queue-mode { height: 28px; padding: 0 6px; }
  .gm-queue-list { max-height: 330px; }
  .gm-queue-row { min-height: 42px; }
  .gm-queue-main { min-height: 38px; }
  .gm-q-act { min-width: 36px; height: 34px; }
  .gm-q-act.del { min-width: 28px; width: 28px; }
}

@media (min-width: 721px) and (max-width: 1100px) {
  .gm-volume { display: none; }
}

@media (min-width: 721px) and (max-width: 900px) {
  .global-musicbar { width: min(700px, calc(100vw - 40px)); }
}

@media (min-width: 901px) {
  .global-musicbar {
    left: calc(50% + 106px);
    width: min(880px, calc(100vw - 260px));
  }
  .gm-queue-panel {
    left: calc(50% + 106px);
    width: min(600px, calc(100vw - 260px));
  }
}
</style>
