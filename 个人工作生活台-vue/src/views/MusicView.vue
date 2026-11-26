<!--
  文件：src/views/MusicView.vue
  说明：音乐页。提供发现/我的两个视图，包含 QQ 扫码登录、风格歌单、歌曲/歌单搜索、歌单详情、收藏、最近播放与播放器控制。
  结构：页头 → 发现/我的页签 → 播放器主卡 → 发现页风格胶囊/搜索/风格歌单/歌单详情；我的页账号/收藏/最近播放
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import Icon from '@/components/Icon.vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { musicApi, MusicApiError } from '@/api/music'
import type {
  DiscoverResult,
  MeResult,
  MusicAccount,
  MusicStatus,
  MusicStyle,
  PlaylistDetailResult,
  QrCheckResult,
  QrStartResult,
  SearchResult
} from '@/api/music'
import {
  initMusic,
  isLiked,
  next,
  playerState,
  playQueue,
  playTrack,
  prev,
  seek,
  setMode,
  setVolume,
  toggleLike,
  togglePlay
} from '@/services/music'
import type { MusicMode, MusicPlaylist, MusicTrack } from '@/types'

const router = useRouter()
const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)

const tab = ref<'discover' | 'mine'>('discover')
const status = ref<MusicStatus | null>(null)
const statusLoading = ref(false)
const statusError = ref('')
const styles = ref<MusicStyle[]>([])
const playlists = ref<MusicPlaylist[]>([])
const discoveryLoading = ref(false)
const discoveryError = ref('')
const serviceBase = ref('')
const serviceBusy = ref(false)

const searchQuery = ref('')
const searchType = ref<'song' | 'playlist'>('song')
const searchLoading = ref(false)
const searchError = ref('')
const searchResult = ref<SearchResult | null>(null)

const detail = ref<PlaylistDetailResult | null>(null)
const detailLoading = ref(false)

const me = ref<MeResult | null>(null)
const meLoading = ref(false)
const meError = ref('')
const qr = ref<QrStartResult | null>(null)
const qrStatus = ref<QrCheckResult | null>(null)
const qrLoading = ref(false)
let qrTimer: number | null = null

const modeOptions: Array<{ value: MusicMode; label: string }> = [
  { value: 'sequence', label: '顺序' },
  { value: 'loop', label: '列表循环' },
  { value: 'single', label: '单曲循环' },
  { value: 'shuffle', label: '随机' }
]
const modeLabel = computed(() => modeOptions.find((x) => x.value === playerState.mode)?.label || '列表循环')
const current = computed(() => playerState.current)
const progress = computed(() => {
  const total = playerState.duration || (current.value?.duration || 0) / 1000
  return total > 0 ? Math.min(100, (playerState.currentTime / total) * 100) : 0
})
const liked = computed(() => (current.value ? isLiked(current.value.id) : false))
const recent = computed(() => s.value.music.recent)
const localLiked = computed(() => s.value.music.liked)
const displayLiked = computed(() => (me.value?.likedSongs?.length ? me.value.likedSongs : localLiked.value))
const myPlaylists = computed(() => me.value?.playlists || [])
const account = computed(() => me.value?.account || status.value?.account || null)
const isLoggedIn = computed(() => Boolean(me.value?.loggedIn || status.value?.loggedIn))
const activeStyle = computed(() => s.value.music.settings.style)
const activeStyleLabel = computed(() => styles.value.find((x) => x.cat === activeStyle.value)?.label || activeStyle.value)
const searchSongs = computed(() => (searchType.value === 'song' ? searchResult.value?.songs || [] : []))
const searchPlaylists = computed(() => (searchType.value === 'playlist' ? searchResult.value?.playlists || [] : []))

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatPlayCount(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)} 亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)} 万`
  return String(value)
}

function coverStyle(item: MusicTrack | MusicPlaylist | null): Record<string, string> {
  if (item?.cover) return { backgroundImage: `url("${item.cover.replace(/"/g, '%22')}")` }
  return {}
}

function errorMessage(err: unknown): string {
  return err instanceof MusicApiError ? err.message : (err as Error)?.message || '操作失败'
}

/**
 * 读取音乐服务地址与默认风格/音量，供页面初始化播放器与设置表单。
 */
