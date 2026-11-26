/**
 * 文件：src/services/music.ts
 * 说明：前端音乐播放运行态。维护队列、当前曲目、播放模式、音量、进度、最近播放、收藏与音频元素，并把可持久化元数据写回全局状态。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { reactive } from 'vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { musicApi, MusicApiError } from '@/api/music'
import type { MusicMode, MusicPlaylist, MusicTrack } from '@/types'

export interface PlayerState {
  ready: boolean
  current: MusicTrack | null
  queue: MusicTrack[]
  index: number
  playing: boolean
  loading: boolean
  blocked: boolean
  error: string
  currentTime: number
  duration: number
  volume: number
  mode: MusicMode
  liked: Set<string>
  loggedIn: boolean
}

export const playerState = reactive<PlayerState>({
  ready: false,
  current: null,
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  blocked: false,
  error: '',
  currentTime: 0,
  duration: 0,
  volume: 62,
  mode: 'loop',
  liked: new Set<string>(),
  loggedIn: false
})

/*
 * 运行时私有状态不放进 Pinia：
 * - audio 是单例 HTMLAudioElement，页面切换不销毁，保证全局播放连续；
 * - failedTracks 记录本次会话中已确认不可播放的歌曲，避免反复重试卡住队列；
 * - shuffleHistory 保存随机播放走过的索引，上一曲才能按历史回退而不是重新随机；
 * - switching 用于屏蔽切歌瞬间旧音源触发的 error 事件，防止误判为播放失败。
 */
let audio: HTMLAudioElement | null = null
let retryCount = 0
let shuffleHistory: number[] = []
let switching = false
let mediaSessionReady = false
let initialized = false
const failedTracks = new Set<string>()
const trackEndGuards = new Set<() => boolean>()

export function onTrackEnd(guard: () => boolean): () => void {
  trackEndGuards.add(guard)
  return () => trackEndGuards.delete(guard)
}

function store() {
  return useDeskStore()
}

function ui() {
  return useUiStore()
}

function saveMusic(mutator: (music: ReturnType<typeof store>['data']['music']) => void): void {
  const st = store()
  if (!st.ready) return
  st.commit((state) => mutator(state.music))
}

function findNextPlayable(from: number): number {
  const size = playerState.queue.length
  for (let step = 1; step <= size; step += 1) {
    const index = (from + step) % size
    const track = playerState.queue[index]
    if (track && !failedTracks.has(track.id)) return index
  }
  return -1
}

/**
 * 自动跳过坏歌。
 * 先把 id 记入 failedTracks，再从当前索引向后环形寻找一首没失败过的歌；
 * 全队列都失败时停止播放并提示，而不是无限重试把页面卡死。
 */
function skipUnplayable(track: MusicTrack, reason: string): void {
  if (failedTracks.has(track.id)) return
  failedTracks.add(track.id)
  playerState.loading = false
  playerState.playing = false
  playerState.error = ''

  const nextIndex = findNextPlayable(playerState.index)
  if (nextIndex < 0) {
    pause()
    ui().message(playerState.queue.length > 1 ? '队列里的歌曲暂时都无法播放，已停止' : '这首歌暂时无法播放，队列里没有其他歌曲', 'err', 'music-player')
    return
  }
  ui().message(`“${track.name}”${reason}，已自动切到下一首`, 'err', 'music-player')
  playerState.index = nextIndex
  void loadAndPlay(playerState.queue[nextIndex])
}

/**
 * 懒初始化唯一的音频元素，并集中绑定原生事件。
 * - waiting/playing 维护 loading，避免切歌时按钮闪回可播放状态；
 * - error 先自动重试一次（带 cache bust 参数），仍失败才跳过；
 * - ended 优先交给页面注册的 guard（例如专注页单曲循环拦截），否则按模式走 next。
 * 这些监听只绑定一次，后续切歌复用同一元素。
 */
function getAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = playerState.volume / 100
  audio.addEventListener('timeupdate', () => {
    playerState.currentTime = audio?.currentTime || 0
  })
  audio.addEventListener('loadedmetadata', () => {
    if (audio && Number.isFinite(audio.duration)) playerState.duration = audio.duration
  })
  audio.addEventListener('durationchange', () => {
    if (audio && Number.isFinite(audio.duration)) playerState.duration = audio.duration
  })
  audio.addEventListener('play', () => {
    playerState.playing = true
    playerState.blocked = false
    playerState.error = ''
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  })
  audio.addEventListener('pause', () => {
    playerState.playing = false
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
  })
  audio.addEventListener('waiting', () => {
    playerState.loading = true
  })
  audio.addEventListener('playing', () => {
    playerState.loading = false
    failedTracks.clear()
  })
  audio.addEventListener('ended', () => {
    for (const guard of trackEndGuards) {
      if (guard()) return
    }
    if (playerState.mode === 'single') {
      void replayCurrent()
      return
    }
    next(true)
  })
  audio.addEventListener('error', () => {
    if (switching || !playerState.current) return
    if (retryCount === 0) {
      retryCount = 1
      const current = playerState.current
      if (current) {
        playerState.error = ''
        ui().message(`“${current.name}”音源加载失败，正在重试一次`, 'err', 'music-player')
        void loadAndPlay(current, true)
      }
      return
    }
    const current = playerState.current
    if (current) skipUnplayable(current, '暂时无法播放（版权、VIP 或音源失效）')
  })
  return audio
}

function bindMediaSession(track: MusicTrack | null): void {
  if (!('mediaSession' in navigator)) return
  if (track) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artists,
      album: track.album,
      artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
    })
  }
  if (mediaSessionReady) return
  mediaSessionReady = true
  navigator.mediaSession.setActionHandler('play', () => void togglePlay())
  navigator.mediaSession.setActionHandler('pause', () => pause())
  navigator.mediaSession.setActionHandler('previoustrack', () => prev())
  navigator.mediaSession.setActionHandler('nexttrack', () => next())
}

export function initMusic(): void {
  if (initialized) return
  const st = store()
  if (!st.ready) return
  initialized = true
  const music = st.data.music
  playerState.mode = music.settings.mode
  playerState.volume = music.settings.volume
  playerState.queue = music.queue.slice()
  playerState.index = music.currentId ? music.queue.findIndex((x) => x.id === music.currentId) : -1
  if (playerState.index < 0) playerState.index = playerState.queue.length ? 0 : -1
  playerState.current = playerState.queue[playerState.index] || null
  playerState.liked = new Set(music.liked.map((x) => x.id))
  getAudio().volume = playerState.volume / 100
  playerState.duration = (playerState.current?.duration || 0) / 1000
  playerState.ready = true
  bindMediaSession(playerState.current)
  syncAudioLoop()
}

function syncAudioLoop(): void {
  if (audio) audio.loop = playerState.mode === 'single'
}

function syncQueueToState(): void {
  saveMusic((music) => {
    music.queue = playerState.queue.slice()
    music.currentId = playerState.current?.id || null
    music.settings.mode = playerState.mode
    music.settings.volume = playerState.volume
    music.updatedAt = new Date().toISOString()
  })
}

function recordRecent(track: MusicTrack): void {
  saveMusic((music) => {
    music.recent = [track, ...music.recent.filter((x) => x.id !== track.id)].slice(0, 50)
    music.updatedAt = new Date().toISOString()
  })
}

/**
 * 加载并播放一首歌。
 * 音源只取本机代理的 streamUrl，不把真实 QQ 音乐 URL 暴露给前端；
 * el.src 变更后立刻 load()，再 play()。play() 的 Promise 会区分两类失败：
 * NotAllowedError 是浏览器自动播放限制（需要用户点继续），其他错误才显示为播放失败。
 * 注意 switching 只在同步换源期间置位，play() 异步等待期间不能一直为 true，
 * 否则真正的音源 error 会被错误忽略。
 */
async function loadAndPlay(track: MusicTrack, isRetry = false): Promise<void> {
  initMusic()
  const el = getAudio()
  playerState.current = track
  playerState.error = ''
  playerState.blocked = false
  playerState.currentTime = 0
  playerState.duration = track.duration / 1000
  playerState.loading = true
  retryCount = isRetry ? 1 : 0
  switching = true
  el.src = musicApi.streamUrl(track.id, isRetry ? 1 : 0)
  el.load()
  switching = false
  bindMediaSession(track)
  try {
    await el.play()
    playerState.playing = true
    playerState.loading = false
    recordRecent(track)
    syncQueueToState()
  } catch (err) {
    playerState.loading = false
    playerState.playing = false
    const name = (err as Error)?.name
    if (name === 'NotAllowedError') {
      playerState.blocked = true
      return
    }
    playerState.error = (err as Error)?.message || '播放失败'
  }
}

