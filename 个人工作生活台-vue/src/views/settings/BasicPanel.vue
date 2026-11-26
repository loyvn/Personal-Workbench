<!--
  文件：src/views/settings/BasicPanel.vue
  说明：基础设置面板。管理称呼、设备名、主题、纯色/图片背景、背景历史、减少动画、专注参数、音乐服务与模块开关，改动即时保存。
  结构：个人与设备 → 主题 → 背景（纸色/纯色/图片/历史）→ 减少动画 → 专注参数 → 音乐服务 → 模块开关
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDeskStore } from '@/stores/desk'
import { useUiStore } from '@/stores/ui'
import { PAGES } from '@/constants/nav'
import { chime } from '@/services/noise'
import { initMusic, setVolume as setMusicVolume } from '@/services/music'
import { musicApi, MusicApiError } from '@/api/music'
import type { MusicStatus, MusicStyle } from '@/api/music'
import { compressImage, dataUrlBytes, humanBytes, isHttpImageUrl, preloadImage } from '@/utils/image'
import { useMedia } from '@/composables/useMedia'
import type { AppState, BackgroundKind, Modules, ThemeMode } from '@/types'

const store = useDeskStore()
const ui = useUiStore()
const s = computed(() => store.data)
const bg = computed(() => s.value.appearance.background)

const fileInput = ref<HTMLInputElement | null>(null)
const imageBusy = ref(false)
const urlInput = ref(bg.value.imageSource === 'url' ? bg.value.image : '')

const musicBase = ref('http://127.0.0.1:3200')
const musicBusy = ref(false)
const musicStatus = ref<MusicStatus | null>(null)
const musicError = ref('')
const musicStyles = ref<MusicStyle[]>([])

const systemDark = useMedia('(prefers-color-scheme: dark)')
const effectiveTheme = computed<'light' | 'dark'>(() => {
  if (s.value.theme === 'auto') return systemDark.value ? 'dark' : 'light'
  return s.value.theme === 'dark' ? 'dark' : 'light'
})

const LIGHT_COLOR_PRESETS = ['#efede7', '#e2ebe6', '#e0e9f2', '#f0e5d4', '#f3dfd9', '#e9e4ec', '#e7e3da']
const DARK_COLOR_PRESETS = ['#1a1c1a', '#22302b', '#1f2c38', '#30271d', '#332421', '#2b2531', '#26231e']
const colorPresets = computed(() => (effectiveTheme.value === 'dark' ? DARK_COLOR_PRESETS : LIGHT_COLOR_PRESETS))

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'auto', label: '跟随系统' }
]

const bgOptions: Array<{ value: BackgroundKind; label: string }> = [
  { value: 'paper', label: '纸色' },
  { value: 'color', label: '纯色' },
  { value: 'image', label: '图片' }
]

const musicStyleLabel = computed(() => musicStyles.value.find((x) => x.cat === s.value.music.settings.style)?.label || s.value.music.settings.style)
const musicStatusLabel = computed(() => {
  if (!musicStatus.value) return '未检测'
  if (!musicStatus.value.connected) return '未连接'
  return musicStatus.value.loggedIn ? `已连接 · ${musicStatus.value.account?.nickname || '已登录'}` : '已连接 · 未登录'
})

const focusSummary = computed(() => {
  const f = s.value.focus.settings
  return `经典 ${f.work} / ${f.short} / ${f.long} 分钟 · 自定义 ${f.customWork} 分钟 · 每 ${f.roundsBeforeLong} 轮长休`
})

const imageSizeLabel = computed(() => {
  if (!bg.value.image || bg.value.imageSource !== 'upload') return ''
  return humanBytes(dataUrlBytes(bg.value.image))
})

