/**
 * 文件：server/music-service.mjs
 * 说明：QQ 音乐同源代理。只允许本机上游，代理登录状态、扫码、搜索、歌单、收藏与音源，并把音频流通过 8787 转发给浏览器。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const CONFIG_FILE = path.join(DATA_DIR, 'music-service.json')
const COOKIE_FILE = path.join(DATA_DIR, 'qq-cookie.txt')
const DEFAULT_BASE = 'http://127.0.0.1:3200'
const SERVICE_TIMEOUT_MS = 9000
const TRACK_LIMIT = 200
const COVER_BASE = 'https://y.gtimg.cn/music/photo_new/T002R500x500M000'

const router = express.Router()

class MusicError extends Error {
  constructor(message, code = 'MUSIC_ERROR', status = 502) {
    super(message)
    this.code = code
    this.status = status
  }
}

function ok(res, data) {
  res.json({ ok: true, data })
}

function fail(res, status, message, code = 'MUSIC_ERROR') {
  res.status(status).json({ ok: false, error: { message, code } })
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * 校验并规范化音乐服务地址。
 * 只允许 http(s) + 本机域名，禁止账号密码、路径和旧网易云端口：
 * 登录 Cookie 会随请求发往该地址，必须从入口就阻断把凭证发到外部的可能。
 * 返回统一为协议 + 主机 + 端口，后续拼接口路径时不会重复斜杠。
 */
function normalizeBase(raw) {
  const value = String(raw || '').trim()
  if (!value) return DEFAULT_BASE
  let url
  try {
    url = new URL(value)
  } catch {
    throw new MusicError('服务地址不是合法 URL', 'BAD_BASE', 400)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MusicError('服务地址必须是 http(s) 地址', 'BAD_BASE', 400)
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '::1') {
    throw new MusicError('只允许连接本机音乐服务，避免把登录 cookie 发到外部', 'BAD_BASE', 400)
  }
  if (url.username || url.password) throw new MusicError('服务地址不能包含账号密码', 'BAD_BASE', 400)
  if (url.port === '3000') throw new MusicError('端口 3000 是旧网易云服务，QQ 音乐 API 默认 3200', 'BAD_BASE', 400)
  const cleanPath = url.pathname.replace(/\/+$/, '')
  if (cleanPath && cleanPath !== '/') {
    throw new MusicError('服务地址只填协议、主机和端口，不要带路径', 'BAD_BASE', 400)
  }
  return `${url.protocol}//${url.host}`
}

function readConfig() {
  ensureDataDir()
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    return { baseUrl: normalizeBase(parsed.baseUrl) }
  } catch {
    return { baseUrl: DEFAULT_BASE }
  }
}

function writeConfig(baseUrl) {
  ensureDataDir()
  const next = { baseUrl: normalizeBase(baseUrl) }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function readCookie() {
  ensureDataDir()
  try {
    return fs.readFileSync(COOKIE_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

function writeCookie(cookie) {
  ensureDataDir()
  const value = String(cookie || '').trim()
  if (value) fs.writeFileSync(COOKIE_FILE, value, 'utf8')
  else fs.rmSync(COOKIE_FILE, { force: true })
}

/**
 * 超时控制。
 * AbortController 同时中断 fetch 与底层连接；调用方必须在 finally 里 done() 清定时器，
 * 否则高频请求会积累大量未清理的 setTimeout。
 */
function withTimeout(ms = SERVICE_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer)
  }
}

function requestHeaders(cookie) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
  }
  if (cookie) headers.Cookie = cookie
  return headers
}