export async function playTrack(track: MusicTrack, queue?: MusicTrack[]): Promise<void> {
  initMusic()
  failedTracks.clear()
  if (queue && queue.length) {
    playerState.queue = queue.slice(0, 200)
    playerState.index = playerState.queue.findIndex((x) => x.id === track.id)
    if (playerState.index < 0) {
      playerState.queue.unshift(track)
      playerState.index = 0
    }
    shuffleHistory = [playerState.index]
  } else {
    const idx = playerState.queue.findIndex((x) => x.id === track.id)
    if (idx >= 0) playerState.index = idx
  }
  await loadAndPlay(track)
}

export function playQueue(tracks: MusicTrack[], startIndex = 0): void {
  initMusic()
  failedTracks.clear()
  if (!tracks.length) return
  playerState.queue = tracks.slice(0, 200)
  playerState.index = Math.min(Math.max(0, startIndex), playerState.queue.length - 1)
  shuffleHistory = [playerState.index]
  const track = playerState.queue[playerState.index]
  if (track) void loadAndPlay(track)
}

export function pause(): void {
  getAudio().pause()
  playerState.playing = false
}

/**
 * 从队列移除歌曲。
 * 删除当前曲目时优先播放原位置的下一首（末尾则回到新的末尾）；
 * 删除非当前曲目时只调整索引，不打断正在播放的音频。
 * 最近播放同步剔除该曲，避免删掉后还在“最近播放”里点开。
 */
export function removeTrackFromQueue(trackId: string): boolean {
  initMusic()
  const at = playerState.queue.findIndex((x) => x.id === trackId)
  if (at < 0) return false
  const wasCurrent = playerState.current?.id === trackId
  playerState.queue.splice(at, 1)
  saveMusic((music) => {
    music.recent = music.recent.filter((x) => x.id !== trackId)
    music.updatedAt = new Date().toISOString()
  })
  if (!wasCurrent) {
    if (at < playerState.index) playerState.index = Math.max(0, playerState.index - 1)
    shuffleHistory = [playerState.index]
    syncQueueToState()
    return true
  }
  if (!playerState.queue.length) {
    pause()
    playerState.current = null
    playerState.index = -1
    playerState.currentTime = 0
    playerState.duration = 0
    playerState.error = ''
    syncQueueToState()
    return true
  }
  const nextIndex = Math.min(at, playerState.queue.length - 1)
  playerState.index = nextIndex
  shuffleHistory = [nextIndex]
  const track = playerState.queue[nextIndex]
  if (track) void loadAndPlay(track)
  return true
}

export async function resume(): Promise<void> {
  initMusic()
  const el = getAudio()
  if (!playerState.current) {
    if (playerState.queue.length) {
      playerState.index = Math.max(0, playerState.index)
      playerState.current = playerState.queue[playerState.index]
      await loadAndPlay(playerState.current)
    }
    return
  }
  if (!el.src) {
    await loadAndPlay(playerState.current)
    return
  }
  try {
    await el.play()
    playerState.blocked = false
    playerState.error = ''
  } catch (err) {
    if ((err as Error)?.name === 'NotAllowedError') playerState.blocked = true
    else playerState.error = (err as Error)?.message || '播放失败'
  }
}

export async function togglePlay(): Promise<void> {
  initMusic()
  if (playerState.playing) {
    pause()
    return
  }
  const hadFailure = failedTracks.size > 0
  failedTracks.clear()
  if (hadFailure && playerState.current) {
    await loadAndPlay(playerState.current)
    return
  }
  await resume()
}

async function replayCurrent(): Promise<void> {
  if (!playerState.current) return
  const el = getAudio()
  el.currentTime = 0
  try {
    await el.play()
  } catch {
    playerState.blocked = true
  }
}

function randomIndex(): number {
  if (playerState.queue.length <= 1) return 0
  let next = Math.floor(Math.random() * playerState.queue.length)
  if (next === playerState.index) next = (next + 1) % playerState.queue.length
  return next
}

/**
 * 下一曲。
 * 传 auto=true 表示由音频 ended 触发：顺序模式到末尾会停住，手动点下一曲则回到开头；
 * 单曲循环的自动结束由 replayCurrent 处理，手动点下一曲仍按顺序前进；
 * 随机模式每次生成不同于当前索引的随机值，并压入 shuffleHistory 供上一曲回退。
 */
