/**
 * 文件：src/constants/nav.ts
 * 说明：导航与页面元数据单一来源。定义 PageKey、页面标题、路由、分组顺序与模块键，供侧栏、移动导航、搜索和路由守卫复用。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { Modules } from '@/types'

export type PageKey = keyof Modules

export interface PageMeta {
  key: PageKey
  title: string
  subtitle: string
  desc: string
}

export const PAGES: PageMeta[] = [
  { key: 'home', title: '首页总览', subtitle: '今天该干什么，随手记一句', desc: '三日待办、今日焦点、快速备忘与各模块摘要' },
  { key: 'tasks', title: '待办与计划', subtitle: '任务推进与阶段目标', desc: '任务、阶段目标与关键结果' },
  { key: 'focus', title: '专注', subtitle: '多档位计时与音乐陪伴', desc: '番茄、正计时、自定义计时、绑定任务、音乐与专注记录' },
  { key: 'music', title: '音乐', subtitle: '发现、播放与我的歌单', desc: '风格歌单、搜索、播放模式、最近播放与收藏' },
  { key: 'habits', title: '打卡', subtitle: '习惯的连续与完成', desc: '每日勾选、连续天数、月历热力格' },
  { key: 'fitness', title: '健身计划', subtitle: '训练日志与负荷进步', desc: '分化计划、组次记录、围度跟踪' },
  { key: 'media', title: '自媒体', subtitle: '排期、状态与发布数据', desc: '选题库、内容状态、平台数据' },
  { key: 'novel', title: '小说创作', subtitle: '章节、设定与伏笔回收', desc: '章节字数、设定库、伏笔台账' },
  { key: 'output', title: '作品产出', subtitle: '交付物：分镜与迭代', desc: '项目验收、分镜版本、迭代看板' },
  { key: 'learning', title: 'AI 视频创作', subtitle: '路线、知识点与作品', desc: 'AI 视频学习路线、阶段知识点、学习记录、复习与阶段作品' },
  { key: 'dev', title: 'AI 全栈开发', subtitle: '路线、知识点与项目', desc: 'AI 全栈学习路线、阶段知识点、学习记录、复习与阶段作品' },
  { key: 'reading', title: '阅读', subtitle: '书单、进度与阅读记录', desc: '想读、在读、读完，页码进度、时长与读完统计' },
  { key: 'ideas', title: '灵感', subtitle: '一句想法、一张图、一个链接', desc: '三类灵感卡片、自定义标签与作品绑定' },
  { key: 'favorites', title: '收藏', subtitle: '文字、链接、图片与文件', desc: '收藏夹分类、标签、概述与备注' },
  { key: 'leisure', title: '娱乐记录', subtitle: '看过什么，看到哪', desc: '在看进度、评分短评、年度统计' },
  { key: 'settings', title: '基础设置', subtitle: '主题、背景、首页与模块开关', desc: '称呼、主题、背景、偏好与模块开关' },
  { key: 'data', title: '数据', subtitle: '备份、快照与导入导出', desc: '存储状态、备份提醒、快照与导入导出' }
]

export const PAGE_MAP: Record<PageKey, PageMeta> = PAGES.reduce((acc, p) => {
  acc[p.key] = p
  return acc
}, {} as Record<PageKey, PageMeta>)

export interface NavGroup {
  name: string
  pages: PageKey[]
}

export const NAV_GROUPS: NavGroup[] = [
  { name: '日常', pages: ['home', 'music', 'ideas', 'favorites'] },
  { name: '推进', pages: ['tasks', 'focus', 'habits', 'fitness'] },
  { name: '产出', pages: ['media', 'novel', 'output'] },
  { name: '输入', pages: ['learning', 'dev', 'reading', 'leisure'] },
  { name: '系统', pages: ['settings', 'data'] }
]