function buildUrl(endpoint, params = {}) {
  const { baseUrl } = readConfig()
  const url = new URL(String(endpoint).replace(/^\/+/, ''), `${baseUrl}/`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return url
}

/**
 * 统一解析上游响应。
 * 先按文本读再尝试 JSON，避免上游返回 HTML 错误页时抛出难懂的解析异常；
 * HTTP 401 与 body.code 401 都映射为 AUTH_REQUIRED，页面据此引导登录；
 * allowCodes 用于少数“非 200 但业务可用”的接口，避免误判。
 */
async function parseResponse(res, label, allowCodes = []) {
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new MusicError(`QQ 音乐接口返回了非 JSON 内容（HTTP ${res.status}）`, 'BAD_RESPONSE')
  }
  if (res.status === 401) throw new MusicError('需要登录 QQ 音乐后才能使用这个功能', 'AUTH_REQUIRED', 401)
  if (!res.ok) throw new MusicError(`QQ 音乐服务 HTTP ${res.status}`, 'HTTP_' + res.status)
  if (body && typeof body.code === 'number' && body.code !== 200 && body.code !== 0 && !allowCodes.includes(body.code)) {
    if (body.code === 401) throw new MusicError('需要登录 QQ 音乐后才能使用这个功能', 'AUTH_REQUIRED', 401)
    throw new MusicError(body.message || body.msg || `QQ 音乐服务返回 code ${body.code}`, 'QQ_' + body.code)
  }
  return body
}

async function qqGet(endpoint, params = {}, options = {}) {
  const cookie = options.withCookie === false ? '' : readCookie()
  const search = { ...params }
  /* QQ 包的 Node 入口支持从 query 的 cookie 参数取会话，避免代理层丢 Set-Cookie */
  if (cookie) search.cookie = cookie
  const url = buildUrl(endpoint, search)
  const timeout = withTimeout(options.timeoutMs || SERVICE_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: timeout.signal, headers: requestHeaders(cookie) })
    return await parseResponse(res, endpoint, options.allowCodes)
  } catch (err) {
    if (err instanceof MusicError) throw err
    if (err?.name === 'AbortError') throw new MusicError('QQ 音乐服务响应超时，请确认 3200 端口已启动', 'TIMEOUT')
    const detail = String(err?.cause?.code || err?.message || err)
    throw new MusicError(`连接 QQ 音乐服务失败：${detail}`, 'UNREACHABLE')
  } finally {
    timeout.done()
  }
}

