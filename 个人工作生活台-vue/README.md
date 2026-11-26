# 个人工作生活台 · Vue 3 + TypeScript

单人自用的工作生活规划台。前端 Vue 3，Express 负责本机持久化，另可选接入本机 QQ 音乐 API 作为音乐源。数据落在本机，关页面、关电脑都不丢。

## 快速开始

```bash
npm install
npm run dev          # 开发态：mock 接口，http://localhost:5173
```

正式运行（数据落文件，关电脑也不丢）：

```bash
npm run build:express     # 产出 dist（走真实接口）
npm run start             # 启动 Express，http://127.0.0.1:8787
```

Windows 下可直接双击 `启动.bat`：缺 dist 会自动构建；若同级目录存在 `qq-api`，会顺手拉起 QQ 音乐服务（3200），再等 8787 接口响应后打开浏览器。脚本本身是纯 ASCII + CRLF，避免 cmd 按 GBK 解析 UTF-8 批处理时把命令拆坏。

### 可选：QQ 音乐服务

音乐页需要一个本机运行的 [qq-music-api](https://github.com/yakult-green-tea/qq-music-api)，默认端口 3200。它不在本项目内分发，单独安装：

```bash
mkdir ..\qq-api
cd ..\qq-api
npm init -y
npm install @yakult-green-tea/qq-music-api@3.3.8
node node_modules\@yakult-green-tea\qq-music-api\dist\src\app.js
```

需要跨重启保留 QQ 音乐扫码登录时，在启动服务前同时设置 `QQ_SESSION_SECRET` 与 `QQ_AUTH_SESSION_PATH`。`启动.bat` 会自动生成并复用 `qq-api\data\session-secret.txt`，会话写入 `qq-api\data\qq-session.bin`；手动启动也要带上这两个环境变量，否则登录态只存在内存。

本项目 Express 会把 `/api/music/*` 同源代理到 `http://127.0.0.1:3200`，因此浏览器只接触 8787，不需要处理跨域。只允许 `127.0.0.1 / localhost / ::1`，避免把登录凭证发到外部地址。

## 项目架构

### 技术栈与约束

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 视图 | Vue 3 + `<script setup>` + TypeScript | 页面与组件全部为 SFC，类型由 `vue-tsc` 门禁 |
| 状态 | Pinia | `desk` 管业务数据，`ui` 管弹窗/提示 |
| 路由 | Vue Router（hash） | 静态托管、Express、直接打开 index.html 都能用 |
| 样式 | 原生 CSS + 设计 token | 无 UI 框架，全部样式集中在 `src/styles/main.css` |
| 持久化 | Express + JSON 文件 | 临时文件写入后 rename，避免半份文件 |
| 音乐 | 本机 QQ 音乐 API + 同源代理 | 浏览器不直连上游，也不接触音源真实地址 |

设计约束：

- 单一真源：所有业务数据最终都落在同一个 `AppState`，页面不各自维护副本。
- 单一写入口：业务页面只通过 `useDeskStore().commit(mutator)` 改数据，由 store 统一防抖落盘。
- 单一契约：mock 与 express 必须实现同一套 `DeskApi`，页面不判断当前是哪种模式。
- 单一导航源：页面 key、标题、分组、路由都从 `constants/nav.ts` 派生。
- 数据可带走：状态、设置和背景图都在 `state.json` / 导出文件里；登录凭证、音频缓存不进去。

### 运行分层

```text
┌──────────────────────────────────────────────────────────────┐
│ 表现层  App.vue / SideNav / TopBar / MobileNav / views       │
│         页面只读 store.data，通过 commit 或 service 触发变更  │
├──────────────────────────────────────────────────────────────┤
│ 交互层  stores/ui.ts / composables / components              │
│         toast、动态表单、确认弹窗、媒体查询、全局搜索         │
├──────────────────────────────────────────────────────────────┤
│ 领域层  services/focus.ts / music.ts / noise.ts              │
│         计时状态机、播放运行态、Web Audio 合成                │
├──────────────────────────────────────────────────────────────┤
│ 数据层  types / data/state / utils / api                     │
│         类型、空白库、归一化、合并、选择器、接口契约          │
├──────────────────────────────────────────────────────────────┤
│ 持久层  server/index.mjs / server/music-service.mjs          │
│         state.json、snapshots、小说原文件、QQ 音乐代理        │
└──────────────────────────────────────────────────────────────┘
```

一次写入的完整链路：

```text
页面操作
  → store.commit(mutator)        // 只改内存中的 AppState
  → scheduleSave()              // 350ms 防抖
  → flush()                     // JSON 深拷贝后 PUT /api/state
  → Express 写临时文件 + rename  // 原子替换 state.json
  → 返回 savedAt / bytes        // 失败则保留 pending，下次重试
```

一次启动的完整链路：

```text
main.ts 创建应用
  → App.vue 挂载
  → desk.bootstrap(): GET /api/ping → GET /api/state
  → normalizeState(raw)         // 补默认值、裁非法值、修关系
  → store.data 就绪
  → initMusic() 恢复队列与音量
  → 各页面按路由读取 store.data
```

### 数据模型与迁移

`AppState` 的顶层结构：

| 字段 | 内容 |
| --- | --- |
| `version / app` | 当前版本号与应用标识，导入时用于识别 |
| `deviceName / theme` | 设备名与主题（light / dark / auto） |
| `general` | 称呼、备份提醒天数 |
| `appearance` | 背景模式、浅/深纯色、图片、遮罩、模糊、减少动画 |
| `dataPrefs` | 自动快照开关 |
| `modules` | 各页面模块开关 |
| `tasks / goals` | 待办与阶段目标 |
| `focus` | 专注设置、白噪音参数、专注记录 |
| `music` | 队列、当前曲、最近播放、收藏、歌单、播放模式 |
| `habits / checkins` | 习惯定义与按日打卡集合 |
| `fitness` | 分化、动作、训练记录、体测 |
| `media` | 平台、选题、内容流水线 |
| `novel` | 作品、章节、设定、伏笔、故事线、字数日志 |
| `output` | 项目、验收、分镜、提示词、迭代、看板 |
| `learning` | 学习线、阶段、知识点、记录、资源 |
| `ideas / summaries` | 灵感收件箱与摘要卡 |
| `favorites` | 收藏夹与多类型收藏 |
| `reading / leisure` | 书单与阅读记录、娱乐记录 |

当前 `STATE_VERSION = 6`。读取旧库、手工改过的 JSON、导入文件时，`src/data/state.ts` 的 `normalizeState()` 会：

1. 以空白库为底，逐层合并外部值；
2. 校验主题、背景模式、音乐模式、任务领域等枚举；
3. 对数字做 `clamp`，对字符串做长度截断，对 dataURL 做体积上限；
4. 过滤指向不存在 track/topic 的学习记录，避免孤儿引用；
5. 补齐灵感标签与绑定关系，保留用户已手工编辑的结构化标签。

因此新增字段只需要补 `blankState()` 和归一化逻辑，页面不需要写迁移分支。

### 导航、路由与模块开关

`src/constants/nav.ts` 定义 `PageKey`、页面标题、路由和五个分组：

| 分组 | 页面 |
| --- | --- |
| 日常 | 今日总览、音乐、灵感、收藏 |
| 推进 | 待办与计划、专注、打卡、健身计划 |
| 产出 | 自媒体、小说创作、作品产出 |
| 输入 | 学习规划（AI 视频）、AI 全栈开发、阅读、娱乐 |
| 系统 | 基础设置、数据 |

`src/router/index.ts` 注册 17 条业务路由，并用 `meta.key` 对齐模块开关。访问被关闭的模块时，守卫会回落到首页；数据不会被删除，重新打开开关即可恢复。`/learning` 与 `/dev` 共用 `LearningView`，由 `meta.domain` 决定渲染哪条学习线。

### 外观与主题链路

`App.vue` 把设置投影到 `<html>`：

- `data-theme="light|dark"`：主题总开关，`auto` 时监听系统 `prefers-color-scheme`；
- `data-bg="paper|color|image"`：背景模式；
- `--bg-selected`：当前选中的纯色；
- `--tone-mix`：卡片混色比例，由 `colorSaturation()` 按背景饱和度在 28%–44% 之间计算；
- `data-motion="reduce"`：减少动画开关。

`src/styles/main.css` 只读这些属性与 token，不直接读 store。纯色模式下，页面使用所选颜色，卡片、KPI、侧栏、顶栏和搜索框使用同色系半透明表面，边框带背景色倾向并叠加阴影；图片模式下卡片为半透明表面并叠加遮罩，保证文字可读。浅色与深色各有一套 `lightColor / darkColor`，切换主题时自动换到对应槽位。

### 音乐链路

```text
MusicView / GlobalMusicBar / FocusView
  → services/music.ts（播放器运行态）
  → api/music.ts（/api/music/*）
  → server/music-service.mjs（同源代理）
  → 本机 qq-music-api:3200
  → /api/music/stream?id=...（8787 转发音频流）
```

可持久化元数据（队列、当前曲、最近播放、收藏、模式、音量、风格）写入 `state.music`；登录 Cookie 只存在 `server/data/qq-cookie.txt`，音源地址只在内存缓存，不进入 `state.json`、导出或快照。

### 专注链路

`services/focus.ts` 是独立于页面的状态机，`App.vue` 挂载的 `FocusBar` 与 `FocusView` 共用同一份 `focusState`。计时使用绝对时间戳校准，不依赖 `setInterval` 累减；切页、锁屏、后台节流后回到页面仍按真实时间计算。完成时写 `focus.sessions`，首页和专注页的统计都从这份记录派生。

## 页面地图

| 路由 | 页面 | 视图文件 |
| --- | --- | --- |
| `#/` | 今日总览 | `HomeView.vue` |
| `#/tasks` | 待办与计划 | `TasksView.vue` |
| `#/focus` | 专注 | `FocusView.vue` |
| `#/music` | 音乐 | `MusicView.vue` |
| `#/habits` | 打卡 | `HabitsView.vue` |
| `#/fitness` | 健身计划 | `FitnessView.vue` |
| `#/media` | 自媒体 | `MediaView.vue` |
| `#/novel` | 小说创作 | `NovelView.vue` |
| `#/output` | 作品产出 | `OutputView.vue` |
| `#/learning` | 学习规划（AI 视频） | `LearningView.vue`（`domain=video`） |
| `#/dev` | AI 全栈开发 | `LearningView.vue`（`domain=dev`） |
| `#/reading` | 阅读 | `ReadingView.vue` |
| `#/ideas` | 灵感与摘要 | `IdeasView.vue` |
| `#/favorites` | 收藏 | `FavoritesView.vue` |
| `#/leisure` | 娱乐记录 | `LeisureView.vue` |
| `#/settings` | 基础设置 | `SettingsView.vue` + `settings/BasicPanel.vue` |
| `#/data` | 数据 | `DataView.vue` + `settings/DataPanel.vue` |

## 逐页结构与功能

### 今日总览 `#/`

- 结构：页头问候与日期 → 三日待办带 → 今日焦点（专注统计 + 今日待办）→ 各模块摘要 → 快速备忘 → 今日状态。
- 数据：`tasks`、`focus.sessions`、`habits/checkins`、`fitness`、`media`、`output`、`learning`、`reading`、`leisure`、`summaries`。
- 功能：聚合展示今天要做什么、已经投入多少；勾选今日待办；快速记一条备忘；点任意摘要卡跳转到对应模块。
- 实现：页面只读聚合，不复制业务数据。三日带按日期筛选任务；今日焦点用 `focus.sessions` 按 `taskId` 汇总番茄与分钟；模块摘要只取各域前几条，避免首页变成第二套列表。

### 待办与计划 `#/tasks`

- 结构：页头统计 → 视图切换（今日 / 本周 / 全部）与领域筛选 → 任务列表 → 阶段目标 → 未来七天到期。
- 数据：`tasks`、`goals`、`focus.sessions`。
- 功能：任务新建/编辑/删除、完成与撤销、按领域筛选、按截止日排序；目标新建、进度调整、关键结果勾选；每条任务显示累计番茄与分钟。
- 实现：番茄数不落库，按 `focus.sessions` 的 `taskId` 派生；逾期任务置顶并标红；完成时写 `doneAt`，撤销时清空；`?new=1` 查询参数可从首页直达新建弹窗。

### 专注 `#/focus`

- 结构：页头今日统计 → 计时主卡（档位、时长、环形进度、绑定任务）→ 近 7 天柱状 → 音乐迷你卡 → 最近专注记录。
- 数据：`focus.settings`、`focus.sessions`、`tasks`、`music`。
- 功能：番茄 / 不限时 / 自定义三档切换；选择任务；开始、暂停、继续、跳过、重置；自定义时长 5–180 分钟；结束写入记录；专注时可放当前队列。
- 实现：状态机在 `services/focus.ts`；番茄第 4 轮进长休；不限时不自动结束，手动结束按实际分钟落库；切换档位若正在计时会先确认并把已过时间记为中断；浏览器拦截自动播放时显示「继续」入口。

### 音乐 `#/music`

- 结构：页头 → 发现 / 我的页签 → 播放器主卡（封面、歌名、进度、控制、音量、模式）→ 发现页风格胶囊、搜索、风格歌单与歌单详情；我的页账号、收藏/喜欢、最近播放。
- 数据：`music.queue`、`currentId`、`recent`、`liked`、`playlists`、`settings`。
- 功能：QQ 扫码登录/退出、歌曲与歌单搜索、风格歌单、歌单详情播放、收藏/取消收藏、最近播放、顺序/列表循环/单曲循环/随机、进度拖动、音量。
- 实现：播放运行态在 `services/music.ts`，页面与全局播放条共用；未登录收藏只写本地，登录后尽力同步；受限歌曲会提示版权/VIP/音源原因，不伪造地址；切歌、自动结束、删除队列都会同步当前曲和最近播放。

### 打卡 `#/habits`

- 结构：页头今日待完成数 → 今日打卡列表（图标、频率、连续天数、勾选、补卡）→ 本月热力格 → 30 天记录。
- 数据：`habits`、`checkins`。
- 功能：习惯新建/编辑/停用/删除；按执行日自动排期；今日打卡与撤销；仅允许补昨天；月热力格按当天完成数分档；周目标显示本周 x/目标；连续天数计算。
- 实现：打卡以日期字符串存集合，天然去重；连续天数从今天往前算，今天未打卡时以昨天为终点，避免早上打开显示 0；删除习惯会二次确认并清除历史；空态提供喝水/阅读/早睡模板。

### 健身计划 `#/fitness`

- 结构：页头本周次数/组数/容量 → 今天的分化 → 进行中的训练（动作与组次录入）→ 分化计划 → 体重与围度 → 最近训练。
- 数据：`fitness.split`、`exercises`、`sessions`、`metrics`。
- 功能：推/拉/腿模板一键生成；编辑分化与星期绑定；训练时逐动作增删组、录重量与次数；完成写训练记录；体测记录；本周容量统计。
- 实现：容量按 `Σ 重量 × 次数` 计算；同一动作显示上次成绩，方便加重；训练完成只写 `fitness.sessions`，不在打卡页重复记录；无计划时用模板而不是空白表格引导。

### 自媒体 `#/media`

- 结构：页头内容/已发布数 → 本周排期七列 → 内容流水线（选题 → 脚本 → 制作 → 已发布）→ 选题库 → 平台数据。
- 数据：`media.platforms`、`topics`、`items`。
- 功能：新建内容、编辑平台与计划日、推进状态、回填阅读/点赞/收藏/评论、从选题库转内容、删除内容、平台维度汇总。
- 实现：状态推进是单向主流程，避免卡片在四列间随意跳；本周排期按 `planDate` 落位；平台统计只汇总已发布内容；选题 `used` 标记避免重复使用。

### 小说创作 `#/novel`

- 结构：页头当前作品与总字数 → 作品切换/新建 → 总纲（简介、目标、原文件）→ 故事线 → 章节表 → 设定库 → 伏笔台账 → 日更字数。
- 数据：`novel.works`、`chapters`、`settings`、`foreshadows`、`storyNodes`、`wordLog`、`novel-files`。
- 功能：新建/切换作品、编辑总纲、上传原文件、故事节点增删、章节增删与状态推进、人物/地点/势力/物品设定、伏笔埋设与回收、日更字数记录。
- 实现：所有子实体都带 `workId`，页面只渲染当前作品；未回收伏笔单独置顶计数；字数以 `wordLog` 按日期累计；原文件存 `server/data/novel-files`，state 只存元信息，避免 JSON 膨胀。

### 作品产出 `#/output`

- 结构：页头领域切换（AI 视频 / 全栈开发）→ 项目卡与验收条件 → 视频侧分镜表与提示词说明；开发侧迭代与四列看板。
- 数据：`output.projects`、`shots`、`prompts`、`iterations`、`tickets`。
- 功能：新建项目、编辑目标/交付物/验收条件、勾选验收；分镜按镜号增删、记录模型与版本、标记采用版；开发侧建迭代、建需求/缺陷、前后移动状态、标记阻塞。
- 实现：两个领域共用项目壳层，差异只在专属面板；看板四列由 `tickets.status` 派生，移动只改状态；迭代剩余天数按结束日期计算；验收条件必须可勾选，避免只写一句目标。

### 学习规划 `#/learning` 与 AI 全栈开发 `#/dev`

- 结构：页头领域名与路线周期 → 路线卡（目标、截止、阶段进度）→ 当前阶段与今日建议 → 周投入柱状 → 知识点清单（按阶段分组）→ 到期复习 → 资源库。
- 数据：`learning.tracks`、`stages`、`topics`、`logs`、`resources`。
- 功能：AI 视频 12 周 / 全栈 16 周模板一键生成；路线增改删；阶段增改；知识点三态推进（待学 / 学习中 / 已掌握）；记录学习分钟、阻塞与下一步；安排复习；资源贴链接并标记已读。
- 实现：`/learning` 与 `/dev` 是同一视图的两个 `domain`；模板只负责初始化，之后数据独立；知识点按 `stage` 分组，完成率由状态派生；学习中超过 7 天未更新会在顶部提示；复习日期按 1/3/7/14 天节奏推进。

### 阅读 `#/reading`

- 结构：页头在读/本月时长/今年读完 → 书单（封面、作者、进度、评分）→ 阅读记录。
- 数据：`reading.books`、`logs`。
- 功能：添加/编辑书籍、设置状态（想读/在读/读完/弃读）、记录页码与时长、评分与短评、删除书与记录。
- 实现：阅读进度按当前页/总页数计算；月度时长由 `logs` 汇总；书单和记录通过 `bookId` 关联；读完会自动写完成日期。

### 灵感与摘要 `#/ideas`

- 结构：页头灵感数/绑定数 → 快速记录框（文字/链接/图片）→ 标签筛选 → 灵感列表 → 摘要卡。
- 数据：`ideas`、`summaries`、`media.topics`、`learning`、`tasks`。
- 功能：快速记录、上传图片、自动标签、手动改标签、删除、绑定作品、转任务/选题/学习知识点；摘要卡记录标题、来源、要点、判断。
- 实现：标签分三级（分类/子分类/关键词），旧数据在归一化时按关键词规则推断；转化后原文保留并写 `convertedTo/convertedId`，同一目标类型不可重复转化；绑定关系只存 `module + id + title`，不复制目标内容。

### 收藏 `#/favorites`

- 结构：页头收藏数/收藏夹数 → 新建收藏卡（文字/链接/图片/文件）→ 收藏夹与标签筛选 → 分组卡片列表。
- 数据：`favorites.folders`、`items`。
- 功能：四种收藏类型、图片压缩、文件转 dataURL、收藏夹新建/重命名、标签解析、搜索、编辑与删除。
- 实现：图片沿用 `utils/image.ts` 的长边 1440 / 优先 500 KB 压缩（保底 600 KB）；文件受浏览器存储限制，保存前提示体积；收藏夹删除时把条目回落到未分组；列表按文件夹分组，空文件夹不渲染。

### 娱乐记录 `#/leisure`

- 结构：页头在看数/年度完成/均分 → 条目列表（类型、状态、进度、评分）→ 今年类型分布。
- 数据：`leisure`。
- 功能：新建影/剧/番/书/游、在看进度 +1、标记看完/弃、评分与短评、记录时长、删除。
- 实现：进度按 `progress/total` 计算；看完自动写 `finishedAt`；年度统计只算当年完成；类型分布用条形占比，不引入图表库。

### 基础设置 `#/settings`

- 结构：页头 → 个人与设备 → 主题 → 背景（纸色/纯色/图片、遮罩、模糊、历史图）→ 减少动画 → 专注参数 → 音乐服务与默认风格/音量 → 模块开关。
- 数据：`deviceName`、`general.nickname`、`theme`、`appearance`、`focus.settings`、`music.settings`、`modules`。
- 功能：改称呼、设备名、主题；选纯色或上传/粘贴图片；调遮罩与模糊；恢复历史背景；测试提示音；测试音乐连接；开关模块。
- 实现：所有改动即时 `commit`，无需保存按钮；纯色背景在浅/深主题各记一套颜色；图片上传先压缩再写 dataURL；图片历史最多 6 张并去重；关闭模块只隐藏导航与拦截路由，不删数据。

### 数据 `#/data`

- 结构：页头设备与存储模式 → 体积构成 → 导出/导入 → 快照列表 → 自动快照与备份提醒 → 示例/清空。
- 数据：整个 `AppState`、`snapshots`、`dataPrefs`。
- 功能：导出 JSON、导入合并或覆盖、手动快照、恢复快照、自动快照开关、备份提醒天数、载入示例、清空全部。
- 实现：导出前记录 `lastExportAt`；导入先 `validateImport` 再让用户选合并/覆盖；覆盖、恢复、清空、示例前会按设置自动建快照；快照最多 5 份；体积统计包含背景图与图片历史，避免只算文本造成误判。

## 设置与外观

- 基础设置与数据拆成两个路由：`#/settings` 管身份、外观与偏好，`#/data` 管备份与恢复，互不遮挡。
- 背景图上传会先压到长边 1440、优先压到 500 KB 内（保底不超过 600 KB），再以 dataURL 存进数据；因此**导出文件和快照会包含背景图**，换设备能带走。网络图片只接受 http(s) 地址，应用前会预加载校验。
- 图片背景建议把遮罩留在 30% 以上；卡片、KPI、侧栏、顶栏与搜索框使用同色系半透明表面并叠加背景模糊，保证文字可读。
- 纯色背景下，页面使用所选颜色，其他卡片采用对应色系：`--tone-mix` 根据背景饱和度动态调整，边框带背景色倾向，阴影比纸色模式更明显；深色主题同样适配。
- 「跟随系统」会监听系统深浅色变化；顶栏月亮按钮点击后写的是显式浅/深色，相当于从跟随系统切出来。

## 音乐

- 专注页原来的白噪音已整体换成音乐入口：有当前歌曲时显示迷你播放器（上一曲 / 播放暂停 / 下一曲 / 进度 / 打开播放器），没有歌时引导去选歌。
- 音乐页分「发现 / 我的」。发现页有 9 个风格分类（流行、古风、摇滚、纯音乐、民谣、电子、说唱、爵士、古典）、风格歌单、歌曲/歌单搜索与歌单详情；我的页有扫码登录、本地收藏、最近播放，登录后还会同步 QQ 音乐歌单与喜欢的音乐。
- 播放条支持顺序、列表循环、单曲循环、随机四种模式；播放/暂停、上一曲/下一曲、进度拖动、音量调节都在页内，非音乐页底部还有全局迷你播放条。队列展开时会自动把当前歌曲滚到列表上部约三分之一处，手动切歌、自动结束、随机切歌都生效。
- 音乐元数据（队列、当前歌曲、最近播放、收藏、模式、音量、风格）进 `state.json`，跟着导出与快照走；**QQ 音乐登录凭证只存在 `server/data/qq-cookie.txt`**，音频 URL 只在内存缓存，两者都不进 state、导出或快照。
- QQ 音乐有部分歌曲需要登录或会员才能拿到完整播放地址。未登录时免费歌曲可以直接播放，受限歌曲会提示原因，不会伪造音源；登录后部分歌曲会恢复可播放。
- 默认关闭「开始专注时自动播放」；开启后点开始专注会尝试续播当前队列。若浏览器拦截自动播放，专注页会提示点「继续」。
- 仅个人自用：不下载歌曲、不绕过会员/版权、不公开传播。第三方接口不是官方 SDK，接口失效时页面会提示，不会影响其他模块数据。

## 专注档位

- 经典番茄：默认 25 分钟，配 5 分钟短休 / 15 分钟长休，每 4 轮进长休；下方「长休进度」用编号圆点显示本轮已完成到第几个。
- 不限时：正计时向上累计，不自动结束，也不进休息循环；点「结束并记录」按实际分钟数写入记录。
- 自定义：倒计时，时长在专注页直接调（5–180 分钟，步进 5），独立一次专注，不进番茄循环。
- 三种档位会记住上次选择；切换档位时若正在计时，会先确认并把已过时间记为中断。
- 危险操作前的自动快照默认开启：覆盖导入、恢复快照、清空、载入示例前各建一份，与手动快照共用 5 份上限。

## 接口契约

前端只依赖 `src/api/contract.ts` 的 `DeskApi`，mock 与 express 各自实现同一套：

```text
GET    /api/ping                  → { mode, label, ok }
GET    /api/state                 → AppState
PUT    /api/state                 → { savedAt, bytes }
POST   /api/state/reset           → AppState（{demo:true} 载入示例）
DELETE /api/state                 → AppState（清空）
GET    /api/snapshots             → SnapshotMeta[]
POST   /api/snapshots             → SnapshotMeta（最多保留 5 份）
POST   /api/snapshots/restore     → AppState
```

真实接口统一返回 `{ ok: true, data }`，错误返回 `{ ok: false, error: { message } }`。写入采用「临时文件 + rename」，避免写一半断电留下坏文件。

音乐接口额外挂在 `/api/music/*`，由 `server/music-service.mjs` 代理：状态、扫码登录、搜索、风格歌单、歌单详情、歌曲音源、我的歌单、喜欢、收藏与被收藏、音频流。音频流走 8787 的 `/api/music/stream?id=`，不把真实音源 URL 暴露给前端。

小说原文件接口由 `server/index.mjs` 提供，文件落在 `server/data/novel-files/`；只接受 txt / md / doc / docx / pdf，单文件上限 8 MB。state 里只保存文件名、大小、类型与引用路径，避免把二进制塞进 JSON。

## 两种数据模式

| 模式 | 启动 | 数据位置 | 用途 |
| --- | --- | --- | --- |
| mock | `npm run dev` | 浏览器 localStorage（`desk.v2.state`） | 开发、联调，不需要后端；音乐页不可用 |
| express | `npm run start` | `server/data/state.json` + `server/data/snapshots/` | 日常使用，关页面 / 关电脑都不丢；音乐可用 |

`npm run build` 产出的是 mock 版（VITE_USE_MOCK=true），可以放到任意静态目录打开；`npm run build:express` 产出的是真实接口版。两者同名脚本都先跑 `vue-tsc` 做类型检查。

## 目录

```text
src/
  App.vue                 应用外壳：导航、顶栏、路由视图、全局条、弹窗
  main.ts                 创建应用、安装 Pinia/路由、启动数据与音乐
  env.d.ts                SFC / Vite 类型声明
  api/                    契约、真实接口、mock、音乐接口、切换入口
  components/             导航、页头、KPI、表单、确认、Toast、音乐条
    BaseModal.vue         通用弹窗外壳
    BoundIdeas.vue        实体关联灵感列表
    ConfirmModal.vue      全局确认弹窗
    EmptyState.vue        空态占位
    FocusBar.vue          全局专注悬浮条
    FormModal.vue         动态表单弹窗
    GlobalMusicBar.vue    全局播放条与播放队列
    Icon.vue              内置 SVG 图标
    KpiCard.vue           KPI 卡片
    MobileNav.vue         移动端底部导航
    MusicMiniCard.vue     专注页音乐迷你卡
    PageHeader.vue        页面标题
    SideNav.vue           桌面侧边导航
    StatusTag.vue         状态标签
    ToastHost.vue         轻提示宿主
    TopBar.vue            顶栏、搜索、主题、导出
  composables/            媒体查询、跨模块搜索
  constants/nav.ts        页面 key、标题、路由、分组
  data/
    state.ts              空白库、归一化、示例库
    learningTemplates.ts  视频 12 周 / 开发 16 周模板
  router/index.ts         Hash 路由与模块开关守卫
  services/
    focus.ts              专注计时状态机
    music.ts              播放器运行态与队列
    noise.ts              Web Audio 程序化提示音
  stores/
    desk.ts               业务数据与防抖持久化
    ui.ts                 toast、表单、确认
  styles/main.css         设计 token、主题、背景、布局、响应式
  types/index.ts          全领域类型
  utils/                  日期、选择器、导入合并、图片、颜色、标签、绑定
  views/                  17 条路由对应的页面
    HomeView.vue
    TasksView.vue
    FocusView.vue
    MusicView.vue
    HabitsView.vue
    FitnessView.vue
    MediaView.vue
    NovelView.vue
    OutputView.vue
    LearningView.vue      同时服务 /learning 与 /dev
    ReadingView.vue
    IdeasView.vue
    FavoritesView.vue
    LeisureView.vue
    SettingsView.vue
    DataView.vue
    settings/
      BasicPanel.vue
      DataPanel.vue
server/
  index.mjs               Express 接口 + JSON 持久化 + 小说文件 + 静态托管
  music-service.mjs       音乐代理、扫码登录、音频流
  data/                   state.json、snapshots/、qq-cookie.txt、music-service.json、novel-files/
```

## 注释规范

代码按以下四层写注释，避免逐行解释赋值：

1. **文件头**：每个 `.vue/.ts/.mjs/.css` 开头说明文件职责、所属层与维护边界。
2. **区块注释**：页面模板按「页头 / 主操作 / 统计 / 列表 / 弹窗」分区；脚本按「状态 / 派生数据 / 操作 / 副作用」分区。
3. **函数 JSDoc**：导出函数、复杂内部函数、事件处理器写清输入、输出、副作用与失败分支；简单 getter 不强行加注释。
4. **复杂逻辑说明**：计时时间戳、队列自动定位、背景色推导、状态归一化、导入合并、图片压缩、音乐错误重试等，必须说明「为什么这样做」而不只是「做了什么」。

新增页面时至少补齐：文件头、页面结构注释、主要操作函数 JSDoc，并在本 README 的「页面地图」和「逐页结构与功能」中各加一条。

## 数据安全

- 关页面、关电脑：express 模式写文件，mock 模式写 localStorage，都不会丢。
- 换设备：设置页「导出 JSON」带走，另一台「导入」选合并或覆盖。
- 合并规则：同 id 按更新时间取新，打卡取并集，专注记录按 id 去重，小说每日字数取较大值，设置始终以本机为准。
- 误删：数据页快照保留最近 5 份，恢复前建议先建一份。
- 存储不足：保存返回 `bytes=0` 时页面提示先导出备份；图片背景与图片历史会明显占用空间，数据页体积构成可定位。

## 常见问题

**双击 启动.bat 后白屏**：批处理曾被保存成 UTF-8 无 BOM，cmd.exe 按系统 GBK 解析，`if (...)` 块和中文行被拆成乱码命令，结果是「浏览器开了、服务没起」，页面自然白。现已改成纯 ASCII 内容 + CRLF 换行，并且先等 `/api/ping` 返回 200 才开浏览器。若仍白屏，按顺序看：`personal-os server` 窗口有没有报错、`http://127.0.0.1:8787/api/ping` 能不能打开、8787 是否被别的程序占用。

**音乐页显示「已连接 · 未登录」**：能连上 3200 但还没扫码，属于正常状态；点「我的 → 生成二维码」用 QQ 音乐 App 扫码即可。登录凭证只在本机服务端，换设备要重新扫。

**音乐页显示「未连接」**：先确认 `http://127.0.0.1:3200/login/status` 能打开；没有就启动 `qq-api` 里的服务，或点设置页「音乐 → 测试连接」检查地址。不要填外网地址，后端只允许本机。

**收藏提示只保存在本地**：未登录时收藏只写本机 state；登录后才会同步到 QQ 音乐。

**端口 8787 被占用**：脚本检测到已有监听会直接打开浏览器并退出；如果占用的不是本应用，换端口启动：cmd 下 `set PORT=8790 && npm run start`，PowerShell 下 `$env:PORT=8790; npm run start`。

**想换浏览器或清缓存**：express 模式数据在 `server/data/state.json`，不受影响；mock 模式数据在 localStorage，清缓存会读到空库，先导出 JSON。

## 暂不做

账号与云同步、真实 AI 调用、系统级推送与熄屏后台计时、附件二进制存储（小说原文件除外）、甘特图与 PDF 导出、多人协作、任务重复规则。音乐仅做本机播放与元数据记录，不做歌曲下载、离线缓存、VIP 绕过或公开分享。
