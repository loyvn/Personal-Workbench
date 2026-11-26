<!--
  文件：src/components/Icon.vue
  说明：统一 SVG 图标组件。按 name 从内置图标表取 path，控制尺寸与描边，避免页面散落重复 SVG。
  维护：修改本文件时同步更新 README 的页面结构说明。
-->

<script setup lang="ts">
const props = defineProps<{ name: string; size?: number }>()

const ICONS: Record<string, string> = {
  home: 'M4 11l8-6 8 6v9h-16z',
  tasks: 'M4 6h16M4 12h16M4 18h10',
  focus: 'M12 7v5l4 2M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0',
  music: 'M9 18V5l10-2v11M9 18a3 3 0 1 1-3-3M19 14a3 3 0 1 1-3-3',
  habits: 'M5 12l4 4 10-10',
  fitness: 'M4 14h4l3-8 3 8h4',
  media: 'M5 5h14v14H5zM9 9h6v6H9z',
  novel: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z',
  output: 'M4 7h16M4 12h10M4 17h6',
  learning: 'M12 5l9 4-9 4-9-4zM7 10v5c0 2 10 2 10 0v-5',
  dev: 'M8 7L4 12l4 5M16 7l4 5-4 5M14 4l-4 16',
  reading: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5zM20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5A2.5 2.5 0 0 1 20 21.5z',
  ideas: 'M9 18h6M10 21h4M12 3a6 6 0 0 1 4 10c-1 1-1 2-1 2h-6s0-1-1-2a6 6 0 0 1 4-10z',
  favorites: 'M6 4h12v17l-6-4-6 4z',
  leisure: 'M5 5h14v14H5zM9 9l6 6M15 9l-6 6',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 4v2M12 18v2M4 12h2M18 12h2',
  data: 'M5 7c0-2 14-2 14 0s-14 2-14 0zM5 7v10c0 2 14 2 14 0V7M5 12c0 2 14 2 14 0',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2',
  moon: 'M15 4a8 8 0 1 0 5 12 6 6 0 0 1-5-12z',
  backup: 'M12 4v10M8 10l4 4 4-4M5 18h14'
}
</script>

<template>
  <svg :width="props.size || 17" :height="props.size || 17" viewBox="0 0 24 24" aria-hidden="true">
    <path
      :d="ICONS[props.name] || ICONS.home"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