async function qqPost(endpoint, body, options = {}) {
  const cookie = options.withCookie === false ? '' : readCookie()
  const url = buildUrl(endpoint)
  if (cookie) url.searchParams.set('cookie', cookie)
  const timeout = withTimeout(options.timeoutMs || SERVICE_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: timeout.signal,
      headers: { ...requestHeaders(cookie), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return await parseResponse(res, endpoint)
  } catch (err) {
    if (err instanceof MusicError) throw err
    if (err?.name === 'AbortError') throw new MusicError('QQ 音乐服务响应超时，请确认 3200 端口已启动', 'TIMEOUT')
    const detail = String(err?.cause?.code || err?.message || err)
    throw new MusicError(`连接 QQ 音乐服务失败：${detail}`, 'UNREACHABLE')
  } finally {
    timeout.done()
  }
}

function artistOf(track) {
  if (Array.isArray(track?.singer)) return track.singer.map((x) => x?.name || x?.title).filter(Boolean).join('、')
  if (Array.isArray(track?.singers)) return track.singers.map((x) => x?.name || x?.title).filter(Boolean).join('、')
  if (typeof track?.singer === 'string') return track.singer.trim()
  return ''
}

function albumOf(track) {
  return track?.album || track?.albumInfo || {}
}

function coverOfAlbum(albumMid) {
  const mid = String(albumMid || '').trim()
  return mid ? `${COVER_BASE}${mid}.jpg` : ''
}

function normalizeTrack(track) {
  const album = albumOf(track)
  return {
    id: String(track?.mid || track?.songmid || track?.songMid || track?.id || ''),
    name: String(track?.name || track?.title || '未知歌曲'),
    artists: artistOf(track),
    album: String(album?.name || album?.title || ''),
    cover: coverOfAlbum(album?.mid),
    duration: Number(track?.interval || 0) * 1000,
    fee: Number(track?.pay?.pay_play || track?.pay?.pay_month || 0)
  }
}

function normalizePlaylist(playlist) {
  return {
    id: String(playlist?.tid || playlist?.dissid || playlist?.dirid || playlist?.dirId || ''),
    name: String(playlist?.title || playlist?.dissname || playlist?.dirName || playlist?.name || '未命名歌单'),
    cover: String(playlist?.picurl || playlist?.logo || playlist?.cover || ''),
    trackCount: Number(playlist?.songnum || playlist?.songNum || playlist?.song_cnt || playlist?.songCount || 0),
    playCount: Number(playlist?.play_cnt || playlist?.playCount || playlist?.listennum || playlist?.listenNum || 0),
    creator: String(playlist?.creator?.nick || playlist?.nickname || playlist?.creatorName || playlist?.nick || ''),
    subscribed: false
  }
}

function normalizeProfile(profile) {
  if (!profile) return null
  return {
    userId: String(profile.musicid || profile.str_musicid || profile.uin || ''),
    nickname: String(profile.nickname || profile.nick || ''),
    avatar: String(profile.avatarUrl || profile.logo || '')
  }
}

const CURATED_STYLES = [
  { cat: '流行', label: '流行' },
  { cat: '古风', label: '古风' },
  { cat: '摇滚', label: '摇滚' },
  { cat: '轻音乐', label: '纯音乐' },
  { cat: '民谣', label: '民谣' },
  { cat: '电子', label: '电子' },
  { cat: '嘻哈', label: '说唱' },
  { cat: '爵士', label: '爵士' },
  { cat: '古典', label: '古典' }
]

const FOCUS_CATEGORIES = {
  instrumental: {
    label: '纯音乐',
    fallback: '纯音乐',
    variants: [
      { key: 'quiet', label: '安静', keyword: '安静 纯音乐' },
      { key: 'cheerful', label: '欢快', keyword: '欢快 纯音乐' },
      { key: 'study', label: '学习场景', keyword: '学习 纯音乐' },
      { key: 'sad', label: '悲伤场景', keyword: '悲伤 纯音乐' },
      { key: 'healing', label: '治愈', keyword: '治愈 纯音乐' },
      { key: 'sleep', label: '助眠', keyword: '助眠 纯音乐' },
      { key: 'cafe', label: '咖啡馆', keyword: '咖啡馆 纯音乐' },
      { key: 'guofeng', label: '古风', keyword: '古风 纯音乐' },
      { key: 'cinema', label: '电影配乐', keyword: '电影 配乐 纯音乐' }
    ]
  },
  instrument: {
    label: '乐器',
    fallback: '乐器演奏',
    variants: [
      { key: 'piano', label: '钢琴', keyword: '钢琴 纯音乐' },
      { key: 'guitar', label: '吉他', keyword: '吉他 纯音乐' },
      { key: 'violin', label: '小提琴', keyword: '小提琴 纯音乐' },
      { key: 'cello', label: '大提琴', keyword: '大提琴 纯音乐' },
      { key: 'guzheng', label: '古筝', keyword: '古筝 纯音乐' },
      { key: 'guqin', label: '古琴', keyword: '古琴 纯音乐' },
      { key: 'erhu', label: '二胡', keyword: '二胡 纯音乐' },
      { key: 'dizi', label: '笛子', keyword: '笛子 纯音乐' },
      { key: 'saxophone', label: '萨克斯', keyword: '萨克斯 纯音乐' },
      { key: 'drums', label: '架子鼓', keyword: '架子鼓 纯音乐' }
    ]
  },
  noise: {
    label: '白噪声',
    fallback: '白噪音',
    variants: [
      { key: 'rain', label: '雨声', keyword: '雨声 白噪音' },
      { key: 'forest', label: '森林', keyword: '森林 白噪音' },
      { key: 'wave', label: '海浪', keyword: '海浪 白噪音' },
      { key: 'stream', label: '溪流', keyword: '溪流 白噪音' },
      { key: 'wind', label: '大风', keyword: '大风 白噪音' },
      { key: 'thunder', label: '雷声', keyword: '雷声 白噪音' },
      { key: 'fire', label: '炉火', keyword: '炉火 白噪音' },
      { key: 'night', label: '夜晚', keyword: '夜晚 白噪音' },
      { key: 'cafe-noise', label: '咖啡馆', keyword: '咖啡馆 白噪音' }
    ]
  }
}
const FOCUS_MODES = FOCUS_CATEGORIES
const FOCUS_TRACK_COUNT = 5
const FOCUS_POOL_LIMIT = 200
const FOCUS_CACHE_TTL = 10 * 60 * 1000
const FOCUS_POOL_TTL = 30 * 60 * 1000
const focusCache = new Map()
const focusPoolCache = new Map()

async function readStatus() {
  const { baseUrl } = readConfig()
  try {
    const body = await qqGet('/login/status', {}, { timeoutMs: 4500 })
    const profile = body?.data?.profile || null
    return {
      baseUrl,
      connected: true,
      loggedIn: Boolean(profile),
      account: normalizeProfile(profile)
    }
  } catch (err) {
    return {
      baseUrl,
      connected: false,
      loggedIn: false,
      account: null,
      error: err instanceof MusicError ? err.message : String(err?.message || err)
    }
  }
}

function requireLogin(status) {
  if (!status.loggedIn) throw new MusicError('请先扫码登录 QQ 音乐', 'AUTH_REQUIRED', 401)
}

async function playlistDetail(id) {
  const body = await qqGet(`/getSongListDetail/${encodeURIComponent(id)}`, {}, { timeoutMs: 9000 })
  const response = body?.response || {}
  const item = Array.isArray(response.cdlist) ? response.cdlist[0] : null
  if (!item) {
    if (response.subcode === 4000 || response.msg) {
      throw new MusicError('这个歌单暂时被 QQ 音乐限制访问，换一个歌单试试', 'PLAYLIST_LOCKED', 422)
    }
    throw new MusicError('歌单不存在或无法访问', 'PLAYLIST_NOT_FOUND', 404)
  }
  return {
    playlist: {
      id: String(item.disstid || id),
      name: String(item.dissname || '未命名歌单'),
      cover: String(item.logo || ''),
      trackCount: Number(item.songnum || (item.songlist || []).length || 0),
      playCount: Number(item.listennum || 0),
      creator: String(item.nickname || item.nick || ''),
      subscribed: false
    },
    tracks: (Array.isArray(item.songlist) ? item.songlist : []).slice(0, TRACK_LIMIT).map(normalizeTrack)
  }
}

async function getSongUrl(id) {
  if (!id) throw new MusicError('缺少歌曲 id', 'BAD_TRACK', 400)
  const body = await qqGet(`/getMusicPlay/${encodeURIComponent(id)}`, {}, { timeoutMs: 8000 })
  const item = body?.data?.playUrl?.[id]
  if (!item?.url) {
    throw new MusicError(
      '这首歌暂时没有播放链接，可能是 VIP、版权或地区限制。登录 QQ 音乐后可以再试一次，或先换一首免费歌曲。',
      'UNPLAYABLE',
      422
    )
  }
  return {
    url: String(item.url),
    expiresAt: Date.now() + 20 * 60 * 1000,
    type: 'mp3'
  }
}

const streamCache = new Map()

/**
 * 音源地址短缓存。
 * QQ 音乐签名 URL 有有效期，缓存命中还要求剩余时间大于 60 秒，避免把即将过期的地址交给浏览器；
 * 上限 300 条并按插入顺序淘汰，防止长时间播放把内存撑大。
 */
async function streamUrlFor(id) {
  const cached = streamCache.get(id)
  if (cached && cached.expiresAt - Date.now() > 60 * 1000) return cached.url
  const fresh = await getSongUrl(id)
  streamCache.set(id, fresh)
  if (streamCache.size > 300) {
    const oldest = streamCache.keys().next().value
    if (oldest) streamCache.delete(oldest)
  }
  return fresh.url
}

async function prefetchUrl(id) {
  const cached = streamCache.get(id)
  if (cached && cached.expiresAt - Date.now() > 60 * 1000) return cached
  const fresh = await getSongUrl(id)
  streamCache.set(id, fresh)
  return fresh
}

/**
 * 从候选池筛出真正可播放的歌曲。
 * 每次并发探测 6 首，成功拿到音源地址才算可播放，避免把 VIP/版权受限歌曲塞进队列后前端连续报错；
 * 满 5 首即停止，既保证专注队列长度，也控制上游请求量。
 */
async function playableTracks(candidates) {
  const picked = []
  const seen = new Set()
  for (let i = 0; i < candidates.length && picked.length < FOCUS_TRACK_COUNT; i += 6) {
    const batch = candidates.slice(i, i + 6).filter((track) => {
      if (!track?.id || seen.has(track.id)) return false
      seen.add(track.id)
      return true
    })
    const results = await Promise.allSettled(batch.map((track) => prefetchUrl(track.id)))
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && picked.length < FOCUS_TRACK_COUNT) {
        picked.push(batch[index])
      }
    })
  }
  return picked
}

