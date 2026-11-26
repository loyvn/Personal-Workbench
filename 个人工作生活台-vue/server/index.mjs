/**
 * 文件：server/index.mjs
 * 说明：Express 服务端入口。提供状态读写、快照、重置/清空、小说原文件上传读取与静态资源托管；写入采用临时文件加 rename，避免损坏 state.json。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { musicRouter } from './music-service.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(__dirname, 'data')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const SNAP_DIR = path.join(DATA_DIR, 'snapshots')
const NOVEL_DIR = path.join(DATA_DIR, 'novel-files')
const NOVEL_FILE_MAX = 8 * 1024 * 1024
const NOVEL_EXTS = new Set(['.txt', '.md', '.markdown', '.doc', '.docx', '.pdf'])
const SNAP_MAX = 5
const PORT = Number(process.env.PORT || 8787)
const APP_ID = 'personal-os'
const STATE_VERSION = 6

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(SNAP_DIR, { recursive: true })
fs.mkdirSync(NOVEL_DIR, { recursive: true })

const nowISO = () => new Date().toISOString()

const taskDomain = (v) => {
  if (v === 'dev' || v === 'video' || v === 'novel' || v === 'media') return v
  if (v === 'create') return 'novel'
  return 'dev'
}

function blankState() {
  return {
    version: STATE_VERSION,
    app: APP_ID,
    deviceName: '本机服务',
    theme: 'light',
    general: { nickname: '', backupRemindDays: 7 },
    appearance: {
      background: { kind: 'paper', color: '#efede7', lightColor: '#efede7', darkColor: '#1a1c1a', image: '', imageSource: '', imageHistory: [], dim: 35, blur: 0 },
      reduceMotion: false
    },
    dataPrefs: { autoSnapshot: true },
    modules: {
      home: 1, tasks: 1, focus: 1, music: 1, habits: 1, fitness: 1, media: 1,
      novel: 1, output: 1, learning: 1, dev: 1, ideas: 1, favorites: 1, reading: 1, leisure: 1, settings: 1, data: 1
    },
    meta: { createdAt: nowISO(), lastExportAt: null },
    tasks: [],
    goals: [],
    focus: {
      settings: {
        mode: 'pomodoro',
        work: 25,
        customWork: 45,
        short: 5,
        long: 15,
        roundsBeforeLong: 4,
        autoStartBreak: false,
        autoStartNextWork: false,
        soundOn: true
      },
      noise: { preset: 'rain', volume: 35, autoStartWithFocus: false, timerMin: 0 },
      sessions: []
    },
    music: {
      settings: {
        mode: 'loop',
        style: '流行',
        volume: 62,
        autoStartWithFocus: false,
        showGlobalBar: true
      },
      queue: [],
      currentId: null,
      recent: [],
      liked: [],
      playlists: [],
      updatedAt: nowISO()
    },
    habits: [],
    checkins: {},
    fitness: { split: [], exercises: [], sessions: [], metrics: [] },
    media: {
      platforms: [
        { id: 'p_xhs', name: '小红书', color: '#B4452F' },
        { id: 'p_dy', name: '抖音', color: '#22201C' },
        { id: 'p_wx', name: '公众号', color: '#4E7A46' },
        { id: 'p_bili', name: 'B站', color: '#3A6EA5' },
        { id: 'p_sph', name: '视频号', color: '#8C6239' }
      ],
      topics: [],
      items: []
    },
    output: { projects: [], shots: [], prompts: [], iterations: [], tickets: [] },
    learning: { tracks: [], stages: [], topics: [], logs: [], resources: [] },
    novel: { works: [], chapters: [], settings: [], foreshadows: [], storyNodes: [], wordLog: {} },
    ideas: [],
    summaries: [],
    favorites: { folders: [], items: [] },
    reading: { books: [], logs: [] },
    leisure: []
  }
}

/**
 * 服务端读取状态。
 * 服务端不做完整业务归一化（前端 normalizeState 才是最终权威），但必须保证：
 * - 文件损坏/JSON 解析失败时自愈为空白库并立即写回，避免每次启动都报错；
 * - 旧库缺字段时用 blankState 深合并补齐，至少让接口返回结构可用的对象；
 * - 任务 domain 做一次旧值迁移（create → novel），防止前端收到未知枚举。
 */