async function loadConfig(): Promise<void> {
  try {
    const cfg = await musicApi.getConfig()
    serviceBase.value = cfg.baseUrl
  } catch {
    /* 服务地址读取失败时用默认值，由连接状态提示 */
    serviceBase.value = 'http://127.0.0.1:3200'
  }
}

/**
 * 刷新连接与登录状态；silent 用于轮询，不反复弹错误提示。
 */
async function refreshStatus(silent = false): Promise<void> {
  if (!silent) statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await musicApi.status()
    playerState.loggedIn = Boolean(status.value.loggedIn)
    if (!status.value.connected) statusError.value = status.value.error || '音乐服务未连接'
    if (status.value.connected) {
      await loadStylesAndDiscovery()
      if (status.value.loggedIn) await refreshMe()
    }
  } catch (err) {
    status.value = null
    statusError.value = errorMessage(err)
  } finally {
    statusLoading.value = false
  }
}

/**
 * 加载风格分类与推荐歌单，失败时保留页面其他功能。
 */
async function loadStylesAndDiscovery(): Promise<void> {
  discoveryLoading.value = true
  discoveryError.value = ''
  try {
    const [styleList, result] = await Promise.all([
      musicApi.styles(),
      musicApi.discover(activeStyle.value, 12)
    ])
    styles.value = styleList
    playlists.value = result.playlists
  } catch (err) {
    discoveryError.value = errorMessage(err)
  } finally {
    discoveryLoading.value = false
  }
}

async function chooseStyle(style: MusicStyle): Promise<void> {
  store.commit((st) => {
    st.music.settings.style = style.cat
  })
  detail.value = null
  searchResult.value = null
  await loadStylesAndDiscovery()
}

/**
 * 打开歌单详情并拉取曲目；只展示当前歌单，避免大列表常驻。
 */