function focusVariant(mode, key) {
  const cfg = FOCUS_MODES[mode]
  if (!cfg) throw new MusicError('未知的专注音乐模式', 'BAD_FOCUS_MODE', 400)
  return cfg.variants.find((x) => x.key === key) || cfg.variants[0]
}

/**
 * 构建某个“场景 + 变体”的候选池。
 * 先用变体关键词搜索歌单，不够 8 个再用场景兜底词；逐个拉详情并去重，最多 200 首。
 * 单个歌单受限/失败只跳过，不影响整体；结果缓存 30 分钟，减少上游搜索压力。
 */
async function buildFocusPool(mode, variant) {
  const cfg = FOCUS_MODES[mode]
  if (!cfg) throw new MusicError('未知的专注音乐模式', 'BAD_FOCUS_MODE', 400)
  const cacheKey = `${mode}:${variant.key}`
  const cached = focusPoolCache.get(cacheKey)
  if (cached && Date.now() - cached.at < FOCUS_POOL_TTL) return cached

  const keywords = [variant.keyword, cfg.fallback]
  const playlistIds = []
  for (const keyword of keywords) {
    try {
      const body = await qqGet('/search', { keyword, type: 'playlist', limit: 10, page: 1 }, { timeoutMs: 8000 })
      for (const item of body?.items || []) {
        const id = String(item?.dissid || item?.tid || '')
        if (id && !playlistIds.includes(id)) playlistIds.push(id)
      }
      if (playlistIds.length >= 8) break
    } catch {
      /* 一个关键词失败时继续用备用关键词 */
    }
  }
  if (!playlistIds.length) throw new MusicError('没有找到可用的歌单', 'FOCUS_NO_PLAYLIST', 404)

  const candidates = []
  const seen = new Set()
  let source = ''
  for (const id of playlistIds.slice(0, 8)) {
    try {
      const detail = await playlistDetail(id)
      if (!source) source = detail.playlist.name
      for (const track of detail.tracks) {
        if (!track.id || seen.has(track.id)) continue
        seen.add(track.id)
        candidates.push(track)
        if (candidates.length >= FOCUS_POOL_LIMIT) break
      }
    } catch {
      /* 受限歌单直接跳过 */
    }
    if (candidates.length >= FOCUS_POOL_LIMIT) break
  }

  const pool = {
    at: Date.now(),
    candidates,
    source: source || cfg.label,
    variant: variant.label,
    variantKey: variant.key
  }
  focusPoolCache.set(cacheKey, pool)
  return pool
}