function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return blankState()
    const base = blankState()
    return {
      ...base,
      ...parsed,
      version: STATE_VERSION,
      app: APP_ID,
      theme: parsed.theme === 'dark' || parsed.theme === 'auto' ? parsed.theme : 'light',
      general: { ...base.general, ...(parsed.general || {}) },
      appearance: {
        ...base.appearance,
        ...(parsed.appearance || {}),
        background: { ...base.appearance.background, ...((parsed.appearance || {}).background || {}) }
      },
      dataPrefs: { ...base.dataPrefs, ...(parsed.dataPrefs || {}) },
      focus: {
        ...base.focus,
        ...(parsed.focus || {}),
        settings: { ...base.focus.settings, ...((parsed.focus || {}).settings || {}) },
        noise: { ...base.focus.noise, ...((parsed.focus || {}).noise || {}) }
      },
      modules: { ...base.modules, ...(parsed.modules || {}) },
      meta: { ...base.meta, ...(parsed.meta || {}) },
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map((t) => ({ ...t, domain: taskDomain(t?.domain) }))
        : [],
      goals: Array.isArray(parsed.goals)
        ? parsed.goals.map((g) => ({ ...g, domain: taskDomain(g?.domain) }))
        : [],
      music: {
        ...base.music,
        ...(parsed.music || {}),
        settings: { ...base.music.settings, ...((parsed.music || {}).settings || {}) },
        queue: Array.isArray((parsed.music || {}).queue) ? parsed.music.queue : [],
        currentId: (parsed.music || {}).currentId ?? null,
        recent: Array.isArray((parsed.music || {}).recent) ? parsed.music.recent : [],
        liked: Array.isArray((parsed.music || {}).liked) ? parsed.music.liked : [],
        playlists: Array.isArray((parsed.music || {}).playlists) ? parsed.music.playlists : []
      },
      novel: {
        ...base.novel,
        ...(parsed.novel || {}),
        storyNodes: Array.isArray(parsed.novel?.storyNodes) ? parsed.novel.storyNodes : []
      },
      reading: {
        books: Array.isArray(parsed.reading?.books) ? parsed.reading.books : [],
        logs: Array.isArray(parsed.reading?.logs) ? parsed.reading.logs : []
      }
    }
  } catch {
    const fresh = blankState()
    writeState(fresh)
    return fresh
  }
}

/**
 * 先写临时文件再 rename。
 * rename 在同一分区上是原子的：要么看到完整旧文件，要么看到完整新文件；
 * 直接覆盖原文件时若进程在写入中途退出，会留下半份 JSON，之后启动只能回退空白库。
 */
function writeState(state) {
  const json = JSON.stringify(state)
  const tmp = `${STATE_FILE}.tmp`
  fs.writeFileSync(tmp, json, 'utf8')
  fs.renameSync(tmp, STATE_FILE)
  return { savedAt: nowISO(), bytes: Buffer.byteLength(json, 'utf8') }
}

function snapFiles() {
  return fs
    .readdirSync(SNAP_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => Number(b.replace('.json', '')) - Number(a.replace('.json', '')))
}

/**
 * 列出快照元信息。
 * 文件名是时间戳 key，倒序即最新在前；单个快照损坏时返回「损坏的快照」占位，
 * 不因为一份坏文件让整个快照列表接口失败。
 */
function listSnapshots() {
  return snapFiles().map((f) => {
    const key = f.replace('.json', '')
    const full = path.join(SNAP_DIR, f)
    try {
      const raw = fs.readFileSync(full, 'utf8')
      const o = JSON.parse(raw)
      return { key, label: o.label || '快照', at: o.at || '', size: Buffer.byteLength(raw, 'utf8') }
    } catch {
      return { key, label: '损坏的快照', at: '', size: 0 }
    }
  })
}

const app = express()
app.use(express.json({ limit: '12mb' }))

const ok = (res, data) => res.json({ ok: true, data })
const fail = (res, status, message) => res.status(status).json({ ok: false, error: { message } })

app.use('/api/music', musicRouter)

app.get('/api/ping', (req, res) => {
  ok(res, { mode: 'server', label: 'express · 文件持久化', ok: true })
})

app.get('/api/state', (req, res) => {
  ok(res, readState())
})

app.put('/api/state', (req, res) => {
  const body = req.body
  if (!body || typeof body !== 'object') {
    fail(res, 400, '请求体必须是 JSON 对象')
    return
  }
  if (body.app && body.app !== APP_ID) {
    fail(res, 422, '不是本应用的数据')
    return
  }
  ok(res, writeState({ ...body, app: APP_ID, version: STATE_VERSION }))
})

app.post('/api/state/reset', (req, res) => {
  const demo = Boolean(req.body && req.body.demo)
  const next = blankState()
  if (demo) {
    const t = nowISO().slice(0, 10)
    next.tasks = [
      {
        id: 'srv_demo_1',
        title: '示例：把工作台跑起来',
        note: '',
        dueDate: t,
        domain: 'dev',
        priority: 'mid',
        done: false,
        doneAt: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
      }
    ]
    next.habits = [
      {
        id: 'srv_demo_h1',
        name: '示例：阅读 20 分钟',
        freqType: 'daily',
        weeklyTarget: 7,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        active: 1,
        order: 0,
        createdAt: nowISO(),
        updatedAt: nowISO()
      }
    ]
    next.checkins = { srv_demo_h1: [t] }
  }
  writeState(next)
  ok(res, next)
})