const previewStyle = computed(() => {
  const b = bg.value
  if (b.kind === 'color') return { backgroundColor: b.color }
  if (b.kind === 'image' && b.image) {
    const src = b.image.replace(/"/g, '%22').replace(/\s/g, '')
    return { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { backgroundColor: 'var(--paper)' }
})

const previewTone = computed(() => (bg.value.kind === 'image' && bg.value.image ? { opacity: bg.value.dim / 100 } : { display: 'none' }))

const colorContrastHint = computed(() =>
  effectiveTheme.value === 'dark'
    ? '深色主题：页面使用所选深色，卡片沿用同色系的半透明表面'
    : '浅色主题：页面使用所选浅色，卡片沿用同色系的半透明表面'
)

function setTheme(theme: ThemeMode): void {
  store.setTheme(theme)
}

function setKind(kind: BackgroundKind): void {
  store.commit((st) => {
    st.appearance.background.kind = kind
  })
}

function pickColor(hex: string): void {
  store.commit((st) => {
    st.appearance.background.color = hex
    st.appearance.background.kind = 'color'
    if (effectiveTheme.value === 'dark') st.appearance.background.darkColor = hex
    else st.appearance.background.lightColor = hex
  })
}

function onColorInput(e: Event): void {
  pickColor((e.target as HTMLInputElement).value)
}

function onDim(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  store.commit((st) => {
    st.appearance.background.dim = Math.min(100, Math.max(0, v))
  })
}

function onBlur(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  store.commit((st) => {
    st.appearance.background.blur = Math.min(20, Math.max(0, v))
  })
}

function toggleReduceMotion(): void {
  store.commit((st) => {
    st.appearance.reduceMotion = !st.appearance.reduceMotion
  })
}

function pickFile(): void {
  fileInput.value?.click()
}

/**
 * 把新背景图写入 imageHistory，去重并保留最近 6 张。
 */
function rememberImage(st: AppState, src: string): void {
  const bg = st.appearance.background
  bg.imageHistory = [src, ...bg.imageHistory.filter((x) => x !== src)].slice(0, 6)
}

/**
 * 上传背景图：校验格式/体积、压缩、预加载后写入 appearance。
 */
async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  imageBusy.value = true
  try {
    const dataUrl = await compressImage(file)
    store.commit((st) => {
      st.appearance.background.image = dataUrl
      st.appearance.background.imageSource = 'upload'
      st.appearance.background.kind = 'image'
      rememberImage(st, dataUrl)
    })
    ui.toast(`背景已更新（${humanBytes(dataUrlBytes(dataUrl))}）`)
  } catch (err) {
    ui.toast((err as Error).message, 'err')
  } finally {
    imageBusy.value = false
  }
}

/**
 * 应用网络图片：只接受 http(s)，先预加载成功再落库。
 */
async function applyUrl(): Promise<void> {
  const v = urlInput.value.trim()
  if (!isHttpImageUrl(v)) {
    ui.toast('填一个 http(s) 开头的图片地址', 'err')
    return
  }
  imageBusy.value = true
  try {
    await preloadImage(v)
    store.commit((st) => {
      st.appearance.background.image = v
      st.appearance.background.imageSource = 'url'
      st.appearance.background.kind = 'image'
      rememberImage(st, v)
    })
    ui.toast('背景已更新')
  } catch (err) {
    ui.toast((err as Error).message, 'err')
  } finally {
    imageBusy.value = false
  }
}

async function useHistoryImage(src: string): Promise<void> {
  const source = src.startsWith('data:') ? 'upload' : 'url'
  imageBusy.value = true
  try {
    await preloadImage(src)
    store.commit((st) => {
      st.appearance.background.image = src
      st.appearance.background.imageSource = source
      st.appearance.background.kind = 'image'
      rememberImage(st, src)
    })
    urlInput.value = source === 'url' ? src : ''
    ui.toast('已切换历史背景')
  } catch (err) {
    ui.toast(`这张历史图片已失效：${(err as Error).message}`, 'err')
  } finally {
    imageBusy.value = false
  }
}

function thumbStyle(src: string): Record<string, string> {
  return { backgroundImage: `url("${src.replace(/"/g, '%22')}")` }
}

function clearImage(): void {
  store.commit((st) => {
    st.appearance.background.image = ''
    st.appearance.background.imageSource = ''
    st.appearance.background.kind = 'paper'
  })
  urlInput.value = ''
  ui.toast('已恢复纸色背景，历史图片仍保留')
}

function saveNickname(e: Event): void {
  const el = e.target as HTMLInputElement
  const name = el.value.trim().slice(0, 20)
  store.commit((st) => {
    st.general.nickname = name
  })
  el.value = name
  ui.toast(name ? '称呼已保存' : '已清空称呼')
}

function blurOnEnter(e: Event): void {
  (e.target as HTMLInputElement).blur()
}

function editDevice(): void {
  ui.openForm({
    title: '设备名',
    fields: [{ key: 'name', label: '这台设备叫什么', placeholder: '例如：书桌前的台式机' }],
    values: { name: s.value.deviceName },
    onSubmit(v) {
      const name = String(v.name || '').trim()
      if (!name) {
        ui.toast('名称不能为空', 'err')
        return false
      }
      store.commit((st) => {
        st.deviceName = name
      })
      ui.toast('已保存')
    }
  })
}

/**
 * 编辑专注参数；数值在归一化与表单两层夹取，避免非法时长。
 */
function editFocus(): void {
  const cur = s.value.focus.settings
  ui.openForm({
    title: '专注参数',
    fields: [
      { key: 'work', label: '经典档位专注（分钟）', type: 'number', min: 1, max: 120 },
      { key: 'customWork', label: '自定义档位时长（分钟）', type: 'number', min: 5, max: 180 },
      { key: 'short', label: '短休（分钟）', type: 'number', min: 1, max: 60 },
      { key: 'long', label: '长休（分钟）', type: 'number', min: 1, max: 90 },
      { key: 'rounds', label: '几个番茄后长休', type: 'number', min: 2, max: 8 }
    ],
    values: { work: cur.work, customWork: cur.customWork, short: cur.short, long: cur.long, rounds: cur.roundsBeforeLong },
    onSubmit(v) {
      const clamp = (n: number, min: number, max: number, fallback: number) =>
        Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : fallback))
      store.commit((st) => {
        st.focus.settings.work = clamp(Number(v.work), 1, 120, 25)
        st.focus.settings.customWork = clamp(Number(v.customWork), 5, 180, 45)
        st.focus.settings.short = clamp(Number(v.short), 1, 60, 5)
        st.focus.settings.long = clamp(Number(v.long), 1, 90, 15)
        st.focus.settings.roundsBeforeLong = clamp(Number(v.rounds), 2, 8, 4)
      })
      ui.toast('已保存')
    }
  })
}