async function focusQueue(mode, page = 0, excludeIds = [], variantKey = '') {
  const cfg = FOCUS_MODES[mode]
  if (!cfg) throw new MusicError('未知的专注音乐模式', 'BAD_FOCUS_MODE', 400)
  const variant = focusVariant(mode, variantKey)
  const safePage = Math.max(0, Math.floor(Number(page) || 0))
  const cacheKey = `${mode}:${variant.key}:${safePage}:${excludeIds.length}`
  const cached = focusCache.get(cacheKey)
  if (cached && Date.now() - cached.at < FOCUS_CACHE_TTL) return cached.data

  const pool = await buildFocusPool(mode, variant)
  const excluded = new Set(excludeIds.filter(Boolean))
  const candidates = pool.candidates.filter((track) => track?.id && !excluded.has(track.id))
  if (!candidates.length) {
    throw new MusicError('这个分类已经轮完一轮，换一个分类或点重新开始', 'FOCUS_EXHAUSTED', 422)
  }

  const tracks = await playableTracks(candidates)
  if (tracks.length < FOCUS_TRACK_COUNT) {
    throw new MusicError('这个分类暂时没有足够可播放的歌曲，换一个分类或登录 QQ 音乐再试', 'FOCUS_NOT_ENOUGH', 422)
  }
  const data = {
    mode,
    page: safePage,
    label: `${cfg.label} · ${variant.label}`,
    variant: variant.label,
    variantKey: variant.key,
    source: pool.source || cfg.label,
    tracks
  }
  focusCache.set(cacheKey, { at: Date.now(), data })
  return data
}

