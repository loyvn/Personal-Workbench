<!--
  文件：src/components/BoundIdeas.vue
  说明：灵感绑定列表。按实体 id 查询关联灵感/摘要，折叠展示前两条，并允许在详情弹窗内解除绑定。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDeskStore } from '@/stores/desk'
import type { BindModule } from '@/types'

const props = defineProps<{ module: BindModule; targetId: string }>()
const store = useDeskStore()
const expanded = ref(false)

const items = computed(() => {
  const s = store.data
  const list: Array<{ key: string; type: string; label: string; extra: string }> = []
  for (const x of s.ideas) {
    if (!(x.bindings || []).some((b) => b.module === props.module && b.id === props.targetId)) continue
    list.push({
      key: `idea-${x.id}`,
      type: '灵感',
      label: x.title || x.text || x.url || '图片',
      extra: x.text && x.title ? x.text : ''
    })
  }
  for (const x of s.summaries) {
    if (!(x.bindings || []).some((b) => b.module === props.module && b.id === props.targetId)) continue
    list.push({
      key: `summary-${x.id}`,
      type: '摘要',
      label: x.title,
      extra: x.judgement || (x.points || [])[0] || ''
    })
  }
  return list
})

const shown = computed(() => (expanded.value ? items.value : items.value.slice(0, 2)))
</script>

<template>
  <div v-if="items.length" class="bound-ideas">
    <div class="bound-head">
      <span>关联灵感与摘要</span>
      <span class="bound-count">{{ items.length }}</span>
      <button v-if="items.length > 2" class="bound-more" @click="expanded = !expanded">
        {{ expanded ? '收起' : '全部' }}
      </button>
    </div>
    <div v-for="it in shown" :key="it.key" class="bound-row">
      <span class="tag soft bound-type">{{ it.type }}</span>
      <span class="bound-text" :title="it.extra || it.label">{{ it.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.bound-ideas {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px dashed var(--line);
}

.bound-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}

.bound-count {
  font-family: var(--mono);
  color: var(--green);
}

.bound-more {
  margin-left: auto;
  border: 0;
  background: none;
  padding: 0;
  font-size: 11px;
  color: var(--green);
  cursor: pointer;
}

.bound-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  min-width: 0;
}

.bound-type {
  flex: none;
  font-size: 10px;
  padding: 1px 5px;
}

.bound-text {
  min-width: 0;
  font-size: 11.5px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
