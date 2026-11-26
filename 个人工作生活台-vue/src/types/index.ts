/**
 * 文件：src/types/index.ts
 * 说明：全应用领域类型定义。覆盖任务、目标、专注、音乐、习惯、健身、自媒体、小说、产出、学习、灵感、收藏、阅读、娱乐与外观设置。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

/** 全量领域模型：单一真源，前端与 mock / express 共用同一份结构 */
export type ID = string
export type TaskDomain = 'dev' | 'video' | 'novel' | 'media'
export type Priority = 'high' | 'mid' | 'low'

export interface Task {
  id: ID
  title: string
  note: string
  dueDate: string
  domain: TaskDomain
  priority: Priority
  done: boolean
  doneAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KeyResult {
  id: ID
  text: string
  done: boolean
}

export interface Goal {
  id: ID
  title: string
  /** 分类，历史数据未写入时按开发处理 */
  domain?: TaskDomain
  progress: number
  dueDate: string
  note: string
  keyResults: KeyResult[]
  updatedAt: string
}

export type HabitFreq = 'daily' | 'weekly'

export interface Habit {
  id: ID
  name: string
  desc?: string
  freqType: HabitFreq
  weeklyTarget: number
  weekdays: number[]
  active: 0 | 1
  order: number
  createdAt: string
  updatedAt: string
}

export type FocusMode = 'pomodoro' | 'custom' | 'open'

export type MusicMode = 'sequence' | 'loop' | 'single' | 'shuffle'

export interface MusicTrack {
  id: ID
  name: string
  artists: string
  album: string
  cover: string
  duration: number
  fee: number
}

export interface MusicPlaylist {
  id: ID
  name: string
  cover: string
  trackCount: number
  playCount: number
  creator: string
  subscribed: boolean
}

export interface MusicSettings {
  mode: MusicMode
  style: string
  volume: number
  autoStartWithFocus: boolean
  showGlobalBar: boolean
}

export interface MusicState {
  settings: MusicSettings
  queue: MusicTrack[]
  currentId: ID | null
  recent: MusicTrack[]
  liked: MusicTrack[]
  playlists: MusicPlaylist[]
  updatedAt: string
}

export interface FocusSettings {
  mode: FocusMode
  work: number
  customWork: number
  short: number
  long: number
  roundsBeforeLong: number
  autoStartBreak: boolean
  autoStartNextWork: boolean
  soundOn: boolean
}

export type ThemeMode = 'light' | 'dark' | 'auto'
export type BackgroundKind = 'paper' | 'color' | 'image'

export interface BackgroundSettings {
  kind: BackgroundKind
  color: string
  lightColor: string
  darkColor: string
  image: string
  imageSource: '' | 'upload' | 'url'
  imageHistory: string[]
  dim: number
  blur: number
}

export interface AppearanceSettings {
  background: BackgroundSettings
  reduceMotion: boolean
}

export interface GeneralSettings {
  nickname: string
  backupRemindDays: 0 | 7 | 14 | 30
}

export interface DataPrefs {
  autoSnapshot: boolean
}

export type NoiseKey = 'white' | 'pink' | 'brown' | 'rain' | 'sea' | 'forest' | 'cafe'
export type FocusPhase = 'work' | 'short' | 'long'

export interface NoiseSettings {
  preset: NoiseKey
  volume: number
  autoStartWithFocus: boolean
  timerMin: number
}

export interface FocusSession {
  id: ID
  taskId: ID | null
  domain: string
  plannedMin: number
  actualMin: number
  startedAt: string
  endedAt: string
  completed: boolean
  interrupted: boolean
}

export interface Exercise {
  id: ID
  name: string
  part: string
  unit: string
  isCustom: 0 | 1
}

export interface SetEntry {
  weight: number
  reps: number
}

export interface SessionEntry {
  exerciseId: ID
  sets: SetEntry[]
}

export interface Split {
  id: ID
  name: string
  weekday: number[]
  exerciseIds: ID[]
}

export interface FitnessSession {
  id: ID
  date: string
  splitId: ID | null
  entries: SessionEntry[]
  durationMin: number
  note: string
}

export interface Metric {
  id: ID
  date: string
  weight: number | null
  waist: number | null
  chest: number | null
  arm: number | null
}

export interface Platform {
  id: ID
  name: string
  color: string
}

export interface MediaTopic {
  id: ID
  title: string
  /** 大分类，如干货 / Vlog / 测评 */
  category?: string
  /** 选题描述：讲什么、为什么做 */
  description?: string
  sourceIdeaId: ID | null
  used: boolean
}

export interface MediaStats {
  read: number
  like: number
  fav: number
  comment: number
}

export type MediaStatus = 'idea' | 'script' | 'produce' | 'published'

export interface MediaItem {
  id: ID
  title: string
  /** 选题 / 切入角度 */
  topic?: string
  /** 内容定位 */
  positioning?: string
  /** 风格 */
  style?: string
  /** 亮点 */
  highlights?: string
  /** 目标 */
  goal?: string
  topicId: ID | null
  platformIds: ID[]
  status: MediaStatus
  planDate: string
  publishedAt: string | null
  stats: MediaStats
  note: string
  updatedAt: string
}

export interface Chapter {
  id: ID
  workId: ID
  no: number
  title: string
  status: 'outline' | 'doing' | 'done'
  words: number
  outline: string
  /** 主要情节 */
  plot?: string
  /** 人物梳理 */
  characters?: string
  /** 亮点 */
  highlights?: string
  /** 伏笔 */
  foreshadow?: string
  updatedAt: string
}

export interface NovelSettingAttr {
  k: string
  v: string
}

export interface NovelSetting {
  id: ID
  workId: ID
  type: 'character' | 'place' | 'faction' | 'item'
  name: string
  attrs: NovelSettingAttr[]
  note: string
}

export interface Foreshadow {
  id: ID
  workId: ID
  title: string
  plantedChapter: number | null
  recoveredChapter: number | null
  status: 'open' | 'recovered'
  updatedAt: string
}

export interface NovelOutlineFile {
  id: ID
  name: string
  size: number
  type: string
  url: string
  uploadedAt: string
}

export type StoryNodeType = 'setup' | 'turn' | 'climax' | 'ending'

export interface StoryNode {
  id: ID
  workId: ID
  chapter: number
  title: string
  type: StoryNodeType
  /** 故事张力 0-100，折线高度 */
  tension: number
  note: string
  updatedAt: string
}

export interface Work {
  id: ID
  title: string
  genre: string
  targetWords: number
  status: 'active' | 'paused' | 'finished'
  /** 总纲正文 */
  outline?: string
  /** 总纲附件 */
  outlineFiles?: NovelOutlineFile[]
  createdAt: string
  updatedAt: string
}

export type OutputDomain = 'video' | 'dev'

export interface Acceptance {
  id: ID
  text: string
  done: boolean
}

export interface Project {
  id: ID
  domain: OutputDomain
  name: string
  goal: string
  deliverable: string
  acceptance: Acceptance[]
  version: string
  status: 'active' | 'paused' | 'done'
  repo: string
  env: string
  updatedAt: string
}

export interface ShotVersion {
  v: number
  status: string
  note: string
  url: string
}

export interface Shot {
  id: ID
  projectId: ID
  no: number
  desc: string
  promptId: ID | null
  model: string
  versions: ShotVersion[]
  adoptedVersion: number | null
  updatedAt: string
}

export interface Prompt {
  id: ID
  title: string
  text: string
  tags: string[]
  rating: number
  usedCount: number
}

export interface Iteration {
  id: ID
  projectId: ID
  name: string
  startDate: string
  endDate: string
  goal: string
  status: 'active' | 'done'
}

export type TicketType = 'feature' | 'bug' | 'chore'
export type TicketStatus = 'backlog' | 'doing' | 'verify' | 'done'

export interface Ticket {
  id: ID
  projectId: ID
  iterationId: ID | null
  title: string
  type: TicketType
  priority: Priority
  status: TicketStatus
  blocked: boolean
  blockedReason: string
  updatedAt: string
}

export interface Track {
  id: ID
  domain: OutputDomain
  name: string
  goal: string
  deadline: string
  templateId?: string
  createdAt?: string
}

export type LearningStatus = 'todo' | 'doing' | 'explain' | 'build'

export interface LearningStage {
  id: ID
  trackId: ID
  name: string
  goal: string
  outcome: string
  order: number
  createdAt: string
}

export interface LearningTopic {
  id: ID
  trackId: ID
  stage: string
  title: string
  status: LearningStatus
  minutes: number
  estMinutes: number
  note: string
  prerequisite: string
  artifact: string
  lastStudiedAt: string
  nextReviewAt: string
  reviewCount: number
  updatedAt: string
}

export interface StudyLog {
  id: ID
  trackId: ID
  topicId: ID
  date: string
  minutes: number
  learned: string
  blocker: string
  nextAction: string
  artifact: string
  createdAt: string
}

export interface Resource {
  id: ID
  trackId: ID
  topicId?: ID
  title: string
  type: 'course' | 'book' | 'doc' | 'video'
  url: string
  estMinutes?: number
  consumed: boolean
}

export type IdeaKind = 'text' | 'link' | 'image'
export type BindModule = 'media' | 'novel' | 'output'

export interface ContentBinding {
  module: BindModule
  id: ID
  /** 绑定时的显示名，目标改名后以实时名称为准 */
  title: string
  /** 自媒体 / 小说 / 视频 / 开发 */
  group: string
}

export interface Idea {
  id: ID
  kind: IdeaKind
  /** 文字正文；链接为说明；图片为配文 */
  text: string
  /** 链接或图片的标题 */
  title: string
  /** 链接地址 */
  url: string
  /** 图片地址或压缩后的 dataURL */
  image: string
  /** 旧版通用标签，保留兼容 */
  tags: string[]
  categories: string[]
  subcategories: string[]
  keywords: string[]
  source: 'quick' | 'manual'
  capturedAt: string
  /** 绑定到已有作品，一条灵感可绑多个 */
  bindings: ContentBinding[]
  /** 旧版转换字段，仅用于兼容旧数据 */
  convertedTo?: 'task' | 'topic' | 'learning' | null
  convertedId?: ID | null
}

export type ReadingStatus = 'want' | 'reading' | 'done' | 'paused' | 'dropped'

export interface Book {
  id: ID
  title: string
  author: string
  category: string
  totalPages: number
  currentPage: number
  status: ReadingStatus
  rating: number
  review: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReadingLog {
  id: ID
  bookId: ID
  date: string
  minutes: number
  pages: number
  note: string
  createdAt: string
}

export interface ReadingState {
  books: Book[]
  logs: ReadingLog[]
}

export interface Summary {
  id: ID
  title: string
  sourceUrl: string
  points: string[]
  judgement: string
  createdAt: string
  bindings: ContentBinding[]
}

export type FavoriteKind = 'text' | 'link' | 'image' | 'file'

export interface FavoriteFolder {
  id: ID
  name: string
  createdAt: string
  updatedAt: string
}

export interface FavoriteItem {
  id: ID
  kind: FavoriteKind
  folderId: ID | null
  title: string
  summary: string
  note: string
  /** 文字收藏的正文 */
  text: string
  /** 链接收藏的地址 */
  url: string
  /** 图片收藏的 dataURL 或图片地址 */
  image: string
  fileName: string
  fileType: string
  fileSize: number
  /** 文件收藏的 dataURL */
  fileData: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface FavoritesState {
  folders: FavoriteFolder[]
  items: FavoriteItem[]
}

export type LeisureStatus = 'want' | 'watching' | 'done' | 'dropped'

export interface Leisure {
  id: ID
  title: string
  type: 'movie' | 'series' | 'anime' | 'book' | 'game' | 'novel' | 'shortdrama' | 'comicdrama'
  status: LeisureStatus
  progress: number
  total: number
  rating: number
  review: string
  progressUnit: 'ep' | 'chapter' | 'hour'
  minutes?: number
  startedAt: string
  finishedAt: string | null
  updatedAt: string
}

export interface Modules {
  home: 0 | 1
  tasks: 0 | 1
  focus: 0 | 1
  music: 0 | 1
  habits: 0 | 1
  fitness: 0 | 1
  media: 0 | 1
  novel: 0 | 1
  output: 0 | 1
  learning: 0 | 1
  dev: 0 | 1
  ideas: 0 | 1
  favorites: 0 | 1
  reading: 0 | 1
  leisure: 0 | 1
  settings: 0 | 1
  data: 0 | 1
}

export interface AppMeta {
  createdAt: string
  lastExportAt: string | null
}

export interface FitnessState {
  split: Split[]
  exercises: Exercise[]
  sessions: FitnessSession[]
  metrics: Metric[]
}

export interface MediaState {
  platforms: Platform[]
  topics: MediaTopic[]
  items: MediaItem[]
}

export interface OutputState {
  projects: Project[]
  shots: Shot[]
  prompts: Prompt[]
  iterations: Iteration[]
  tickets: Ticket[]
}

export interface LearningState {
  tracks: Track[]
  stages: LearningStage[]
  topics: LearningTopic[]
  logs: StudyLog[]
  resources: Resource[]
}

export interface NovelState {
  works: Work[]
  chapters: Chapter[]
  settings: NovelSetting[]
  foreshadows: Foreshadow[]
  storyNodes: StoryNode[]
  wordLog: Record<string, number>
}

export interface FocusState {
  settings: FocusSettings
  noise: NoiseSettings
  sessions: FocusSession[]
}

export interface AppState {
  version: number
  app: string
  deviceName: string
  theme: ThemeMode
  general: GeneralSettings
  appearance: AppearanceSettings
  dataPrefs: DataPrefs
  modules: Modules
  meta: AppMeta
  tasks: Task[]
  goals: Goal[]
  focus: FocusState
  music: MusicState
  habits: Habit[]
  checkins: Record<ID, string[]>
  fitness: FitnessState
  media: MediaState
  output: OutputState
  learning: LearningState
  novel: NovelState
  ideas: Idea[]
  summaries: Summary[]
  favorites: FavoritesState
  reading: ReadingState
  leisure: Leisure[]
}

export interface SnapshotMeta {
  key: string
  label: string
  at: string
  size: number
}

export interface ImportReport {
  added: number
  updated: number
  skipped: number
}
