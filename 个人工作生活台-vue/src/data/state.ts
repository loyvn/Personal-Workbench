/**
 * 文件：src/data/state.ts
 * 说明：应用数据模型与迁移层。提供空白状态、示例状态，以及把旧版/外部 JSON 归一化为当前 StateVersion 的完整校验、补默认值和去重逻辑。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type {
  AppState,
  TaskDomain,
  ContentBinding,
  IdeaKind,
  FavoriteKind,
  LearningState,
  LearningStage,
  LearningTopic,
  LearningStatus,
  StudyLog,
  Resource,
  Track
} from '@/types'
import { nowISO } from '@/utils/misc'
import { analyzeIdeaTags, mergeTags } from '@/utils/ideaTags'
import { todayStr, shiftYMD } from '@/utils/date'
import { themeForSolidColor } from '@/utils/color'

export const APP_ID = 'personal-os'
export const STATE_VERSION = 6

function guessDevice(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return '手机'
  if (/Android/i.test(ua)) return '安卓手机'
  if (/Mac/i.test(ua)) return 'Mac'
  return '我的电脑'
}

export function blankState(deviceName = guessDevice()): AppState {
  return {
    version: STATE_VERSION,
    app: APP_ID,
    deviceName,
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
      settings: { mode: 'loop', style: '流行', volume: 62, autoStartWithFocus: false, showGlobalBar: true },
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

/** 兼容旧库 / 手工改过的 JSON：补齐缺失字段，不信任外部结构 */
export function normalizeState(raw: unknown, deviceName?: string): AppState {
  const base = blankState(deviceName)
  if (!raw || typeof raw !== 'object') return base
  const src = raw as Partial<AppState>
  const srcAppearance = (src.appearance || {}) as Partial<AppState['appearance']>
  const srcBg = (srcAppearance.background || {}) as Partial<AppState['appearance']['background']>
  /*
   * 外观是旧库迁移最容易出问题的部分：
   * 旧版本只有 background.color，没有 lightColor/darkColor/imageHistory；
   * 这里先从 color 推断主题，再把浅/深两套颜色、图片历史上限（6 张）补齐，
   * 同时限制 dataURL 长度，防止手工改 JSON 塞入超大图片把存储打爆。
   */
  const srcGeneral = (src.general || {}) as Partial<AppState['general']>
  const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.round(v)))
  }
  const theme = src.theme === 'dark' || src.theme === 'auto' ? src.theme : 'light'
  const bgKind = srcBg.kind === 'color' || srcBg.kind === 'image' ? srcBg.kind : 'paper'
  const bgSource = srcBg.imageSource === 'upload' || srcBg.imageSource === 'url' ? srcBg.imageSource : ''
  const bgHex = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : '')
  const bgImage = (v: unknown): string =>
    typeof v === 'string' && v.length > 0 && v.length <= 1_500_000 ? v : ''
  const storedColor = bgHex(srcBg.color) || '#efede7'
  const storedTheme = themeForSolidColor(storedColor) || 'light'
  const lightColor = bgHex(srcBg.lightColor) || (storedTheme === 'light' ? storedColor : '#efede7')
  const darkColor = bgHex(srcBg.darkColor) || (storedTheme === 'dark' ? storedColor : '#1a1c1a')
  const currentImage = bgImage(srcBg.image)
  const rawHistory = Array.isArray(srcBg.imageHistory) ? srcBg.imageHistory : []
  const history = rawHistory
    .map(bgImage)
    .filter((x): x is string => Boolean(x))
    .filter((x, i, all) => all.indexOf(x) === i)
    .slice(0, 6)
  if (currentImage && !history.includes(currentImage)) history.unshift(currentImage)
  const imageHistory = history.slice(0, 6)
  const remind = srcGeneral.backupRemindDays
  const srcFocus = (src.focus || {}) as Partial<AppState['focus']>
  const srcFocusSettings = (srcFocus.settings || {}) as Partial<AppState['focus']['settings']>
  const focusMode = srcFocusSettings.mode === 'custom' || srcFocusSettings.mode === 'open' ? srcFocusSettings.mode : 'pomodoro'
  const srcMusic = (src.music || {}) as Partial<AppState['music']>
  const srcMusicSettings = (srcMusic.settings || {}) as Partial<AppState['music']['settings']>
  const srcReading = (src.reading || {}) as Partial<AppState['reading']>
  const srcFavorites = (src.favorites || {}) as Partial<AppState['favorites']>
  const musicMode =
    srcMusicSettings.mode === 'sequence' || srcMusicSettings.mode === 'single' || srcMusicSettings.mode === 'shuffle'
      ? srcMusicSettings.mode
      : 'loop'
  const text = (v: unknown, max = 300): string => (typeof v === 'string' ? v.slice(0, max) : '')
  const safeStrings = (v: unknown, max = 16): string[] =>
    Array.isArray(v) ? v.map((x) => text(x, 40)).filter(Boolean).slice(0, max) : []
  const safeBindings = (v: unknown): ContentBinding[] => {
    if (!Array.isArray(v)) return []
    return v.slice(0, 20).flatMap((raw) => {
      const b = raw as Record<string, unknown>
      const module = b.module === 'media' || b.module === 'novel' || b.module === 'output' ? b.module : null
      const id = text(b.id, 40)
      if (!module || !id) return []
      return [{ module, id, title: text(b.title, 80) || '未命名', group: text(b.group, 20) }]
    })
  }
  const safeTracks = (list: unknown, max: number): AppState['music']['queue'] => {
    if (!Array.isArray(list)) return []
    return list
      .filter((x) => x && typeof x === 'object' && String((x as { id?: unknown }).id || '').trim())
      .slice(0, max)
      .map((x) => {
        const t = x as Record<string, unknown>
        return {
          id: text(t.id, 40),
          name: text(t.name, 120) || '未知歌曲',
          artists: text(t.artists, 120),
          album: text(t.album, 120),
          cover: text(t.cover, 500),
          duration: clamp(t.duration, 0, 24 * 3600 * 1000, 0),
          fee: clamp(t.fee, 0, 100, 0)
        }
      })
  }
  const safePlaylists = (list: unknown): AppState['music']['playlists'] => {
    if (!Array.isArray(list)) return []
    return list
      .filter((x) => x && typeof x === 'object' && String((x as { id?: unknown }).id || '').trim())
      .slice(0, 100)
      .map((x) => {
        const p = x as Record<string, unknown>
        return {
          id: text(p.id, 40),
          name: text(p.name, 120) || '未命名歌单',
          cover: text(p.cover, 500),
          trackCount: clamp(p.trackCount, 0, 100000, 0),
          playCount: clamp(p.playCount, 0, 1000000000, 0),
          creator: text(p.creator, 80),
          subscribed: Boolean(p.subscribed)
        }
      })
  }
  const safeFavoriteFolders = (list: unknown): AppState['favorites']['folders'] => {
    if (!Array.isArray(list)) return []
    const seen = new Set<string>()
    return list.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return []
      const x = raw as Record<string, unknown>
      const id = text(x.id, 40)
      if (!id || seen.has(id)) return []
      seen.add(id)
      return [{
        id,
        name: text(x.name, 24) || '未命名收藏夹',
        createdAt: text(x.createdAt, 40) || nowISO(),
        updatedAt: text(x.updatedAt, 40) || nowISO()
      }]
    }).slice(0, 100)
  }
  const safeFavoriteItems = (list: unknown, folderIds: Set<string>): AppState['favorites']['items'] => {
    if (!Array.isArray(list)) return []
    const kinds: FavoriteKind[] = ['text', 'link', 'image', 'file']
    return list.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return []
      const x = raw as Record<string, unknown>
      const id = text(x.id, 40)
      if (!id) return []
      const kind = kinds.includes(x.kind as FavoriteKind) ? (x.kind as FavoriteKind) : 'text'
      const folderId = text(x.folderId, 40)
      const fileName = text(x.fileName, 180)
      return [{
        id,
        kind,
        folderId: folderId && folderIds.has(folderId) ? folderId : null,
        title: text(x.title, 160) || fileName || '未命名收藏',
        summary: text(x.summary, 2400),
        note: text(x.note, 4000),
        text: text(x.text, 8000),
        url: text(x.url, 2000),
        image: text(x.image, 2_500_000),
        fileName,
        fileType: text(x.fileType, 120),
        fileSize: clamp(x.fileSize, 0, 100_000_000, 0),
        fileData: text(x.fileData, 12_000_000),
        tags: safeStrings(x.tags, 20),
        createdAt: text(x.createdAt, 40) || nowISO(),
        updatedAt: text(x.updatedAt, 40) || nowISO()
      }]
    }).slice(0, 1000)
  }
  /**
   * 学习数据存在 track → stage → topic → log/resource 的引用关系。
   * 不能只保证数组存在，还要过滤掉指向不存在 track/topic 的孤儿记录，
   * 否则页面按 id 查找时会拿到 undefined；同时用 Set 去重，避免重复导入产生双份。
   */
  const safeLearning = (): LearningState => {
    const raw = (src.learning || {}) as Partial<LearningState>
    const trackIds = new Set<string>()
    const tracks: Track[] = (Array.isArray(raw.tracks) ? raw.tracks : []).slice(0, 100).flatMap((item) => {
      const x = item as unknown as Record<string, unknown>
      const id = text(x.id, 40)
      if (!id || trackIds.has(id)) return []
      trackIds.add(id)
      return [{
        id,
        domain: x.domain === 'dev' ? 'dev' : 'video',
        name: text(x.name, 120) || '未命名学习线',
        goal: text(x.goal, 1000),
        deadline: text(x.deadline, 20),
        templateId: text(x.templateId, 80) || undefined,
        createdAt: text(x.createdAt, 40) || nowISO()
      } as Track]
    })
    const stages: LearningStage[] = (Array.isArray(raw.stages) ? raw.stages : []).slice(0, 600).flatMap((item) => {
      const x = item as unknown as Record<string, unknown>
      const id = text(x.id, 40)
      const trackId = text(x.trackId, 40)
      if (!id || !trackIds.has(trackId)) return []
      return [{
        id,
        trackId,
        name: text(x.name, 80) || '未命名阶段',
        goal: text(x.goal, 1000),
        outcome: text(x.outcome, 1000),
        order: clamp(x.order, 0, 1000, 0),
        createdAt: text(x.createdAt, 40) || nowISO()
      }]
    })
    const statusOf = (v: unknown): LearningStatus => {
      if (v === 'mastered' || v === 'explain') return 'explain'
      if (v === 'build' || v === 'doing') return v
      return 'todo'
    }
    const topicIds = new Set<string>()
    const topics: LearningTopic[] = (Array.isArray(raw.topics) ? raw.topics : []).slice(0, 5000).flatMap((item) => {
      const x = item as unknown as Record<string, unknown>
      const id = text(x.id, 40)
      const trackId = text(x.trackId, 40)
      if (!id || !trackIds.has(trackId) || topicIds.has(id)) return []
      topicIds.add(id)
      return [{
        id,
        trackId,
        stage: text(x.stage, 80) || '基础',
        title: text(x.title, 240) || '未命名知识点',
        status: statusOf(x.status),
        minutes: clamp(x.minutes, 0, 1_000_000, 0),
        estMinutes: clamp(x.estMinutes, 0, 100_000, 60),
        note: text(x.note, 4000),
        prerequisite: text(x.prerequisite, 1000),
        artifact: text(x.artifact, 1000),
        lastStudiedAt: text(x.lastStudiedAt, 40),
        nextReviewAt: text(x.nextReviewAt, 20),
        reviewCount: clamp(x.reviewCount, 0, 1000, 0),
        updatedAt: text(x.updatedAt, 40) || nowISO()
      }]
    })
    const logs: StudyLog[] = (Array.isArray(raw.logs) ? raw.logs : []).slice(0, 5000).flatMap((item) => {
      const x = item as unknown as Record<string, unknown>
      const id = text(x.id, 40)
      const trackId = text(x.trackId, 40)
      const topicId = text(x.topicId, 40)
      if (!id || !trackIds.has(trackId) || !topicIds.has(topicId)) return []
      return [{
        id,
        trackId,
        topicId,
        date: text(x.date, 20) || todayStr(),
        minutes: clamp(x.minutes, 1, 1440, 1),
        learned: text(x.learned, 2000),
        blocker: text(x.blocker, 2000),
        nextAction: text(x.nextAction, 2000),
        artifact: text(x.artifact, 1000),
        createdAt: text(x.createdAt, 40) || nowISO()
      }]
    })
    const resources: Resource[] = (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 2000).flatMap((item) => {
      const x = item as unknown as Record<string, unknown>
      const id = text(x.id, 40)
      const trackId = text(x.trackId, 40)
      if (!id || !trackIds.has(trackId)) return []
      const type = x.type === 'course' || x.type === 'book' || x.type === 'video' ? x.type : 'doc'
      const topicId = text(x.topicId, 40)
      return [{
        id,
        trackId,
        topicId: topicId && topicIds.has(topicId) ? topicId : undefined,
        title: text(x.title, 240) || '未命名资源',
        type,
        url: text(x.url, 2000),
        estMinutes: clamp(x.estMinutes, 0, 100_000, 0),
        consumed: Boolean(x.consumed)
      }]
    })
    return { tracks, stages, topics, logs, resources }
  }
  const normalizedLearning = safeLearning()
  const normalizedFolders = safeFavoriteFolders(srcFavorites.folders)
  const normalizedFavorites: AppState['favorites'] = {
    folders: normalizedFolders,
    items: safeFavoriteItems(srcFavorites.items, new Set(normalizedFolders.map((x) => x.id)))
  }
  /*
   * 采用「默认值 + 外部值」逐层覆盖，而不是整体替换：
   * 这样新增模块/新增字段会自动拿到默认值，旧数据中的未知字段也能保留；
   * 但所有会参与计算或有长度风险的字段都显式 clamp/Boolean/text，避免类型污染。
   */
  const out: AppState = {
    ...base,
    ...src,
    version: STATE_VERSION,
    app: APP_ID,
    theme,
    general: {
      nickname: typeof srcGeneral.nickname === 'string' ? srcGeneral.nickname.slice(0, 20) : '',
      backupRemindDays: remind === 0 || remind === 14 || remind === 30 ? remind : 7
    },
    appearance: {
      reduceMotion: Boolean(srcAppearance.reduceMotion),
      background: {
        kind: bgKind,
        color: storedColor,
        lightColor,
        darkColor,
        image: currentImage,
        imageSource: bgSource,
        imageHistory,
        dim: clamp(srcBg.dim, 0, 100, 35),
        blur: clamp(srcBg.blur, 0, 20, 0)
      }
    },
    dataPrefs: { autoSnapshot: src.dataPrefs ? Boolean(src.dataPrefs.autoSnapshot) : true },
    modules: { ...base.modules, ...(src.modules || {}) },
    meta: { ...base.meta, ...(src.meta || {}) },
    focus: {
      settings: {
        ...base.focus.settings,
        ...srcFocusSettings,
        mode: focusMode,
        work: clamp(srcFocusSettings.work, 1, 120, 25),
        customWork: clamp(srcFocusSettings.customWork, 5, 180, 45),
        short: clamp(srcFocusSettings.short, 1, 60, 5),
        long: clamp(srcFocusSettings.long, 1, 90, 15),
        roundsBeforeLong: clamp(srcFocusSettings.roundsBeforeLong, 2, 8, 4),
        autoStartBreak: Boolean(srcFocusSettings.autoStartBreak),
        autoStartNextWork: Boolean(srcFocusSettings.autoStartNextWork),
        soundOn: srcFocusSettings.soundOn === undefined ? true : Boolean(srcFocusSettings.soundOn)
      },
      noise: { ...base.focus.noise, ...((src.focus || {}).noise || {}) },
      sessions: Array.isArray((src.focus || {}).sessions) ? (src.focus as AppState['focus']).sessions : []
    },
    music: {
      settings: {
        mode: musicMode,
        style: text(srcMusicSettings.style, 30) || '流行',
        volume: clamp(srcMusicSettings.volume, 0, 100, 62),
        autoStartWithFocus: Boolean(srcMusicSettings.autoStartWithFocus),
        showGlobalBar: srcMusicSettings.showGlobalBar === undefined ? true : Boolean(srcMusicSettings.showGlobalBar)
      },
      queue: safeTracks(srcMusic.queue, 200),
      currentId: typeof srcMusic.currentId === 'string' ? text(srcMusic.currentId, 40) : null,
      recent: safeTracks(srcMusic.recent, 50),
      liked: safeTracks(srcMusic.liked, 200),
      playlists: safePlaylists(srcMusic.playlists),
      updatedAt: text(srcMusic.updatedAt, 40) || nowISO()
    },
    fitness: { ...base.fitness, ...(src.fitness || {}) },
    media: { ...base.media, ...(src.media || {}) },
    output: { ...base.output, ...(src.output || {}) },
    learning: normalizedLearning,
    novel: {
      ...base.novel,
      ...(src.novel || {}),
      storyNodes: Array.isArray(src.novel?.storyNodes) ? src.novel.storyNodes : []
    },
    reading: {
      books: Array.isArray(srcReading.books) ? srcReading.books : [],
      logs: Array.isArray(srcReading.logs) ? srcReading.logs : []
    },
    favorites: normalizedFavorites
  }
  /*
   * 二级归一化：数组类字段先保证类型正确，再逐项修正枚举、标签和绑定关系。
   * 灵感标签只在旧数据完全没有结构化字段时重新推断，避免每次加载都覆盖用户手改的标签。
   */
  ;(['tasks', 'goals', 'habits', 'ideas', 'summaries', 'leisure'] as const).forEach((k) => {
    if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown[]>)[k] = []
  })
  const normalizeDomain = (v: unknown): TaskDomain => {
    if (v === 'dev' || v === 'video' || v === 'novel' || v === 'media') return v
    if (v === 'create') return 'novel'
    return 'dev'
  }
  out.ideas = out.ideas.map((raw) => {
    const x = raw as Partial<AppState['ideas'][number]>
    const kind: IdeaKind = x.kind === 'link' || x.kind === 'image' ? x.kind : 'text'
    const body = text(x.text, 4000)
    const title = text(x.title, 160)
    const url = text(x.url, 2000)
    const image = text(x.image, 2_000_000)
    const oldTags = safeStrings(x.tags, 16)
    const hasStructuredTags = Array.isArray(x.categories) || Array.isArray(x.subcategories) || Array.isArray(x.keywords)
    const auto = hasStructuredTags ? { categories: [], subcategories: [], keywords: [] } : analyzeIdeaTags({ kind, text: body, title, url })
    return {
      ...x,
      id: text(x.id, 40),
      kind,
      text: body,
      title,
      url,
      image,
      tags: oldTags,
      categories: hasStructuredTags ? safeStrings(x.categories) : auto.categories,
      subcategories: hasStructuredTags ? safeStrings(x.subcategories) : auto.subcategories,
      keywords: hasStructuredTags ? safeStrings(x.keywords) : mergeTags(auto.keywords, oldTags),
      source: x.source === 'manual' ? 'manual' : 'quick',
      capturedAt: text(x.capturedAt, 40) || nowISO(),
      bindings: safeBindings(x.bindings),
      convertedTo: x.convertedTo || null,
      convertedId: x.convertedId || null
    }
  })
  out.summaries = out.summaries.map((raw) => {
    const x = raw as Partial<AppState['summaries'][number]>
    return {
      ...x,
      id: text(x.id, 40),
      title: text(x.title, 160) || '未命名摘要',
      sourceUrl: text(x.sourceUrl, 2000),
      points: Array.isArray(x.points) ? x.points.map((p) => text(p, 1000)).filter(Boolean).slice(0, 20) : [],
      judgement: text(x.judgement, 2000),
      createdAt: text(x.createdAt, 40) || nowISO(),
      bindings: safeBindings(x.bindings)
    }
  })
  out.tasks = out.tasks.map((t) => ({ ...t, domain: normalizeDomain((t as { domain?: unknown }).domain) }))
  out.goals = out.goals.map((g) => ({ ...g, domain: normalizeDomain((g as { domain?: unknown }).domain) }))
  if (!out.checkins || typeof out.checkins !== 'object') out.checkins = {}
  if (!Array.isArray(out.media.platforms) || !out.media.platforms.length) out.media.platforms = base.media.platforms
  return out
}

