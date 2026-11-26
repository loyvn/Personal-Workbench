/**
 * 文件：src/api/music.ts
 * 说明：QQ 音乐代理接口封装。集中处理状态、扫码登录、搜索、歌单、收藏、音源与音频流 URL，统一走本机 /api/music/* 同源接口。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { MusicPlaylist, MusicTrack } from '@/types'

export class MusicApiError extends Error {
  code: string
  status: number

  constructor(message: string, code = 'MUSIC_ERROR', status = 0) {
    super(message)
    this.code = code
    this.status = status
  }
}

interface Envelope<T> {
  ok: boolean
  data?: T
  error?: { message?: string; code?: string }
}

/**
 * 音乐接口统一请求。
 * fetch 本身失败时给 LOCAL_DOWN（本机 8787/代理没起），响应非 JSON 给 BAD_RESPONSE，
 * 业务失败保留服务端 code（如 UNPLAYABLE / AUTH_REQUIRED），页面据此决定是提示登录还是换歌。
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/music${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init
    })
  } catch {
    throw new MusicApiError('无法连接本机音乐服务，请确认 8787 服务在运行', 'LOCAL_DOWN')
  }
  let body: Envelope<T>
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    throw new MusicApiError(`音乐接口返回异常（HTTP ${res.status}）`, 'BAD_RESPONSE', res.status)
  }
  if (!res.ok || !body.ok) {
    throw new MusicApiError(
      body.error?.message || `音乐接口返回 ${res.status}`,
      body.error?.code || 'MUSIC_ERROR',
      res.status
    )
  }
  return body.data as T
}

export interface MusicStatus {
  baseUrl: string
  connected: boolean
  loggedIn: boolean
  account: MusicAccount | null
  error?: string
}

export interface MusicAccount {
  userId: string
  nickname: string
  avatar: string
}

export interface MusicStyle {
  cat: string
  label: string
}

export interface DiscoverResult {
  cat: string
  playlists: MusicPlaylist[]
}

export interface SearchResult {
  keywords: string
  songs: MusicTrack[]
  playlists: MusicPlaylist[]
}

export interface PlaylistDetailResult {
  playlist: MusicPlaylist
  tracks: MusicTrack[]
}

export type FocusMusicMode = 'instrumental' | 'instrument' | 'noise'

export interface FocusQueueResult {
  mode: FocusMusicMode
  page: number
  label: string
  variant: string
  variantKey: string
  source: string
  tracks: MusicTrack[]
}

export interface MeResult {
  loggedIn: boolean
  account: MusicAccount | null
  playlists: MusicPlaylist[]
  likedIds: string[]
  likedSongs: MusicTrack[]
}

export interface QrStartResult {
  key: string
  qrImage: string
  qrUrl: string
  expiresIn: number
}

export interface QrCheckResult {
  status: 'waiting' | 'scanned' | 'success' | 'expired' | 'error'
  message: string
  account?: MusicAccount | null
}

export const musicApi = {
  getConfig(): Promise<{ baseUrl: string }> {
    return request('/config')
  },

  setConfig(baseUrl: string): Promise<MusicStatus> {
    return request('/config', { method: 'POST', body: JSON.stringify({ baseUrl }) })
  },

  status(): Promise<MusicStatus> {
    return request('/status')
  },

  startQr(): Promise<QrStartResult> {
    return request('/login/qr', { method: 'POST' })
  },

  checkQr(key: string): Promise<QrCheckResult> {
    return request(`/login/qr/check?key=${encodeURIComponent(key)}`)
  },

  logout(): Promise<{ loggedIn: boolean }> {
    return request('/logout', { method: 'POST' })
  },

  styles(): Promise<MusicStyle[]> {
    return request('/styles')
  },

  discover(cat = '', limit = 12): Promise<DiscoverResult> {
    return request(`/discover?cat=${encodeURIComponent(cat)}&limit=${limit}`)
  },

  focus(
    mode: FocusMusicMode,
    options: { page?: number; exclude?: string[]; variant?: string } = {}
  ): Promise<FocusQueueResult> {
    const page = options.page || 0
    const exclude = (options.exclude || []).join(',')
    const variant = options.variant ? `&variant=${encodeURIComponent(options.variant)}` : ''
    const query = `/focus?mode=${mode}&page=${page}${variant}${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ''}`
    return request(query)
  },

  search(q: string, type: 'song' | 'playlist' = 'song'): Promise<SearchResult> {
    return request(`/search?q=${encodeURIComponent(q)}&type=${type}`)
  },

  playlist(id: string): Promise<PlaylistDetailResult> {
    return request(`/playlist/${encodeURIComponent(id)}`)
  },

  me(): Promise<MeResult> {
    return request('/me')
  },

  like(id: string, like: boolean): Promise<{ id: string; liked: boolean }> {
    return request('/like', { method: 'POST', body: JSON.stringify({ id, like }) })
  },

  subscribe(id: string, subscribe: boolean): Promise<{ id: string; subscribed: boolean }> {
    return request('/playlist/subscribe', { method: 'POST', body: JSON.stringify({ id, subscribe }) })
  },

  /**
 * 生成音频流地址，而不是直接返回真实音源。
 * version 用于音源失败后的重试：同一 id 加不同 v，可绕过浏览器对旧请求的缓存；
 * 真实 QQ 音乐 URL 始终留在服务端，避免暴露凭证或签名地址。
 */
streamUrl(id: string, version = 0): string {
    return `/api/music/stream?id=${encodeURIComponent(id)}&v=${version}`
  }
}
