/**
 * 文件：src/stores/ui.ts
 * 说明：全局 UI 状态 store。统一管理 toast、动态表单弹窗与确认弹窗，避免页面各自实现交互壳层。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi' | 'check'

export interface FieldOption {
  value: string
  label: string
}

export interface FormField {
  key: string
  label: string
  type?: FieldType
  placeholder?: string
  options?: FieldOption[]
  min?: number
  max?: number
  span?: boolean
  hint?: string
}

export type FormValues = Record<string, string | number | boolean | string[] | null>

export interface FormConfig {
  title: string
  fields: FormField[]
  values: FormValues
  submitText?: string
  onSubmit: (values: FormValues) => boolean | void | Promise<boolean | void>
}

export interface ConfirmConfig {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

export interface ToastItem {
  id: number
  message: string
  kind: 'ok' | 'err'
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const messages = ref<Array<ToastItem & { key?: string }>>([])
  const form = ref<FormConfig | null>(null)
  const confirm = ref<ConfirmConfig | null>(null)
  let seq = 0
  let toastSeq = 0

  /**
   * 轻提示：入队后 2.6 秒自动移除。
   * 每条带独立 id，避免用户连续操作时误删仍在展示的另一个 toast。
   */
  function toast(message: string, kind: 'ok' | 'err' = 'ok'): void {
    const item: ToastItem = { id: ++toastSeq, message, kind }
    toasts.value.push(item)
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== item.id)
    }, 2600)
  }

  /**
   * 带 key 的常驻提示（错误/状态条）。
   * 同 key 先清旧再入队，避免重复报同一个错误；最多保留 3 条，
   * 防止一次批量导入失败刷满屏幕。
   */
  function message(text: string, kind: 'ok' | 'err' = 'err', key = ''): void {
    if (key) {
      const same = messages.value.find((t) => t.key === key)
      if (same) messages.value = messages.value.filter((t) => t.id !== same.id)
    }
    const item: ToastItem & { key?: string } = { id: ++toastSeq, message: text, kind, key }
    messages.value.push(item)
    if (messages.value.length > 3) messages.value = messages.value.slice(-3)
    window.setTimeout(() => {
      dismissMessage(item.id)
    }, 4200)
  }

  function dismissMessage(id: number): void {
    messages.value = messages.value.filter((t) => t.id !== id)
  }

  function openForm(config: FormConfig): void {
    seq += 1
    form.value = { ...config, values: { ...config.values } }
  }

  function closeForm(): void {
    form.value = null
  }

  function askConfirm(config: ConfirmConfig): void {
    confirm.value = config
  }

  function closeConfirm(): void {
    confirm.value = null
  }

  return { toasts, messages, form, confirm, seq, toast, message, dismissMessage, openForm, closeForm, askConfirm, closeConfirm }
})