/**
 * 生成示例数据（载入示例/首次体验用）。
 * 所有 id 使用固定前缀，演示数据可重复生成而不影响真实数据；
 * 日期基于今天动态偏移，保证「今日/本周」视图有内容可看。
 */
export function demoState(): AppState {
  const s = blankState()
  const t = todayStr()
  const tasks: Array<[string, number, 'dev' | 'video' | 'novel' | 'media']> = [
    ['整理本周复盘', -1, 'dev'],
    ['写一篇选题概要', 1, 'media'],
    ['练习 30 分钟口播', 2, 'video']
  ]
  tasks.forEach(([title, delta, domain]) => {
    s.tasks.push({
      id: `demo_t_${title.length}_${delta}`,
      title,
      note: '',
      dueDate: shiftYMD(t, delta),
      domain,
      priority: 'mid',
      done: false,
      doneAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO()
    })
  })
  s.goals.push({
    id: 'demo_g_1',
    title: '三个月内跑通第一支 AI 短片',
    domain: 'video',
    progress: 30,
    dueDate: shiftYMD(t, 60),
    note: '',
    keyResults: [
      { id: 'demo_kr_1', text: '写完 8 镜分镜表', done: true },
      { id: 'demo_kr_2', text: '产出 v3 成片', done: false },
      { id: 'demo_kr_3', text: '稳定 30 秒口播', done: false }
    ],
    updatedAt: nowISO()
  })
  s.habits.push(
    ...['喝水 8 杯', '阅读 20 分钟', '早睡'].map((name, i) => ({
      id: `demo_h_${i}`,
      name,
      freqType: 'daily' as const,
      weeklyTarget: 7,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      active: 1 as const,
      order: i,
      createdAt: nowISO(),
      updatedAt: nowISO()
    }))
  )
  s.focus.sessions.push({
    id: 'demo_f_1',
    taskId: s.tasks[0].id,
    domain: 'dev',
    plannedMin: 25,
    actualMin: 25,
    startedAt: nowISO(),
    endedAt: nowISO(),
    completed: true,
    interrupted: false
  })
  s.fitness.split.push({
    id: 'demo_split_1',
    name: '推（胸肩三头）',
    weekday: [0, 3],
    exerciseIds: []
  })
  s.fitness.exercises.push(
    { id: 'demo_ex_1', name: '卧推', part: '胸', unit: 'kg', isCustom: 0 },
    { id: 'demo_ex_2', name: '侧平举', part: '肩', unit: 'kg', isCustom: 0 }
  )
  s.fitness.sessions.push({
    id: 'demo_fs_1',
    date: shiftYMD(t, -2),
    splitId: 'demo_split_1',
    entries: [
      { exerciseId: 'demo_ex_1', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
      { exerciseId: 'demo_ex_2', sets: [{ weight: 8, reps: 12 }] }
    ],
    durationMin: 45,
    note: ''
  })
  s.media.items.push({
    id: 'demo_m_1',
    title: 'AI 视频工作流：从分镜到成片',
    topicId: null,
    platformIds: ['p_bili'],
    status: 'script',
    planDate: shiftYMD(t, 2),
    publishedAt: null,
    stats: { read: 0, like: 0, fav: 0, comment: 0 },
    note: '',
    updatedAt: nowISO()
  })
  s.media.items.push({
    id: 'demo_m_2',
    title: '一个人怎样搭起自己的工作台',
    topicId: null,
    platformIds: ['p_xhs'],
    status: 'published',
    planDate: shiftYMD(t, -3),
    publishedAt: shiftYMD(t, -3),
    stats: { read: 3200, like: 180, fav: 96, comment: 22 },
    note: '',
    updatedAt: nowISO()
  })
  s.media.topics.push({ id: 'demo_tp_1', title: '番茄钟为什么对创作者有效', sourceIdeaId: null, used: false })
  s.novel.works.push({
    id: 'demo_w_1',
    title: '长夜列车',
    genre: '悬疑',
    targetWords: 200000,
    status: 'active',
    createdAt: nowISO(),
    updatedAt: nowISO()
  })
  s.novel.chapters.push(
    { id: 'demo_c_1', workId: 'demo_w_1', no: 1, title: '第一章 站台', status: 'done', words: 3200, outline: '主角在末班车上醒来', updatedAt: nowISO() },
    { id: 'demo_c_2', workId: 'demo_w_1', no: 2, title: '第二章 空座', status: 'doing', words: 800, outline: '车厢里少了一个人', updatedAt: nowISO() }
  )
  s.novel.wordLog[t] = 800
  s.novel.foreshadows.push({ id: 'demo_fo_1', workId: 'demo_w_1', title: '母亲留下的半块玉佩', plantedChapter: 1, recoveredChapter: null, status: 'open', updatedAt: nowISO() })
  s.novel.settings.push({ id: 'demo_ns_1', workId: 'demo_w_1', type: 'character', name: '林岸', attrs: [{ k: '年龄', v: '29' }, { k: '职业', v: '夜班编辑' }], note: '' })
  s.output.projects.push({
    id: 'demo_p_1',
    domain: 'video',
    name: '60 秒 AI 短片',
    goal: '用分镜 + 生成工具做一支能发出去的短片',
    deliverable: '',
    acceptance: [
      { id: 'demo_a_1', text: '8 个镜头分镜定稿', done: true },
      { id: 'demo_a_2', text: '每个镜头至少 2 版可选', done: false },
      { id: 'demo_a_3', text: '成片 60 秒内，声音完整', done: false }
    ],
    version: '0.1',
    status: 'active',
    repo: '',
    env: 'local',
    updatedAt: nowISO()
  })
  s.output.projects.push({
    id: 'demo_p_2',
    domain: 'dev',
    name: '个人工作生活台',
    goal: 'Vue + TS 重构成可扩展版本',
    deliverable: 'dist + express',
    acceptance: [{ id: 'demo_a_4', text: '12 个页面功能对齐 PRD', done: false }],
    version: '0.2',
    status: 'active',
    repo: '',
    env: 'local',
    updatedAt: nowISO()
  })
  s.output.shots.push(
    { id: 'demo_s_1', projectId: 'demo_p_1', no: 1, desc: '雨夜站台，主角背影入画', promptId: null, model: '可灵', versions: [{ v: 1, status: '待生成', note: '', url: '' }], adoptedVersion: null, updatedAt: nowISO() },
    { id: 'demo_s_2', projectId: 'demo_p_1', no: 2, desc: '车窗倒影里多出一个人', promptId: null, model: '可灵', versions: [{ v: 1, status: '可用', note: '', url: '' }, { v: 2, status: '待生成', note: '', url: '' }], adoptedVersion: 1, updatedAt: nowISO() }
  )
  s.output.tickets.push(
    { id: 'demo_tk_1', projectId: 'demo_p_2', iterationId: null, title: '首页三日待办', type: 'feature', priority: 'high', status: 'done', blocked: false, blockedReason: '', updatedAt: nowISO() },
    { id: 'demo_tk_2', projectId: 'demo_p_2', iterationId: null, title: '专注页跨页悬浮条', type: 'feature', priority: 'mid', status: 'doing', blocked: false, blockedReason: '', updatedAt: nowISO() },
    { id: 'demo_tk_3', projectId: 'demo_p_2', iterationId: null, title: '导入合并去重', type: 'feature', priority: 'mid', status: 'backlog', blocked: false, blockedReason: '', updatedAt: nowISO() }
  )
  s.learning.tracks.push({ id: 'demo_tr_1', domain: 'video', name: 'AI 视频生成', goal: '能独立做完 60 秒短片', deadline: shiftYMD(t, 60), createdAt: nowISO() })
  s.learning.stages.push(
    { id: 'demo_ls_1', trackId: 'demo_tr_1', name: '基础', goal: '建立画面与叙事意识', outcome: '写出一份可拍的分镜', order: 1, createdAt: nowISO() },
    { id: 'demo_ls_2', trackId: 'demo_tr_1', name: '进阶', goal: '能稳定生成镜头', outcome: '完成一条 30 秒短片', order: 2, createdAt: nowISO() }
  )
  s.learning.topics.push(
    { id: 'demo_lt_1', trackId: 'demo_tr_1', stage: '基础', title: '文生图提示词', status: 'explain', minutes: 180, estMinutes: 120, note: '', prerequisite: '', artifact: '', lastStudiedAt: shiftYMD(t, -8), nextReviewAt: t, reviewCount: 0, updatedAt: nowISO() },
    { id: 'demo_lt_2', trackId: 'demo_tr_1', stage: '基础', title: '镜头语言', status: 'doing', minutes: 60, estMinutes: 90, note: '', prerequisite: '', artifact: '', lastStudiedAt: t, nextReviewAt: '', reviewCount: 0, updatedAt: nowISO() },
    { id: 'demo_lt_3', trackId: 'demo_tr_1', stage: '进阶', title: '剪辑节奏', status: 'todo', minutes: 0, estMinutes: 90, note: '', prerequisite: '', artifact: '', lastStudiedAt: '', nextReviewAt: '', reviewCount: 0, updatedAt: nowISO() }
  )
  s.ideas.push({
    id: 'demo_i_1',
    kind: 'text',
    text: '把通勤时间固定成听播客，不刷短视频',
    title: '',
    url: '',
    image: '',
    tags: ['习惯'],
    categories: ['日常', '学习'],
    subcategories: ['视频'],
    keywords: ['效率'],
    source: 'manual',
    capturedAt: nowISO(),
    bindings: [],
    convertedTo: null,
    convertedId: null
  })
  s.summaries.push({
    id: 'demo_sm_1',
    title: '深度工作：为什么注意力比时间更稀缺',
    sourceUrl: '',
    points: ['注意力是有限资源，切换成本被低估', '固定时段比固定任务更有效', '休息要主动安排，而不是刷手机'],
    judgement: '先把上午的两个小时锁死，比列十条计划有用。',
    createdAt: nowISO(),
    bindings: []
  })
  s.leisure.push({ id: 'demo_l_1', title: '漫长的季节', type: 'series', status: 'watching', progress: 6, total: 12, rating: 5, review: '', progressUnit: 'ep', startedAt: nowISO(), finishedAt: null, updatedAt: nowISO() })
  s.leisure.push({ id: 'demo_l_2', title: '沙丘 2', type: 'movie', status: 'done', progress: 1, total: 1, rating: 4, review: '视听极强，剧情略薄。', progressUnit: 'ep', startedAt: nowISO(), finishedAt: nowISO(), updatedAt: nowISO() })
  return s
}
