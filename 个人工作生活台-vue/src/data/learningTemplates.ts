/**
 * 文件：src/data/learningTemplates.ts
 * 说明：学习路线模板库。定义 AI 视频 12 周与全栈开发 16 周阶段、知识点和验收目标，用于一键生成学习路线。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { OutputDomain } from '@/types'

export interface LearningTemplateTopic {
  title: string
  estMinutes: number
}

export interface LearningTemplateStage {
  name: string
  goal: string
  outcome: string
  topics: LearningTemplateTopic[]
}

export interface LearningTemplate {
  id: string
  domain: OutputDomain
  name: string
  goal: string
  weeks: number
  summary: string
  stages: LearningTemplateStage[]
}

export const LEARNING_TEMPLATES: LearningTemplate[] = [
  {
    id: 'tpl_video_12w',
    domain: 'video',
    name: 'AI 视频创作 12 周路线',
    goal: '能独立完成 3 条可发布的 AI 短片，并形成一套可复用工作流',
    weeks: 12,
    summary: '从镜头语言到稳定出片，每个阶段都以一条成片验收。',
    stages: [
      {
        name: '基础表达',
        goal: '先学会用画面讲清楚一件事',
        outcome: '写出一份可拍摄的 30 秒分镜脚本',
        topics: [
          { title: '镜头语言与景别', estMinutes: 90 },
          { title: '画面构图与视觉重心', estMinutes: 90 },
          { title: '叙事结构与起承转合', estMinutes: 120 },
          { title: '分镜脚本怎么写', estMinutes: 120 },
          { title: '色彩、光影与氛围', estMinutes: 90 },
          { title: '声音、节奏与情绪', estMinutes: 90 }
        ]
      },
      {
        name: 'AI 工具链',
        goal: '把想法稳定变成可剪辑的镜头',
        outcome: '生成一组风格统一、可连续剪辑的镜头',
        topics: [
          { title: '文生图提示词结构', estMinutes: 120 },
          { title: '图生视频与首帧控制', estMinutes: 120 },
          { title: '首尾帧与镜头衔接', estMinutes: 90 },
          { title: '角色一致性', estMinutes: 120 },
          { title: '镜头运动与运镜提示', estMinutes: 90 },
          { title: '剪辑、合成与去瑕疵', estMinutes: 120 }
        ]
      },
      {
        name: '项目实战',
        goal: '用完整项目训练交付能力',
        outcome: '完成 3 条不同目标的短片',
        topics: [
          { title: '15 秒产品短片', estMinutes: 240 },
          { title: '30 秒叙事短片', estMinutes: 300 },
          { title: '同一角色三镜头连续片段', estMinutes: 240 },
          { title: '音画同步与配乐', estMinutes: 120 },
          { title: '封面、标题与发布文案', estMinutes: 90 }
        ]
      },
      {
        name: '进阶与交付',
        goal: '把能力沉淀成个人工作流',
        outcome: '形成作品集和可复用的出片 SOP',
        topics: [
          { title: '风格统一与视觉规范', estMinutes: 90 },
          { title: '素材版权与平台规范', estMinutes: 60 },
          { title: '成片交付与版本管理', estMinutes: 60 },
          { title: '复盘与作品集整理', estMinutes: 90 }
        ]
      }
    ]
  },
  {
    id: 'tpl_dev_16w',
    domain: 'dev',
    name: 'AI 全栈开发 16 周路线',
    goal: '从零完成一个带登录、数据库与 AI 能力的可上线全栈应用',
    weeks: 16,
    summary: '前端、后端、数据库、部署与 AI 应用串成一条完整项目线。',
    stages: [
      {
        name: '前端基础',
        goal: '能独立写出响应式页面',
        outcome: '完成一个可交互的响应式网页',
        topics: [
          { title: 'HTML 与 CSS 基础', estMinutes: 180 },
          { title: 'JavaScript 核心语法', estMinutes: 240 },
          { title: 'TypeScript 类型基础', estMinutes: 180 },
          { title: '浏览器、HTTP 与接口', estMinutes: 120 },
          { title: 'Git 与版本管理', estMinutes: 90 }
        ]
      },
      {
        name: '前端工程',
        goal: '能维护一个完整前端应用',
        outcome: '完成一个带路由、状态与接口的前端项目',
        topics: [
          { title: 'Vue / React 组件开发', estMinutes: 240 },
          { title: '路由与页面组织', estMinutes: 120 },
          { title: '状态管理与数据流', estMinutes: 180 },
          { title: '组件设计与样式组织', estMinutes: 120 },
          { title: '接口请求与错误处理', estMinutes: 120 },
          { title: '构建、调试与性能基础', estMinutes: 120 }
        ]
      },
      {
        name: '后端与数据',
        goal: '能设计并实现完整服务端',
        outcome: '完成一套带鉴权的 REST API 与数据库',
        topics: [
          { title: 'Node.js 服务端基础', estMinutes: 180 },
          { title: 'REST 接口设计', estMinutes: 120 },
          { title: '数据库表设计与 SQL', estMinutes: 240 },
          { title: '登录、会话与权限', estMinutes: 180 },
          { title: '文件上传与静态资源', estMinutes: 90 },
          { title: '校验、错误与日志', estMinutes: 120 }
        ]
      },
      {
        name: '工程化与部署',
        goal: '让项目稳定运行在服务器上',
        outcome: '完成一次可回滚的线上部署',
        topics: [
          { title: 'Linux 与命令行基础', estMinutes: 120 },
          { title: '环境变量与配置管理', estMinutes: 90 },
          { title: 'Docker 与容器化', estMinutes: 180 },
          { title: 'Nginx 与反向代理', estMinutes: 90 },
          { title: 'CI/CD 与自动部署', estMinutes: 120 },
          { title: '日志、监控与备份', estMinutes: 90 }
        ]
      },
      {
        name: 'AI 应用与项目',
        goal: '把 AI 能力接进真实产品',
        outcome: '上线一个可访问、可演示的全栈应用',
        topics: [
          { title: '模型接口调用与密钥管理', estMinutes: 120 },
          { title: '提示词与结构化输出', estMinutes: 120 },
          { title: '流式返回与交互体验', estMinutes: 90 },
          { title: '检索增强与知识库', estMinutes: 180 },
          { title: '效果评估、成本与安全', estMinutes: 120 },
          { title: '全栈项目实战与上线', estMinutes: 480 }
        ]
      }
    ]
  }
]

export function templatesFor(domain: OutputDomain): LearningTemplate[] {
  return LEARNING_TEMPLATES.filter((x) => x.domain === domain)
}
