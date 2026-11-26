/**
 * 文件：src/utils/ideaTags.ts
 * 说明：灵感标签工具。基于关键词规则自动推荐标签，并处理标签去重、合并与展示。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { IdeaKind } from '@/types'

export const IDEA_CATEGORY_OPTIONS = ['学习', '视频创作', '软件开发', '日常'] as const
export const IDEA_SUBCATEGORY_OPTIONS = ['小说', '视频', '自媒体', '读书'] as const
export const IDEA_KEYWORD_OPTIONS = [
  '搞笑',
  '激励',
  'Agent',
  '效率',
  '产品',
  '技术',
  '情绪',
  '审美'
] as const

export interface IdeaTagSet {
  categories: string[]
  subcategories: string[]
  keywords: string[]
}

export interface IdeaTagInput {
  kind?: IdeaKind
  text?: string
  title?: string
  url?: string
}

interface TagRule {
  label: string
  group: 'category' | 'subcategory' | 'keyword'
  words: string[]
}

const RULES: TagRule[] = [
  {
    label: '学习',
    group: 'category',
    words: ['学习', '课程', '教程', '知识', '读书', '阅读', '书单', '书摘', '笔记', '论文', '考试', '复盘', '认知', '方法论', '技能', '练习', 'study']
  },
  {
    label: '视频创作',
    group: 'category',
    words: ['视频', '剪辑', '拍摄', '镜头', '分镜', '脚本', '口播', '短视频', '字幕', '调色', '封面', '运镜', 'bgm', '画面', 'video']
  },
  {
    label: '软件开发',
    group: 'category',
    words: ['开发', '代码', '编程', '程序', '前端', '后端', '接口', 'api', '数据库', '部署', '上线', '调试', 'bug', '架构', '产品', 'agent', '智能体', '自动化', '工作流', 'code', 'dev']
  },
  {
    label: '日常',
    group: 'category',
    words: ['日常', '生活', '旅行', '吃饭', '运动', '健身', '睡眠', '家庭', '心情', '天气', '整理', '家务', '习惯', '通勤', '时间管理', 'life']
  },
  {
    label: '小说',
    group: 'subcategory',
    words: ['小说', '故事', '人物', '角色', '章节', '情节', '设定', '世界观', '伏笔', '剧情', '结局', 'novel', 'story']
  },
  {
    label: '视频',
    group: 'subcategory',
    words: ['视频', '剪辑', '镜头', '分镜', '拍摄', '口播', '短片', '字幕', 'video']
  },
  {
    label: '自媒体',
    group: 'subcategory',
    words: ['自媒体', '公众号', '小红书', '抖音', 'b站', 'bilibili', '微博', '知乎', '选题', '账号', '涨粉', '流量', '内容运营', '爆款', 'xiaohongshu', 'douyin', 'zhihu']
  },
  {
    label: '读书',
    group: 'subcategory',
    words: ['读书', '书摘', '书评', '作者', '阅读', '书单', '读后感', '书籍', 'book']
  },
  {
    label: '搞笑',
    group: 'keyword',
    words: ['搞笑', '喜剧', '段子', '梗', '幽默', '好笑', '沙雕', '笑点', 'funny']
  },
  {
    label: '激励',
    group: 'keyword',
    words: ['激励', '励志', '成长', '热血', '坚持', '自律', '目标', '逆袭', '动力', '鸡汤', 'motivation']
  },
  {
    label: 'Agent',
    group: 'keyword',
    words: ['agent', '智能体', '大模型', 'ai', '提示词', '工作流', '自动化', 'copilot', 'llm']
  },
  {
    label: '效率',
    group: 'keyword',
    words: ['效率', '方法', '流程', '模板', '工具', '复盘', '时间管理', '生产力', '专注', 'productivity']
  },
  {
    label: '产品',
    group: 'keyword',
    words: ['产品', '需求', '用户', '体验', '设计', '交互', '商业', '变现', '定位', 'product']
  },
  {
    label: '技术',
    group: 'keyword',
    words: ['技术', '代码', '架构', '接口', '数据库', '部署', '开发', '工程', '性能', 'tech']
  },
  {
    label: '情绪',
    group: 'keyword',
    words: ['情绪', '焦虑', '内耗', '治愈', '孤独', '压力', '心态', '关系', '共情', 'emotion']
  },
  {
    label: '审美',
    group: 'keyword',
    words: ['审美', '视觉', '配色', '排版', '摄影', '画面', '风格', '质感', '设计感', 'aesthetic']
  }
]

function hitCount(corpus: string, word: string): number {
  const w = word.toLowerCase()
  if (!w) return 0
  if (/^[a-z0-9+#.-]+$/.test(w)) {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'g')
    return (corpus.match(re) || []).length
  }
  let count = 0
  let from = 0
  while (from < corpus.length) {
    const at = corpus.indexOf(w, from)
    if (at < 0) break
    count += 1
    from = at + w.length
  }
  return count
}

/**
 * 本地关键词打标。
 * 规则按「命中不同关键词的数量」计分，而不是简单包含：
 * 一条灵感同时出现“镜头、分镜、剪辑”才更容易被判为视频，避免单个“AI”把分类带偏。
 * 分类/子分类各取前 2，关键词取前 4，并补上正文里的 #标签（最多 6 个）。
 * 全离线、可解释，不做图片像素识别；图片灵感只依据标题/URL。
 */
export function analyzeIdeaTags(input: IdeaTagInput): IdeaTagSet {
  const corpus = `${input.title || ''} ${input.text || ''} ${input.url || ''}`.toLowerCase()
  if (!corpus.trim()) return { categories: [], subcategories: [], keywords: [] }

  const scored = RULES.map((rule, index) => {
    const distinct = rule.words.filter((w) => hitCount(corpus, w) > 0).length
    return { ...rule, score: distinct, index }
  }).filter((x) => x.score > 0)

  const top = (group: TagRule['group'], limit: number): string[] =>
    scored
      .filter((x) => x.group === group)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, limit)
      .map((x) => x.label)

  const keywords = top('keyword', 4)
  const explicit = Array.from(corpus.matchAll(/#([\p{L}\p{N}_-]{1,24})/gu))
    .map((m) => m[1])
    .filter((x) => x && !IDEA_KEYWORD_OPTIONS.includes(x as (typeof IDEA_KEYWORD_OPTIONS)[number]))
  for (const word of explicit) {
    if (keywords.length >= 6) break
    if (!keywords.includes(word)) keywords.push(word)
  }

  return {
    categories: top('category', 2),
    subcategories: top('subcategory', 2),
    keywords
  }
}

export function mergeTags(...lists: Array<string[] | undefined>): string[] {
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list || []) {
      const v = String(raw || '').trim()
      if (v && !out.includes(v)) out.push(v)
    }
  }
  return out
}

export function ideaKindLabel(kind: IdeaKind): string {
  return kind === 'link' ? '链接' : kind === 'image' ? '图片' : '文字'
}
