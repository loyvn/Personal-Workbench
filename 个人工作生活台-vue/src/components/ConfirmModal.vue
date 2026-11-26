<!--
  文件：src/components/ConfirmModal.vue
  说明：全局确认弹窗。消费 ui store 中的确认配置，等待用户确认/取消后 resolve Promise。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import BaseModal from '@/components/BaseModal.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

async function run() {
  const cfg = ui.confirm
  if (!cfg) return
  ui.closeConfirm()
  await cfg.onConfirm()
}
</script>

<template>
  <BaseModal :open="!!ui.confirm" :title="ui.confirm?.title || ''" @close="ui.closeConfirm()">
    <p style="font-size: 13.5px; line-height: 1.7">{{ ui.confirm?.message }}</p>
    <template #footer>
      <button class="btn" @click="ui.closeConfirm()">取消</button>
      <button class="btn" :class="ui.confirm?.danger === false ? 'btn-primary' : 'btn-danger'" @click="run">
        {{ ui.confirm?.confirmText || '确认' }}
      </button>
    </template>
  </BaseModal>
</template>
