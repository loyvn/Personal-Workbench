<!--
  文件：src/components/BaseModal.vue
  说明：通用弹窗外壳。提供遮罩、标题、关闭按钮和默认插槽，统一处理点击遮罩与 Esc 关闭。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; title: string; wide?: boolean }>(), { wide: false })
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div v-if="open" class="modal-mask" @click.self="$emit('close')">
    <div class="modal" :class="{ wide }">
      <div class="mh">
        <h3>{{ title }}</h3>
        <button class="xbtn" aria-label="关闭" @click="$emit('close')">×</button>
      </div>
      <div class="mb">
        <slot />
      </div>
      <div v-if="$slots.footer" class="mf">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