function toggleField(kind: 'autoStartBreak' | 'autoStartNextWork' | 'soundOn'): void {
  store.commit((st) => {
    st.focus.settings[kind] = !st.focus.settings[kind]
  })
}

function testSound(): void {
  chime('work')
}

function errorMessage(err: unknown): string {
  return err instanceof MusicApiError ? err.message : (err as Error)?.message || '操作失败'
}

async function loadMusicSettings(): Promise<void> {
  if (!musicStyles.value.length) {
    try {
      musicStyles.value = await musicApi.styles()
    } catch {
      musicStyles.value = [
        { cat: '流行', label: '流行' },
        { cat: '古风', label: '古风' },
        { cat: '摇滚', label: '摇滚' },
        { cat: '轻音乐', label: '纯音乐' }
      ]
    }
  }
  try {
    const cfg = await musicApi.getConfig()
    musicBase.value = cfg.baseUrl
    musicStatus.value = await musicApi.status()
    if (!musicStatus.value.connected) musicError.value = musicStatus.value.error || '音乐服务未连接'
  } catch (err) {
    musicError.value = errorMessage(err)
  }
}

/**
 * 保存音乐服务地址并测试连接，失败时不覆盖原可用配置。
 */
async function saveMusicService(): Promise<void> {
  musicBusy.value = true
  musicError.value = ''
  try {
    musicStatus.value = await musicApi.setConfig(musicBase.value)
    if (musicStatus.value.connected) ui.toast('音乐服务已连接')
    else musicError.value = musicStatus.value.error || '仍未连接到音乐服务'
  } catch (err) {
    musicError.value = errorMessage(err)
    ui.toast(musicError.value, 'err')
  } finally {
    musicBusy.value = false
  }
}

function chooseMusicStyle(cat: string): void {
  store.commit((st) => {
    st.music.settings.style = cat
  })
  ui.toast(`默认风格：${musicStyles.value.find((x) => x.cat === cat)?.label || cat}`)
}

function changeMusicVolume(e: Event): void {
  setMusicVolume(Number((e.target as HTMLInputElement).value) || 0)
}

function toggleMusicAuto(e: Event): void {
  store.commit((st) => {
    st.music.settings.autoStartWithFocus = (e.target as HTMLInputElement).checked
  })
}

function toggleGlobalMusicBar(e: Event): void {
  const on = (e.target as HTMLInputElement).checked
  store.commit((st) => {
    st.music.settings.showGlobalBar = on
  })
  ui.toast(on ? '已显示底部音乐栏' : '已关闭底部音乐栏')
}

