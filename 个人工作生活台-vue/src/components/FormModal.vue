<!--
  文件：src/components/FormModal.vue
  说明：通用动态表单弹窗。根据 ui.openForm 传入的字段 schema 渲染输入、选择、多选与勾选，提交结果回传给调用方。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { reactive, watch } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import { useUiStore } from '@/stores/ui'
import type { FormValues } from '@/stores/ui'

const ui = useUiStore()
/* 表单值由后端/调用方决定结构，这里只做透传 */
const values = reactive<Record<string, any>>({})

watch(
  () => ui.form,
  (cfg) => {
    Object.keys(values).forEach((k) => delete values[k])
    if (!cfg) return
    Object.entries(cfg.values).forEach(([k, v]) => {
      values[k] = Array.isArray(v) ? [...v] : v
    })
    cfg.fields.forEach((f) => {
      if (values[f.key] === undefined) {
        values[f.key] = f.type === 'check' ? false : f.type === 'multi' ? [] : ''
      }
    })
  },
  { immediate: true }
)

async function submit() {
  const cfg = ui.form
  if (!cfg) return
  const result = await cfg.onSubmit({ ...values } as FormValues)
  if (result !== false) ui.closeForm()
}
</script>

<template>
  <BaseModal :open="!!ui.form" :title="ui.form?.title || ''" @close="ui.closeForm()">
    <form v-if="ui.form" class="fields" :class="{ two: ui.form.fields.length > 3 }" @submit.prevent="submit">
      <div
        v-for="f in ui.form.fields"
        :key="f.key"
        :class="{ span2: f.span || f.type === 'textarea' || f.type === 'multi' }"
      >
        <label class="lbl">{{ f.label }}</label>

        <textarea
          v-if="f.type === 'textarea'"
          v-model="values[f.key]"
          :placeholder="f.placeholder || ''"
        />

        <select v-else-if="f.type === 'select'" v-model="values[f.key]">
          <option v-for="o in f.options || []" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <select
          v-else-if="f.type === 'multi'"
          v-model="values[f.key]"
          multiple
          size="4"
          style="min-height: 76px"
        >
          <option v-for="o in f.options || []" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <label v-else-if="f.type === 'check'" class="switch">
          <input v-model="values[f.key]" type="checkbox" />
          <i />{{ f.hint || '开启' }}
        </label>

        <input
          v-else-if="f.type === 'number'"
          v-model="values[f.key]"
          type="number"
          :min="f.min"
          :max="f.max"
          :placeholder="f.placeholder || ''"
        />

        <input
          v-else-if="f.type === 'date'"
          v-model="values[f.key]"
          type="date"
        />

        <input
          v-else
          v-model="values[f.key]"
          type="text"
          :placeholder="f.placeholder || ''"
        />

        <div v-if="f.type === 'multi'" style="font-size: 11px; color: var(--muted); margin-top: 4px">
          {{ f.hint || '按住 Ctrl / Cmd 可多选' }}
        </div>
      </div>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <button class="btn" @click="ui.closeForm()">取消</button>
      <button class="btn btn-primary" @click="submit">{{ ui.form?.submitText || '保存' }}</button>
    </template>
  </BaseModal>
</template>