router.get('/config', (req, res) => {
  ok(res, readConfig())
})

router.post('/config', async (req, res, next) => {
  try {
    const baseUrl = normalizeBase(req.body?.baseUrl)
    writeConfig(baseUrl)
    const status = await readStatus()
    ok(res, status)
  } catch (err) {
    next(err)
  }
})

router.get('/status', async (req, res, next) => {
  try {
    ok(res, await readStatus())
  } catch (err) {
    next(err)
  }
})

router.post('/login/qr', async (req, res, next) => {
  try {
    const keyBody = await qqGet('/login/qr/key', { channel: 'qqmusic' }, { withCookie: false, timeoutMs: 7000 })
    const key = keyBody?.data?.unikey
    if (!key) throw new MusicError('QQ 音乐没有返回二维码 key', 'BAD_QR')
    const qrBody = await qqGet('/login/qr/create', { key }, { withCookie: false, timeoutMs: 7000 })
    const qrImage = qrBody?.data?.qrimg
    if (!qrImage) throw new MusicError('QQ 音乐没有返回二维码图片', 'BAD_QR')
    ok(res, { key, qrImage, qrUrl: '', expiresIn: 180 })
  } catch (err) {
    next(err)
  }
})

router.get('/login/qr/check', async (req, res, next) => {
  try {
    const key = String(req.query.key || '').trim()
    if (!key) throw new MusicError('缺少二维码 key', 'BAD_QR', 400)
    const body = await qqGet('/login/qr/check', { key }, { withCookie: false, timeoutMs: 7000, allowCodes: [800, 801, 802, 803] })
    const code = Number(body?.code)
    if (code === 803) {
      if (body.cookie) writeCookie(body.cookie)
      const status = await readStatus()
      ok(res, { status: 'success', message: '登录成功', account: status.account })
      return
    }
    const statusMap = {
      800: { status: 'expired', message: '二维码已过期，请刷新' },
      801: { status: 'waiting', message: '等待扫码' },
      802: { status: 'scanned', message: '已扫码，请在手机上确认' }
    }
    ok(res, statusMap[code] || { status: 'error', message: body?.message || '二维码状态未知' })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', async (req, res, next) => {
  try {
    if (readCookie()) {
      try {
        await qqGet('/logout', {}, { timeoutMs: 5000 })
      } catch {
        /* 本地登录态仍然要清掉 */
      }
    }
    writeCookie('')
    ok(res, { loggedIn: false })
  } catch (err) {
    next(err)
  }
})

router.get('/styles', async (req, res, next) => {
  try {
    ok(res, CURATED_STYLES)
  } catch (err) {
    next(err)
  }
})

router.get('/focus', async (req, res, next) => {
  try {
    const mode = String(req.query.mode || 'instrumental')
    const variant = String(req.query.variant || '')
    const page = Number(req.query.page || 0)
    const exclude = String(req.query.exclude || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    ok(res, await focusQueue(mode, page, exclude, variant))
  } catch (err) {
    next(err)
  }
})

router.get('/discover', async (req, res, next) => {
  try {
    const cat = String(req.query.cat || '').trim()
    const limit = Math.min(30, Math.max(3, Number(req.query.limit) || 12))
    if (cat) {
      const body = await qqGet('/search', { keyword: cat, type: 'playlist', limit, page: 1 }, { timeoutMs: 8000 })
      ok(res, { cat, playlists: (body?.items || []).map(normalizePlaylist) })
      return
    }
    const body = await qqGet('/recommend/playlists', {}, { timeoutMs: 8000 })
    ok(res, { cat: '', playlists: (body?.playlists || []).slice(0, limit).map(normalizePlaylist) })
  } catch (err) {
    next(err)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const keywords = String(req.query.q || '').trim().slice(0, 60)
    if (!keywords) {
      ok(res, { songs: [], playlists: [], keywords: '' })
      return
    }
    const type = req.query.type === 'playlist' ? 'playlist' : 'song'
    const limit = Math.min(20, Math.max(5, Number(req.query.limit) || 20))
    const body = await qqGet('/search', { keyword: keywords, type, limit, page: 1 }, { timeoutMs: 8000 })
    ok(res, {
      keywords,
      songs: type === 'song' ? (body?.items || []).map(normalizeTrack) : [],
      playlists: type === 'playlist' ? (body?.items || []).map(normalizePlaylist) : []
    })
  } catch (err) {
    next(err)
  }
})

router.get('/playlist/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').replace(/\D/g, '')
    if (!id) throw new MusicError('歌单 id 不合法', 'BAD_PLAYLIST', 400)
    try {
      ok(res, await playlistDetail(id))
      return
    } catch (err) {
      /* 登录态下 QQ 的自建/不公开歌单只能带凭证读 */
      const status = await readStatus()
      if (!status.loggedIn || (err instanceof MusicError && err.code !== 'PLAYLIST_LOCKED')) throw err
      const body = await qqGet('/user/playlist-detail', { tid: id, limit: TRACK_LIMIT }, { timeoutMs: 9000 })
      if (!Array.isArray(body?.songs)) throw err
      ok(res, {
        playlist: {
          id,
          name: String(req.query.name || '我的歌单'),
          cover: '',
          trackCount: Number(body.total || body.songs.length || 0),
          playCount: Number(body.play_cnt || 0),
          creator: status.account?.nickname || '',
          subscribed: false
        },
        tracks: body.songs.slice(0, TRACK_LIMIT).map(normalizeTrack)
      })
    }
  } catch (err) {
    next(err)
  }
})