async function openPlaylist(playlist: MusicPlaylist): Promise<void> {
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await musicApi.playlist(playlist.id)
  } catch (err) {
    ui.toast(errorMessage(err), 'err')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail(): void {
  detail.value = null
}

function playSong(track: MusicTrack, queue: MusicTrack[]): void {
  void playTrack(track, queue)
}

function playDetail(): void {
  if (!detail.value?.tracks.length) return
  playQueue(detail.value.tracks)
  ui.toast(`开始播放《${detail.value.playlist.name}》`)
}

/**
 * 搜索歌曲或歌单；结果分类型展示，空关键词不请求。
 */
async function doSearch(): Promise<void> {
  const q = searchQuery.value.trim()
  if (!q) {
    searchResult.value = null
    return
  }
  searchLoading.value = true
  searchError.value = ''
  try {
    searchResult.value = await musicApi.search(q)
    detail.value = null
  } catch (err) {
    searchError.value = errorMessage(err)
    searchResult.value = null
  } finally {
    searchLoading.value = false
  }
}

function clearSearch(): void {
  searchQuery.value = ''
  searchResult.value = null
  searchError.value = ''
}

function onProgress(e: Event): void {
  const pct = Number((e.target as HTMLInputElement).value) || 0
  const total = playerState.duration || (current.value?.duration || 0) / 1000
  seek((pct / 100) * total)
}

function onVolume(e: Event): void {
  setVolume(Number((e.target as HTMLInputElement).value))
}

function changeMode(mode: MusicMode): void {
  setMode(mode)
}

function togglePlayer(): void {
  void togglePlay()
}

async function saveService(): Promise<void> {
  serviceBusy.value = true
  statusError.value = ''
  try {
    status.value = await musicApi.setConfig(serviceBase.value)
    if (status.value.connected) {
      ui.toast('音乐服务已连接')
      await loadStylesAndDiscovery()
    } else {
      statusError.value = status.value.error || '仍未连接到音乐服务'
    }
  } catch (err) {
    statusError.value = errorMessage(err)
    ui.toast(statusError.value, 'err')
  } finally {
    serviceBusy.value = false
  }
}

/**
 * 拉取登录用户歌单与喜欢列表；未登录时只展示本地收藏。
 */
async function refreshMe(): Promise<void> {
  if (!status.value?.loggedIn && !me.value?.loggedIn) return
  meLoading.value = true
  meError.value = ''
  try {
    me.value = await musicApi.me()
  } catch (err) {
    meError.value = errorMessage(err)
  } finally {
    meLoading.value = false
  }
}

function stopQrTimer(): void {
  if (qrTimer) {
    window.clearInterval(qrTimer)
    qrTimer = null
  }
}

/**
 * 生成扫码登录二维码并轮询状态，成功后刷新我的页数据。
 */
async function startLogin(): Promise<void> {
  stopQrTimer()
  qrLoading.value = true
  qrStatus.value = null
  try {
    qr.value = await musicApi.startQr()
    qrStatus.value = { status: 'waiting', message: '等待扫码' }
    const key = qr.value.key
    qrTimer = window.setInterval(async () => {
      try {
        const result = await musicApi.checkQr(key)
        qrStatus.value = result
        if (result.status === 'success') {
          stopQrTimer()
          ui.toast(`登录成功${result.account?.nickname ? '：' + result.account.nickname : ''}`)
          await refreshStatus(true)
          tab.value = 'mine'
        } else if (result.status === 'expired' || result.status === 'error') {
          stopQrTimer()
        }
      } catch (err) {
        qrStatus.value = { status: 'error', message: errorMessage(err) }
        stopQrTimer()
      }
    }, 2500)
  } catch (err) {
    qrStatus.value = { status: 'error', message: errorMessage(err) }
    ui.toast(errorMessage(err), 'err')
  } finally {
    qrLoading.value = false
  }
}

async function logout(): Promise<void> {
  try {
    await musicApi.logout()
    me.value = null
    playerState.loggedIn = false
    qr.value = null
    qrStatus.value = null
    stopQrTimer()
    await refreshStatus(true)
    ui.toast('已退出 QQ 音乐登录')
  } catch (err) {
    ui.toast(errorMessage(err), 'err')
  }
}

function switchTab(nextTab: 'discover' | 'mine'): void {
  tab.value = nextTab
  if (nextTab === 'mine' && status.value?.loggedIn && !me.value && !meLoading.value) void refreshMe()
}

function goFocus(): void {
  void router.push('/focus')
}

onMounted(async () => {
  initMusic()
  await loadConfig()
  await refreshStatus()
  if (status.value?.loggedIn) void refreshMe()
})

onBeforeUnmount(() => {
  stopQrTimer()
})
</script>

<template>
  <PageHeader title="音乐" subtitle="QQ 音乐歌单、播放模式与最近播放">
    <template #actions>
      <button class="conn-pill" :class="{ ok: status?.connected, warn: status && !status.connected }" @click="refreshStatus()">
        <span class="conn-dot" />
        {{ statusLoading ? '检测中' : status?.connected ? (isLoggedIn ? account?.nickname || '已连接' : '已连接 · 未登录') : '未连接' }}
      </button>
      <button class="btn" @click="goFocus">回到专注</button>
    </template>
  </PageHeader>

  <section class="sect">
    <div class="player-hero card">
      <div class="hero-cover" :style="coverStyle(current)">
        <Icon v-if="!current?.cover" name="music" :size="30" />
      </div>
      <div class="hero-body">
        <div class="hero-eyebrow">{{ playerState.playing ? '正在播放' : (current ? '已暂停' : '准备播放') }} · {{ modeLabel }}</div>
        <div class="hero-title">{{ current?.name || '还没有播放歌曲' }}</div>
        <div class="hero-artist">
          {{ current ? `${current.artists || '未知歌手'}${current.album ? ' · ' + current.album : ''}` : '从下面的风格歌单里选一首，或搜索想听的歌' }}
        </div>
        <div class="hero-progress">
          <input type="range" min="0" max="100" :value="progress" :disabled="!current" @input="onProgress" />
          <div class="hero-time">
            <span>{{ formatSeconds(playerState.currentTime) }}</span>
            <span>{{ formatSeconds(playerState.duration || (current?.duration || 0) / 1000) }}</span>
          </div>
        </div>
        <div class="hero-controls">
          <button class="round-btn" :disabled="!playerState.queue.length" aria-label="上一曲" @click="prev">‹</button>
          <button class="play-btn" :disabled="!current" :aria-label="playerState.playing ? '暂停' : '播放'" @click="togglePlayer">
            {{ playerState.playing ? '暂停' : playerState.blocked ? '继续' : '播放' }}
          </button>
          <button class="round-btn" :disabled="!playerState.queue.length" aria-label="下一曲" @click="next()">›</button>
          <button class="mini heart" :disabled="!current" :class="{ on: liked }" @click="current && toggleLike(current)">
            {{ liked ? '已收藏' : '收藏' }}
          </button>
        </div>
        <div class="hero-foot">
          <div class="volume-line">
            <span>音量</span>
            <input type="range" min="0" max="100" :value="playerState.volume" @input="onVolume" />
            <b>{{ playerState.volume }}</b>
          </div>
          <div class="mode-line">
            <span>模式</span>
            <button
              v-for="m in modeOptions"
              :key="m.value"
              class="mode-btn"
              :class="{ on: playerState.mode === m.value }"
              @click="changeMode(m.value)"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <div v-if="playerState.blocked" class="player-note">浏览器暂停了音频，点「继续」恢复播放。</div>
        <div v-else-if="playerState.error" class="player-note error">{{ playerState.error }}</div>
        <div v-else-if="current" class="player-note">队列 {{ playerState.queue.length }} 首 · 切歌会从当前队列继续</div>
      </div>
    </div>
  </section>

  <div v-if="status && !status.connected" class="card service-card">
    <div class="service-copy">
      <div class="service-title">还没有连上音乐服务</div>
      <div class="service-sub">先在本机启动 QQ 音乐 API（默认 3200），再点测试连接。应用不会伪造歌曲数据。</div>
      <div class="service-row">
        <input v-model="serviceBase" placeholder="http://127.0.0.1:3200" />
        <button class="btn btn-primary" :disabled="serviceBusy" @click="saveService">{{ serviceBusy ? '连接中…' : '测试连接' }}</button>
        <button class="mini" @click="refreshStatus()">重试</button>
      </div>
      <div v-if="statusError" class="service-error">{{ statusError }}</div>
      <div class="service-help">启动方式：在 qq-api 目录执行 <code>node node_modules\@yakult-green-tea\qq-music-api\dist\src\app.js</code>，默认端口 3200。服务只监听本机，登录凭证不会进备份。</div>
    </div>
  </div>

  <div v-if="detail" class="card detail-card">
    <div class="detail-h">
      <button class="mini" @click="closeDetail">返回列表</button>
      <div>
        <div class="detail-title">{{ detail.playlist.name }}</div>
        <div class="detail-sub">{{ detail.playlist.trackCount }} 首 · {{ detail.playlist.creator || 'QQ 音乐歌单' }}</div>
      </div>
      <button class="btn btn-primary btn-sm" :disabled="!detail.tracks.length" @click="playDetail">播放全部</button>
    </div>
    <div v-if="detailLoading" class="detail-loading">正在读取歌单…</div>
    <div v-else class="track-list">
      <button
        v-for="(track, idx) in detail.tracks"
        :key="track.id"
        class="track-row"
        :class="{ active: current?.id === track.id }"
        @click="playSong(track, detail.tracks)"
      >
        <span class="track-no">{{ String(idx + 1).padStart(2, '0') }}</span>
        <span class="track-main">
          <b>{{ track.name }}</b>
          <span>{{ track.artists }}{{ track.album ? ' · ' + track.album : '' }}</span>
        </span>
        <span class="track-time">{{ formatDuration(track.duration) }}</span>
      </button>
    </div>
  </div>

  <section v-else class="sect">
    <div class="music-tabs">
      <button :class="{ on: tab === 'discover' }" @click="switchTab('discover')">发现</button>
      <button :class="{ on: tab === 'mine' }" @click="switchTab('mine')">我的</button>
      <span class="tabs-line" />
      <span class="tabs-note">{{ tab === 'discover' ? '按风格找歌单，或直接搜索' : '登录后的歌单、喜欢与本地最近播放' }}</span>
    </div>

    <template v-if="tab === 'discover'">
      <div class="sect-h">
        <h2>音乐风格</h2>
        <span class="cnt">{{ activeStyleLabel }}</span>
      </div>
      <div class="style-strip">
        <button
          v-for="style in styles"
          :key="style.cat"
          class="style-chip"
          :class="{ on: activeStyle === style.cat }"
          @click="chooseStyle(style)"
        >
          {{ style.label }}
        </button>
      </div>

      <div class="search-line">
        <input v-model="searchQuery" type="text" placeholder="搜索歌曲、歌手或歌单" @keydown.enter.prevent="doSearch" />
        <div class="search-type">
          <button class="mini" :class="{ primary: searchType === 'song' }" @click="searchType = 'song'">歌曲</button>
          <button class="mini" :class="{ primary: searchType === 'playlist' }" @click="searchType = 'playlist'">歌单</button>
        </div>
        <button class="btn btn-primary" :disabled="searchLoading" @click="doSearch">{{ searchLoading ? '搜索中…' : '搜索' }}</button>
        <button v-if="searchResult" class="mini" @click="clearSearch">清除</button>
      </div>

      <div v-if="searchError" class="inline-error">{{ searchError }}</div>

      <template v-if="searchResult">
        <div class="sect-h result-head">
          <h2>搜索结果</h2>
          <span class="cnt">{{ searchResult.keywords }}</span>
        </div>
        <div v-if="searchType === 'song' && searchSongs.length" class="card flush track-list result-list">
          <button
            v-for="track in searchSongs"
            :key="track.id"
            class="track-row"
            :class="{ active: current?.id === track.id }"
            @click="playSong(track, searchSongs)"
          >
            <span class="track-main">
              <b>{{ track.name }}</b>
              <span>{{ track.artists }}{{ track.album ? ' · ' + track.album : '' }}</span>
            </span>
            <span class="track-time">{{ formatDuration(track.duration) }}</span>
          </button>
        </div>
        <div v-else-if="searchType === 'song'" class="empty">没有找到歌曲，换个关键词试试。</div>
        <div v-else-if="searchPlaylists.length" class="playlist-grid">
          <button v-for="pl in searchPlaylists" :key="pl.id" class="playlist-card" @click="openPlaylist(pl)">
            <span class="pl-cover" :style="coverStyle(pl)"><Icon v-if="!pl.cover" name="music" :size="22" /></span>
            <span class="pl-body">
              <b>{{ pl.name }}</b>
              <span>{{ pl.trackCount }} 首 · {{ formatPlayCount(pl.playCount) }} 播放</span>
            </span>
          </button>
        </div>
        <div v-else class="empty">没有找到歌单，换个关键词试试。</div>
      </template>

      <template v-else>
        <div class="sect-h">
          <h2>风格歌单</h2>
          <span class="cnt">{{ discoveryLoading ? '加载中' : playlists.length + ' 个' }}</span>
          <div class="spacer" />
          <button class="mini" @click="loadStylesAndDiscovery">换一批</button>
        </div>
        <div v-if="discoveryError" class="inline-error">{{ discoveryError }}</div>
        <div v-if="discoveryLoading" class="loading-block">正在从 QQ 音乐读取歌单…</div>
        <div v-else-if="playlists.length" class="playlist-grid">
          <button v-for="pl in playlists" :key="pl.id" class="playlist-card" @click="openPlaylist(pl)">
            <span class="pl-cover" :style="coverStyle(pl)"><Icon v-if="!pl.cover" name="music" :size="22" /></span>
            <span class="pl-body">
              <b>{{ pl.name }}</b>
              <span>{{ pl.trackCount }} 首 · {{ formatPlayCount(pl.playCount) }} 播放</span>
            </span>
          </button>
        </div>
        <div v-else class="empty">
          <div class="et">还没有歌单</div>
          <div>确认音乐服务已连接后点「换一批」。</div>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="sect-h">
        <h2>账号</h2>
        <span class="cnt">{{ isLoggedIn ? '已登录 QQ 音乐' : '未登录也能用本地最近播放' }}</span>
      </div>
      <div v-if="isLoggedIn && account" class="account-card card">
        <div class="account-avatar" :style="account.avatar ? { backgroundImage: `url(${account.avatar})` } : {}">
          <Icon v-if="!account.avatar" name="music" :size="20" />
        </div>
        <div class="account-body">
          <b>{{ account.nickname }}</b>
          <span>UID {{ account.userId }} · 歌单与喜欢会从 QQ 音乐同步</span>
        </div>
        <button class="mini" :disabled="meLoading" @click="refreshMe">刷新</button>
        <button class="mini danger" @click="logout">退出登录</button>
      </div>
      <div v-else class="login-card card">
        <div class="login-copy">
          <div class="login-title">扫码登录 QQ 音乐</div>
          <div class="login-sub">登录后可以同步你的歌单、喜欢音乐和收藏歌单，也能播放更多需要账号的歌曲。二维码只在本次打开有效，登录凭证存在本机服务端。</div>
          <div class="login-actions">
            <button class="btn btn-primary" :disabled="qrLoading || !status?.connected" @click="startLogin">
              {{ qrLoading ? '生成中…' : qr ? '刷新二维码' : '生成二维码' }}
            </button>
            <span v-if="qrStatus" class="qr-state" :class="qrStatus.status">{{ qrStatus.message }}</span>
          </div>
        </div>
        <div v-if="qr" class="qr-box">
          <img :src="qr.qrImage" alt="QQ 音乐登录二维码" />
          <span>用 QQ 音乐 App 扫码</span>
        </div>
      </div>
      <div v-if="meError" class="inline-error">{{ meError }}</div>

      <div class="sect-h">
        <h2>{{ isLoggedIn ? '我喜欢的音乐' : '本地收藏' }}</h2>
        <span class="cnt">{{ displayLiked.length }} 首{{ isLoggedIn ? '' : ' · 存在本机' }}</span>
      </div>
      <div v-if="displayLiked.length" class="card flush track-list">
        <button
          v-for="track in displayLiked.slice(0, 12)"
          :key="track.id"
          class="track-row"
          :class="{ active: current?.id === track.id }"
          @click="playSong(track, displayLiked)"
        >
          <span class="track-main"><b>{{ track.name }}</b><span>{{ track.artists }}</span></span>
          <span class="track-time">{{ formatDuration(track.duration) }}</span>
        </button>
      </div>
      <div v-else class="empty">在播放器点「收藏」后，这里会留下记录。</div>

      <div v-if="isLoggedIn" class="sect-h">
        <h2>我的歌单</h2>
        <span class="cnt">{{ myPlaylists.length }} 个</span>
      </div>
      <div v-if="isLoggedIn && myPlaylists.length" class="playlist-grid">
        <button v-for="pl in myPlaylists" :key="pl.id" class="playlist-card" @click="openPlaylist(pl)">
          <span class="pl-cover" :style="coverStyle(pl)"><Icon v-if="!pl.cover" name="music" :size="22" /></span>
          <span class="pl-body"><b>{{ pl.name }}</b><span>{{ pl.trackCount }} 首{{ pl.subscribed ? ' · 已收藏' : '' }}</span></span>
        </button>
      </div>

      <div class="sect-h">
        <h2>最近播放</h2>
        <span class="cnt">{{ recent.length }} 首 · 存在本机</span>
      </div>
      <div v-if="recent.length" class="card flush track-list">
        <button
          v-for="track in recent.slice(0, 15)"
          :key="track.id"
          class="track-row"
          :class="{ active: current?.id === track.id }"
          @click="playSong(track, recent)"
        >
          <span class="track-main"><b>{{ track.name }}</b><span>{{ track.artists }} · {{ formatDuration(track.duration) }}</span></span>
          <span class="track-time">{{ formatDuration(track.duration) }}</span>
        </button>
      </div>
      <div v-else class="empty">播放一首歌后，这里会留下最近记录。</div>
    </template>
  </section>
</template>

<style scoped>
.conn-pill {
  display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--muted); font-size: 11.5px;
}
.conn-pill.ok { color: var(--green); border-color: var(--green); background: var(--green-soft); }
.conn-pill.warn { color: var(--amber); border-color: var(--amber); background: var(--amber-soft); }
.conn-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.player-hero {
  display: grid; grid-template-columns: 154px minmax(0, 1fr); gap: 18px; align-items: center;
  padding: 18px;
  background: linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--green-soft) 52%, var(--surface)) 100%);
}
.hero-cover {
  width: 154px; height: 154px; border-radius: var(--r-sm); overflow: hidden; display: grid; place-items: center;
  background: linear-gradient(140deg, #3c6a5c 0%, #18362e 100%); background-size: cover; background-position: center;
  color: color-mix(in srgb, var(--on-cover) 90%, transparent); box-shadow: 0 14px 30px -18px rgba(34, 32, 28, 0.7);
}
.hero-body { min-width: 0; }
.hero-eyebrow { font-size: 10.5px; letter-spacing: 1.2px; color: var(--green); font-family: var(--mono); }
.hero-title { margin-top: 4px; font-size: 22px; font-weight: 600; line-height: 1.3; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.hero-artist { margin-top: 4px; color: var(--muted); font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.hero-progress { margin-top: 12px; }
.hero-progress input { width: 100%; accent-color: var(--green); }
.hero-time { display: flex; justify-content: space-between; margin-top: -3px; color: var(--muted); font-family: var(--mono); font-size: 10.5px; }
.hero-controls { display: flex; align-items: center; gap: 9px; margin-top: 9px; flex-wrap: wrap; }
.round-btn {
  width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--ink); font-size: 21px; line-height: 1;
}
.round-btn:hover:not(:disabled) { border-color: var(--green); color: var(--green); }
.round-btn:disabled, .play-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.play-btn {
  min-width: 88px; height: 44px; padding: 0 16px; border: 1px solid var(--green); border-radius: 22px;
  background: var(--green); color: var(--on-green); font-size: 13px; font-weight: 600;
}
.heart { min-height: 44px; margin-left: 2px; }
.heart.on { border-color: var(--amber); color: var(--amber); background: var(--amber-soft); }
.hero-foot { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
.volume-line { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 10.5px; }
.volume-line input { width: 100px; accent-color: var(--green); }
.volume-line b { font-family: var(--mono); font-size: 10.5px; color: var(--ink); font-weight: 400; width: 22px; text-align: right; }
.mode-line { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; color: var(--muted); font-size: 10.5px; }
.mode-btn { min-height: 44px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); color: var(--muted); font-size: 10.5px; }
.mode-btn.on { border-color: var(--green); background: var(--green-soft); color: var(--green); font-weight: 600; }
.player-note { margin-top: 7px; color: var(--muted); font-size: 10.5px; }
.player-note.error { color: var(--red); }

.service-card { margin-bottom: 20px; border-left: 3px solid var(--amber); }
.service-title { font-size: 15px; font-weight: 600; }
.service-sub { margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.65; }
.service-row { display: flex; gap: 7px; margin-top: 10px; flex-wrap: wrap; }
.service-row input { flex: 1; min-width: 210px; }
.service-error { margin-top: 7px; color: var(--red); font-size: 11.5px; }
.service-help { margin-top: 8px; color: var(--muted); font-size: 10.5px; line-height: 1.7; }
code { font-family: var(--mono); font-size: 10.5px; background: var(--line-soft); padding: 1px 5px; border-radius: var(--r-xs); }

.music-tabs { display: flex; align-items: center; gap: 5px; margin-bottom: 14px; }
.music-tabs button { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); color: var(--muted); font-size: 12.5px; }
.music-tabs button:hover:not(.on) { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.music-tabs button.on { border-color: var(--green); background: var(--green-soft); color: var(--green); font-weight: 600; }
.tabs-line { width: 1px; height: 16px; background: var(--line); margin: 0 4px; }
.tabs-note { color: var(--muted); font-size: 11px; }

.style-strip { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.style-strip::-webkit-scrollbar { display: none; }
.style-chip { flex: none; min-height: 44px; padding: 0 13px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--muted); font-size: 12px; }
.style-chip:hover:not(.on) { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.style-chip.on { border-color: var(--green); background: var(--green); color: var(--on-green); font-weight: 600; }
.search-line { display: flex; align-items: center; gap: 7px; margin: 14px 0 8px; flex-wrap: wrap; }
.search-line input { flex: 1; min-width: 190px; }
.search-type { display: flex; gap: 3px; }
.search-type .mini { min-height: 44px; }
.inline-error { color: var(--red); font-size: 11.5px; margin: 6px 0; }
.result-head { margin-top: 16px; }

.playlist-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.playlist-card {
  display: flex; align-items: center; gap: 11px; text-align: left; min-width: 0; padding: 8px;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); color: var(--ink);
}
.playlist-card:hover { border-color: var(--green); background: var(--green-soft); }
.pl-cover {
  width: 58px; height: 58px; flex: none; border-radius: var(--r-xs); background: linear-gradient(140deg, #3c6a5c 0%, #18362e 100%);
  background-size: cover; background-position: center; display: grid; place-items: center; color: color-mix(in srgb, var(--on-cover) 90%, transparent);
}
.pl-body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pl-body b { font-size: 12.5px; line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pl-body span { color: var(--muted); font-size: 10.5px; }

.detail-card { margin-bottom: 20px; }
.detail-h { display: flex; align-items: center; gap: 11px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--line-soft); }
.detail-h > div { flex: 1; min-width: 150px; }
.detail-title { font-size: 16px; font-weight: 600; }
.detail-sub { color: var(--muted); font-size: 11px; margin-top: 2px; }
.detail-loading { padding: 20px 0; color: var(--muted); font-size: 12px; text-align: center; }
.track-list { display: flex; flex-direction: column; }
.track-row {
  display: flex; align-items: center; gap: 9px; width: 100%; min-height: 46px; padding: 6px 4px;
  border: 0; border-bottom: 1px solid var(--line-soft); background: none; color: var(--ink); text-align: left;
}
.track-row:last-child { border-bottom: 0; }
.track-row:hover { background: var(--line-soft); }
.track-row.active { background: var(--green-soft); }
.track-no { width: 24px; flex: none; color: var(--muted); font-family: var(--mono); font-size: 10px; }
.track-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.track-main b { font-size: 12.5px; font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.track-main span { color: var(--muted); font-size: 10.5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.track-time { flex: none; color: var(--muted); font-family: var(--mono); font-size: 10.5px; }

.account-card { display: flex; align-items: center; gap: 11px; }
.account-avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--green-soft); background-size: cover; background-position: center; display: grid; place-items: center; color: var(--green); overflow: hidden; }
.account-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.account-body b { font-size: 13.5px; }
.account-body span { color: var(--muted); font-size: 11px; }
.login-card { display: flex; align-items: center; gap: 18px; }
.login-copy { flex: 1; min-width: 0; }
.login-title { font-size: 15px; font-weight: 600; }
.login-sub { color: var(--muted); font-size: 11.5px; line-height: 1.7; margin-top: 4px; }
.login-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.qr-state { color: var(--muted); font-size: 11px; }
.qr-state.success { color: var(--green); }
.qr-state.error, .qr-state.expired { color: var(--red); }
.qr-box { flex: none; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.qr-box img { width: 128px; height: 128px; border: 1px solid var(--line); background: #fff; }
.qr-box span { color: var(--muted); font-size: 10px; }

.loading-block { padding: 24px 0; text-align: center; color: var(--muted); font-size: 12px; }
@media (max-width: 720px) {
  .player-hero { grid-template-columns: 92px minmax(0, 1fr); gap: 12px; padding: 12px; align-items: start; }
  .hero-cover { width: 92px; height: 92px; }
  .hero-title { font-size: 18px; }
  .hero-foot { gap: 9px; }
  .volume-line input { width: 76px; }
  .mode-line { gap: 3px; }
  .mode-btn { padding: 0 6px; }
  .playlist-grid { gap: 7px; }
  .playlist-card { padding: 6px; gap: 7px; }
  .pl-cover { width: 46px; height: 46px; }
  .login-card { flex-direction: column; align-items: flex-start; }
  .qr-box { flex-direction: row; align-items: center; }
  .qr-box img { width: 108px; height: 108px; }
  .music-tabs { flex-wrap: wrap; }
  .style-strip { flex-wrap: wrap; overflow: visible; }
  .style-chip { min-height: 38px; }
  .tabs-note { width: 100%; }
  .search-line input { flex-basis: 100%; }
  .music-tabs button { flex: 1; padding: 0 10px; }
}
@media (max-width: 420px) {
  .player-hero { grid-template-columns: 1fr; }
  .hero-cover { width: 100%; height: 110px; }
  .hero-controls .round-btn { width: 44px; height: 44px; }
  .playlist-grid { grid-template-columns: 1fr; }
  .pl-cover { width: 54px; height: 54px; }
}
</style>