export function next(auto = false): void {
  initMusic()
  const size = playerState.queue.length
  if (!size) return
  if (playerState.mode === 'single') {
    if (auto) {
      void replayCurrent()
      return
    }
  }
  if (playerState.mode === 'shuffle') {
    const idx = randomIndex()
    shuffleHistory.push(idx)
    playerState.index = idx
    const track = playerState.queue[idx]
    if (track) void loadAndPlay(track)
    return
  }
  if (playerState.index >= size - 1) {
    if (auto && playerState.mode === 'sequence') {
      pause()
      playerState.currentTime = playerState.duration
      return
    }
    playerState.index = 0
  } else {
    playerState.index += 1
  }
  const track = playerState.queue[playerState.index]
  if (track) void loadAndPlay(track)
}

/**
 * 上一曲。
 * 播放超过 3 秒或单曲循环时，按播放器惯例回到本曲开头；
 * 随机模式从 shuffleHistory 弹栈回退，没有历史时再随机一首；
 * 顺序/列表循环模式向前取模，首曲的上一曲是末尾。
 */
export function prev(): void {
  initMusic()
  if (!playerState.queue.length) return
  const el = getAudio()
  if (el.currentTime > 3 || playerState.mode === 'single') {
    el.currentTime = 0
    return
  }
  if (playerState.mode === 'shuffle') {
    shuffleHistory.pop()
    const idx = shuffleHistory.length ? shuffleHistory[shuffleHistory.length - 1] : randomIndex()
    if (!shuffleHistory.length) shuffleHistory.push(idx)
    playerState.index = idx
  } else {
    playerState.index = playerState.index <= 0 ? playerState.queue.length - 1 : playerState.index - 1
  }
  const track = playerState.queue[playerState.index]
  if (track) void loadAndPlay(track)
}

export function seek(seconds: number): void {
  const el = getAudio()
  if (!Number.isFinite(seconds)) return
  const max = playerState.duration || el.duration || 0
  el.currentTime = Math.min(Math.max(0, seconds), Math.max(0, max))
  playerState.currentTime = el.currentTime
}

export function setVolume(value: number): void {
  initMusic()
  const v = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
  playerState.volume = v
  getAudio().volume = v / 100
  saveMusic((music) => {
    music.settings.volume = v
  })
}

export function setMode(mode: MusicMode): void {
  initMusic()
  playerState.mode = mode
  syncAudioLoop()
  saveMusic((music) => {
    music.settings.mode = mode
  })
}

/**
 * 收藏/取消收藏。
 * 先更新本地 playerState 与 state.music.liked，保证 UI 立即响应；
 * 登录后才尝试同步 QQ 音乐，同步失败只提示「本地已保存/已取消」，不回滚本地选择，
 * 避免网络抖动让用户以为收藏按钮坏了。
 */
export async function toggleLike(track: MusicTrack): Promise<void> {
  initMusic()
  const nextLiked = !playerState.liked.has(track.id)
  if (nextLiked) playerState.liked.add(track.id)
  else playerState.liked.delete(track.id)
  saveMusic((music) => {
    if (nextLiked) music.liked = [track, ...music.liked.filter((x) => x.id !== track.id)].slice(0, 200)
    else music.liked = music.liked.filter((x) => x.id !== track.id)
  })
  if (!nextLiked) {
    try {
      if (playerState.loggedIn) await musicApi.like(track.id, false)
      ui().toast('已取消收藏')
    } catch (err) {
      const message = err instanceof MusicApiError ? err.message : '收藏同步失败'
      ui().toast(message + '，本地已取消', 'err')
    }
    return
  }
  if (!playerState.loggedIn) {
    ui().toast('已保存在本地，登录后可同步到 QQ 音乐')
    return
  }
  try {
    await musicApi.like(track.id, true)
    ui().toast('已收藏到 QQ 音乐喜欢')
  } catch (err) {
    const message = err instanceof MusicApiError ? err.message : '收藏同步失败'
    ui().toast(message + '，已只保存在本地', 'err')
  }
}

export function isLiked(id: string): boolean {
  return playerState.liked.has(id)
}

export async function startForFocus(): Promise<void> {
  initMusic()
  if (!playerState.queue.length) return
  if (!playerState.current) playerState.current = playerState.queue[0]
  if (!playerState.playing) await resume()
}

export function replaceQueueFromLibrary(playlist: MusicPlaylist): void {
  if (!playlist.trackCount) return
  /* 歌单详情由页面按需加载，这里只作为类型占位，避免误把歌单当曲目播放 */
}

export function clearPlaybackError(): void {
  playerState.error = ''
}
