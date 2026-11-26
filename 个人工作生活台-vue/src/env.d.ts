/**
 * 文件：src/env.d.ts
 * 说明：Vue SFC 与 Vite 环境变量的类型声明入口。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