router.get('/song/:id/url', async (req, res, next) => {
  try {
    ok(res, await getSongUrl(String(req.params.id || '').trim()))
  } catch (err) {
    next(err)
  }
})

router.get('/me', async (req, res, next) => {
  try {
    const status = await readStatus()
    if (!status.connected) throw new MusicError(status.error || 'QQ 音乐服务未连接', 'UNREACHABLE')
    if (!status.loggedIn || !status.account) {
      ok(res, { loggedIn: false, account: null, playlists: [], likedIds: [], likedSongs: [] })
      return
    }
    const playlistsBody = await qqGet('/user/playlist', { playCount: 1 }, { timeoutMs: 9000 })
    const playlists = (playlistsBody?.playlist || []).map(normalizePlaylist)
    let likedSongs = []
    try {
      const likedBody = await qqGet('/user/liked-songs', { offset: 0, limit: 100 }, { timeoutMs: 9000 })
      likedSongs = (likedBody?.songs || []).map(normalizeTrack)
    } catch {
      /* 喜欢列表失败不影响歌单 */
    }
    ok(res, {
      loggedIn: true,
      account: status.account,
      playlists,
      likedIds: likedSongs.map((x) => x.id),
      likedSongs
    })
  } catch (err) {
    next(err)
  }
})

