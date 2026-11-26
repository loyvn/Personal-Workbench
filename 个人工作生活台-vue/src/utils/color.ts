/**
 * 文件：src/utils/color.ts
 * 说明：颜色计算工具。计算相对亮度与 HSL 饱和度，用于纯色背景的主题推断和卡片同色系混色比例。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

/**
 * WCAG 相对亮度：先把 sRGB 通道线性化，再按 0.2126/0.7152/0.0722 加权。
 * 支持 #rgb 与 #rrggbb；非法输入返回 null，调用方据此走兜底主题。
 */
export function relativeLuminance(hex: string): number | null {
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/**
 * 计算 HSL 饱和度（0–1）。
 * 灰度色分母为 0，直接返回 0；其余按 (max-min)/(1-|2L-1|) 计算，
 * 供 App.vue 决定卡片混入背景色的比例：越灰越可多混，越艳越要少混。
 */
export function colorSaturation(hex: string): number | null {
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6)
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  const lightness = (max + min) / 2
  if (max === min) return 0
  return (max - min) / (1 - Math.abs(2 * lightness - 1))
}

/**
 * 用纯色亮度推断应配浅色还是深色主题。
 * 阈值 0.35 是经验值：再低会误判深蓝/深棕，再高会把米色判成深色。
 */
export function themeForSolidColor(hex: string): 'light' | 'dark' | null {
  const lum = relativeLuminance(hex)
  if (lum === null) return null
  return lum >= 0.35 ? 'light' : 'dark'
}