app.delete('/api/state', (req, res) => {
  const next = blankState()
  writeState(next)
  ok(res, next)
})

/**
 * 小说原文件上传。
 * 接受纯 base64 或 dataURL；先校验扩展名白名单，再解码并限制 8MB，
 * 文件名不直接落盘，服务端生成「时间戳 + 12 位随机 + 扩展名」作为 id，
 * 避免同名覆盖和 ../ 路径穿越。state 只保存返回的元信息与 url。
 */
app.post('/api/novel/files', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 180)
  const data = String((req.body && req.body.data) || '')
  const type = String((req.body && req.body.type) || '').slice(0, 100)
  const ext = path.extname(name).toLowerCase()
  if (!name || !NOVEL_EXTS.has(ext)) {
    fail(res, 415, '只支持 txt、md、doc、docx、pdf 文档')
    return
  }
  const match = data.match(/^data:[^;]*;base64,(.+)$/s)
  const raw = match ? match[1] : data
  if (!raw) {
    fail(res, 400, '文件内容为空')
    return
  }
  let buffer
  try {
    buffer = Buffer.from(raw, 'base64')
  } catch {
    fail(res, 400, '文件内容无法解析')
    return
  }
  if (!buffer.length) {
    fail(res, 400, '文件内容为空')
    return
  }
  if (buffer.length > NOVEL_FILE_MAX) {
    fail(res, 413, '文档不能超过 8MB')
    return
  }
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`
  fs.writeFileSync(path.join(NOVEL_DIR, id), buffer)
  ok(res, {
    id,
    name,
    size: buffer.length,
    type,
    url: `/api/novel/files/${id}?name=${encodeURIComponent(name)}`,
    uploadedAt: nowISO()
  })
})

/**
 * 读取/下载小说原文件。
 * id 必须完全匹配服务端生成格式，杜绝路径穿越；下载名只清理换行与引号，
 * 再用 RFC 5987 的 filename* 传中文名，避免响应头按 ASCII 解析乱码。
 */
app.get('/api/novel/files/:id', (req, res) => {
  const id = String(req.params.id || '')
  if (!/^\d+-[a-f0-9]{12}\.(txt|md|markdown|doc|docx|pdf)$/.test(id)) {
    fail(res, 400, '文件标识不合法')
    return
  }
  const full = path.join(NOVEL_DIR, id)
  if (!fs.existsSync(full)) {
    fail(res, 404, '文档不存在')
    return
  }
  const name = String(req.query.name || id).replace(/[\r\n"]/g, '').slice(0, 180)
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`)
  res.sendFile(full)
})

app.delete('/api/novel/files/:id', (req, res) => {
  const id = String(req.params.id || '')
  if (!/^\d+-[a-f0-9]{12}\.(txt|md|markdown|doc|docx|pdf)$/.test(id)) {
    fail(res, 400, '文件标识不合法')
    return
  }
  fs.rmSync(path.join(NOVEL_DIR, id), { force: true })
  ok(res, { id, removed: true })
})

app.get('/api/snapshots', (req, res) => {
  ok(res, listSnapshots())
})

/**
 * 创建快照并裁剪。
 * 快照 key 用毫秒时间戳保证递增；写入后按文件名倒序只保留最近 5 份，
 * 删除超出部分，避免长期使用把整个 data 目录撑大。
 */
app.post('/api/snapshots', (req, res) => {
  const label = String((req.body && req.body.label) || '手动备份')
  const at = nowISO()
  const key = String(Date.now())
  const raw = JSON.stringify({ label, at, data: readState() })
  const file = path.join(SNAP_DIR, `${key}.json`)
  fs.writeFileSync(file, raw, 'utf8')
  snapFiles()
    .slice(SNAP_MAX)
    .forEach((f) => fs.rmSync(path.join(SNAP_DIR, f), { force: true }))
  ok(res, { key, label, at, size: Buffer.byteLength(raw, 'utf8') })
})

app.post('/api/snapshots/restore', (req, res) => {
  const key = String((req.body && req.body.key) || '')
  if (!/^\d+$/.test(key)) {
    fail(res, 400, '快照标识不合法')
    return
  }
  const file = path.join(SNAP_DIR, `${key}.json`)
  if (!fs.existsSync(file)) {
    fail(res, 404, '快照不存在')
    return
  }
  const o = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!o || !o.data) {
    fail(res, 422, '快照内容不可用')
    return
  }
  const next = { ...o.data, app: APP_ID, version: STATE_VERSION }
  writeState(next)
  ok(res, next)
})

const dist = path.join(ROOT, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  fail(res, 500, err.message || '服务端错误')
})

app.listen(PORT, () => {
  console.log(`[personal-os] express 已启动：http://127.0.0.1:${PORT}`)
  console.log(`[personal-os] 数据文件：${STATE_FILE}`)
  console.log(`[personal-os] 是否托管 dist：${fs.existsSync(dist) ? '是' : '否（先 build:express）'}`)
})