router.post('/like', async (req, res, next) => {
  try {
    const status = await readStatus()
    requireLogin(status)
    const id = String(req.body?.id || '').trim()
    const like = req.body?.like !== false
    if (!id) throw new MusicError('缺少歌曲 id', 'BAD_TRACK', 400)
    const info = await qqGet(`/getSongInfo/${encodeURIComponent(id)}`, {}, { timeoutMs: 8000 })
    const track = info?.response?.songinfo?.data?.track_info
    const numericId = Number(track?.id)
    if (!numericId || track?.mid !== id) throw new MusicError('QQ 音乐没有返回这首歌的完整信息', 'BAD_TRACK')
    const body = await qqPost('/user/song/like', { song: { id: numericId, mid: id, type: 0 }, liked: like }, { timeoutMs: 8000 })
    ok(res, { id, liked: Boolean(body?.liked ?? like), code: body?.code ?? 200 })
  } catch (err) {
    next(err)
  }
})

router.post('/playlist/subscribe', async (req, res, next) => {
  try {
    const status = await readStatus()
    requireLogin(status)
    const id = String(req.body?.id || '').replace(/\D/g, '')
    const subscribe = req.body?.subscribe !== false
    if (!id) throw new MusicError('缺少歌单 id', 'BAD_PLAYLIST', 400)
    const body = await qqPost('/user/playlist/subscribe', { tid: Number(id), subscribed: subscribe }, { timeoutMs: 8000 })
    ok(res, { id, subscribed: Boolean(body?.subscribed ?? subscribe), code: body?.code ?? 200 })
  } catch (err) {
    next(err)
  }
})

/**
 * 音频流代理。
 * 浏览器只访问 /api/music/stream?id=，真实 QQ 音源 URL 不离开服务端；
 * 透传 Range 以支持进度拖动，也透传 content-type/length/range/accept-ranges，
 * 让浏览器原生 audio 能正常 seek。上游失败时清掉该 id 的缓存，下次重新取签名地址。
 */
router.get('/stream', async (req, res, next) => {
  try {
    const id = String(req.query.id || '').trim()
    if (!id) throw new MusicError('缺少歌曲 id', 'BAD_TRACK', 400)
    const url = await streamUrlFor(id)
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      Referer: 'https://y.qq.com/'
    }
    if (req.headers.range) headers.Range = req.headers.range
    const upstream = await fetch(url, { headers, redirect: 'follow' })
    if (!upstream.ok && upstream.status !== 206) {
      streamCache.delete(id)
      throw new MusicError(`歌曲音源返回 HTTP ${upstream.status}`, 'AUDIO_HTTP_' + upstream.status, 502)
    }
    res.status(upstream.status)
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'audio/mpeg')
    if (!upstream.body) {
      res.end()
      return
    }
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (err) {
    next(err)
  }
})

router.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = Number(err?.status) || 502
  fail(res, status, err?.message || '音乐服务出错', err?.code || 'MUSIC_ERROR')
})

export { router as musicRouter }