onMounted(() => {
  initMusic()
  void loadMusicSettings()
})

/**
 * 切换模块开关；隐藏只影响导航与路由，不清除模块数据。
 */
function toggleModule(key: keyof Modules): void {
  if (key === 'home' || key === 'settings' || key === 'data') {
    ui.toast('首页、基础设置与数据不能关闭', 'err')
    return
  }
  store.commit((st) => {
    st.modules[key] = st.modules[key] ? 0 : 1
  })
}

const moduleEntries = computed(() => PAGES.filter((p) => p.key !== 'home' && p.key !== 'settings' && p.key !== 'data'))
</script>

<template>
  <section class="sect">
    <div class="sect-h"><h2>个人与首页</h2><span class="cnt">称呼会出现在首页问候里</span></div>
    <div class="card">
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">称呼</div>
            <div class="meta">留空时只显示「中午好」</div>
          </div>
          <input
            :value="s.general.nickname"
            maxlength="20"
            placeholder="例如：阿岸"
            style="width: 160px"
            @change="saveNickname"
            @keydown.enter.prevent="blurOnEnter"
          />
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">设备名</div>
            <div class="meta">用来区分备份来自哪台机器</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px">
            <span style="font-size: 12.5px">{{ s.deviceName }}</span>
            <button class="mini" @click="editDevice">改名</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>外观</h2><span class="cnt">主题、背景与动效</span></div>
    <div class="card">
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">主题</div>
            <div class="meta">跟随系统时按电脑的深浅色自动切换；纯色背景各记一套颜色，浅色主题用浅色系，深色主题用深色系</div>
          </div>
          <div class="seg">
            <button v-for="t in themeOptions" :key="t.value" :class="{ on: s.theme === t.value }" @click="setTheme(t.value)">
              {{ t.label }}
            </button>
          </div>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">背景</div>
            <div class="meta">纸色最省资源；纯色与图片会铺满整页</div>
          </div>
          <div class="seg">
            <button v-for="b in bgOptions" :key="b.value" :class="{ on: bg.kind === b.value }" @click="setKind(b.value)">
              {{ b.label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="bg.kind === 'color'" class="bg-block">
        <div class="swatches">
          <button
            v-for="c in colorPresets"
            :key="c"
            class="swatch"
            :class="{ on: bg.color.toLowerCase() === c.toLowerCase() }"
            :style="{ background: c }"
            :title="c"
            @click="pickColor(c)"
          />
        </div>
        <label class="color-pick">
          <span>自定义</span>
          <input type="color" :value="bg.color" @input="onColorInput" />
        </label>
        <div class="bg-auto-hint">{{ colorContrastHint }}</div>
      </div>

      <div v-if="bg.kind === 'image'" class="bg-block">
        <div class="bg-preview" :style="previewStyle">
          <div class="bg-preview-tone" :style="previewTone" />
          <span v-if="!bg.image" class="bg-preview-hint">还没有图片</span>
        </div>
        <div class="bg-actions">
          <button class="btn btn-sm" :disabled="imageBusy" @click="pickFile">{{ imageBusy ? '处理中…' : '上传图片' }}</button>
          <button v-if="bg.image" class="mini" @click="clearImage">清除背景图</button>
          <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFile" />
        </div>
        <div class="bg-url">
          <input v-model="urlInput" placeholder="或粘贴 https:// 图片地址" />
          <button class="btn btn-sm" :disabled="imageBusy" @click="applyUrl">应用</button>
        </div>
        <div class="bg-sliders">
          <label>
            <span>遮罩</span>
            <input type="range" min="0" max="100" :value="bg.dim" @input="onDim" />
            <b>{{ bg.dim }}%</b>
          </label>
          <label>
            <span>模糊</span>
            <input type="range" min="0" max="20" :value="bg.blur" @input="onBlur" />
            <b>{{ bg.blur }}px</b>
          </label>
        </div>
        <div v-if="bg.imageHistory.length" class="bg-history">
          <div class="bg-history-h">
            <span>历史背景</span>
            <small>点选切换，最多保留 6 张</small>
          </div>
          <div class="bg-history-grid">
            <button
              v-for="(src, i) in bg.imageHistory"
              :key="`${i}-${src.slice(0, 18)}`"
              type="button"
              class="bg-history-item"
              :class="{ on: bg.image === src }"
              :style="thumbStyle(src)"
              :title="`历史背景 ${i + 1}`"
              :disabled="imageBusy"
              @click="useHistoryImage(src)"
            />
          </div>
        </div>
        <div class="bg-note">
          上传会压到长边 1440、体积 500 KB 内再存进数据{{ imageSizeLabel ? `（当前 ${imageSizeLabel}）` : '' }}；图片会跟着导出与快照走。
        </div>
      </div>

      <div class="rule" />
      <div class="row" style="padding-left: 0; padding-right: 0; border-bottom: 0">
        <div class="body">
          <div class="title">减少动画</div>
          <div class="meta">关掉页面切换与按钮过渡，低配机器更顺</div>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="s.appearance.reduceMotion" @change="toggleReduceMotion" />
          <i />
        </label>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>专注与提醒</h2><span class="cnt">计时档位与结束提示</span></div>
    <div class="card">
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">专注参数</div>
            <div class="meta">{{ focusSummary }}</div>
          </div>
          <button class="btn btn-sm" @click="editFocus">修改</button>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">自动开始休息</div>
            <div class="meta">番茄结束后直接进入休息计时</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.focus.settings.autoStartBreak" @change="toggleField('autoStartBreak')" />
            <i />
          </label>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">自动开始下一轮</div>
            <div class="meta">休息结束后直接进入下一个番茄</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.focus.settings.autoStartNextWork" @change="toggleField('autoStartNextWork')" />
            <i />
          </label>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0; border-bottom: 0">
          <div class="body">
            <div class="title">结束提示音</div>
            <div class="meta">阶段结束时响一声，不需要系统通知权限</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px">
            <button class="mini" @click="testSound">试听</button>
            <label class="switch">
              <input type="checkbox" :checked="s.focus.settings.soundOn" @change="toggleField('soundOn')" />
              <i />
            </label>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>音乐</h2><span class="cnt">QQ 音乐本地端口与专注联动</span></div>
    <div class="card">
      <div class="music-head">
        <div class="body">
          <div class="title">音乐服务</div>
          <div class="meta">本机 QQ 音乐 API，默认端口 3200；只允许本机地址</div>
        </div>
        <span class="music-status" :class="{ ok: musicStatus?.connected, bad: musicStatus && !musicStatus.connected }">
          {{ musicStatusLabel }}
        </span>
      </div>
      <div class="music-url">
        <input v-model="musicBase" placeholder="http://127.0.0.1:3200" />
        <button class="btn btn-sm" :disabled="musicBusy" @click="saveMusicService">{{ musicBusy ? '检测中…' : '测试连接' }}</button>
      </div>
      <div v-if="musicError" class="music-error">{{ musicError }}</div>
      <div class="music-help">
        启动方式：在 qq-api 目录执行 <code>node node_modules\@yakult-green-tea\qq-music-api\dist\src\app.js</code>。登录凭证只存在本机服务端，不进入导出和快照。
        <a href="#/music">打开音乐页</a>
      </div>
      <div class="rule" />
      <div class="rows">
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">开始专注时自动播放</div>
            <div class="meta">需要有当前队列；浏览器拦截时会在专注页提示点继续</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.music.settings.autoStartWithFocus" @change="toggleMusicAuto" />
            <i />
          </label>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">显示底部音乐栏</div>
            <div class="meta">对全站生效，包含封面、进度、收藏、音量、播放模式和播放队列；关闭后所有页面都不显示</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.music.settings.showGlobalBar" @change="toggleGlobalMusicBar" />
            <i />
          </label>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">默认风格</div>
            <div class="meta">当前：{{ musicStyleLabel }}。音乐页打开时优先展示这组歌单</div>
          </div>
          <div class="chips">
            <button
              v-for="style in musicStyles"
              :key="style.cat"
              class="chip"
              :class="{ on: s.music.settings.style === style.cat }"
              @click="chooseMusicStyle(style.cat)"
            >
              {{ style.label }}
            </button>
          </div>
        </div>
        <div class="row" style="padding-left: 0; padding-right: 0; border-bottom: 0">
          <div class="body">
            <div class="title">默认音量</div>
            <div class="meta">同步到全局播放器，不直接影响提示音</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; min-width: 180px">
            <input type="range" min="0" max="100" :value="s.music.settings.volume" style="flex: 1; accent-color: var(--green)" @input="changeMusicVolume" />
            <span class="mono" style="width: 28px; text-align: right">{{ s.music.settings.volume }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="sect">
    <div class="sect-h"><h2>模块开关</h2><span class="cnt">关掉的模块不出现在导航</span></div>
    <div class="card">
      <div class="rows">
        <div v-for="p in moduleEntries" :key="p.key" class="row" style="padding-left: 0; padding-right: 0">
          <div class="body">
            <div class="title">{{ p.title }}</div>
            <div class="meta">{{ p.subtitle }}</div>
          </div>
          <label class="switch">
            <input type="checkbox" :checked="s.modules[p.key] === 1" @change="toggleModule(p.key)" />
            <i />
          </label>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bg-block { padding: 12px 0 4px; border-top: 1px solid var(--line-soft); }
.swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.swatch {
  width: 30px; height: 30px; border-radius: var(--r-xs); border: 1px solid var(--line);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}
.swatch.on { outline: 2px solid var(--green); outline-offset: 1px; }
.color-pick { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 12px; color: var(--muted); }
.color-pick input { width: 44px; height: 32px; padding: 0; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--surface); }
.bg-auto-hint { margin-top: 8px; font-size: 11.5px; color: var(--muted); }
.bg-preview {
  position: relative; margin-top: 12px; height: 152px; border: 1px solid var(--line); border-radius: var(--r-xs);
  overflow: hidden; display: grid; place-items: center;
}
.bg-preview-tone { position: absolute; inset: 0; background: var(--surface-soft); }
.bg-preview-hint { position: relative; z-index: 1; font-size: 12px; color: var(--muted); }
.bg-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.bg-url { display: flex; gap: 8px; margin-top: 10px; }
.bg-url input { flex: 1; min-width: 0; }
.bg-sliders { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.bg-sliders label { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--muted); }
.bg-sliders label span { width: 34px; flex: none; }
.bg-sliders label input { flex: 1; accent-color: var(--green); height: 28px; }
.bg-sliders label b { width: 44px; text-align: right; font-family: var(--mono); font-weight: 400; color: var(--ink); }
.bg-history { margin-top: 14px; }
.bg-history-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.bg-history-h span { font-size: 12px; color: var(--ink); }
.bg-history-h small { font-size: 11px; color: var(--muted); }
.bg-history-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; margin-top: 8px; }
.bg-history-item {
  aspect-ratio: 16 / 10; min-width: 0; border: 1px solid var(--line); border-radius: var(--r-xs);
  background-color: var(--surface-soft); background-size: cover; background-position: center; cursor: pointer;
}
.bg-history-item.on { outline: 2px solid var(--green); outline-offset: 1px; }
.bg-history-item:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
.bg-note { margin-top: 10px; font-size: 11.5px; color: var(--muted); line-height: 1.7; }
.mono { font-family: var(--mono); font-size: 12px; }
.music-head { display: flex; align-items: flex-start; gap: 12px; }
.music-head .body { flex: 1; min-width: 0; }
.music-status { flex: none; font-size: 10.5px; color: var(--muted); border: 1px solid var(--line); border-radius: var(--r-xs); padding: 2px 7px; }
.music-status.ok { color: var(--green); border-color: var(--green); background: var(--green-soft); }
.music-status.bad { color: var(--amber); border-color: var(--amber); background: var(--amber-soft); }
.music-url { display: flex; gap: 7px; margin-top: 10px; }
.music-url input { flex: 1; min-width: 0; }
.music-error { margin-top: 7px; color: var(--red); font-size: 11.5px; line-height: 1.6; }
.music-help { margin-top: 8px; color: var(--muted); font-size: 11px; line-height: 1.7; }
.music-help code { font-family: var(--mono); font-size: 10.5px; background: var(--line-soft); padding: 1px 4px; border-radius: var(--r-xs); }
.music-help a { margin-left: 7px; color: var(--green); }
@media (max-width: 720px) {
  .row:has(.chips) { flex-wrap: wrap; align-items: flex-start; }
  .row:has(.chips) .body { flex: 1 0 100%; min-width: 100%; }
  .row:has(.chips) .chips { width: 100%; }
  .music-head { flex-wrap: wrap; }
  .music-head .body { flex: 1 0 100%; }
  .music-url { flex-wrap: wrap; }
  .music-url input { flex-basis: 100%; }
}
</style>