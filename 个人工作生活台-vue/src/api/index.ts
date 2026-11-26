/**
 * 文件：src/api/index.ts
 * 说明：API 装配入口。根据构建环境变量在 mock 与 http 两套实现之间切换，业务层只从这里导入 api。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import type { DeskApi } from '@/api/contract'
import { mockApi } from '@/api/mock'
import { httpApi } from '@/api/http'

/** 切换点：.env 里 VITE_USE_MOCK=false 即走真实 express 接口，业务代码无需改动 */
export const useMock = (import.meta.env.VITE_USE_MOCK as string | undefined) !== 'false'

export const api: DeskApi = useMock ? mockApi : httpApi

export type { DeskApi, PingResult, SaveResult } from '@/api/contract'
