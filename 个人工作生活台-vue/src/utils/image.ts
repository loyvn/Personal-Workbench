/**
 * 文件：src/utils/image.ts
 * 说明：图片处理工具。读取图片、按长边缩放到 1440、逐步压缩到 500 KB 内，并返回 dataURL 与体积信息。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

/** 背景图上传：格式 / 体积校验、等比缩放、质量递减，最终产出 dataURL */

export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_RESULT_BYTES = 500 * 1024
export const HARD_LIMIT_BYTES = 600 * 1024
export const MAX_URL_LENGTH = 2000

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl.length
  const b64 = dataUrl.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

export function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

async function loadBitmap(file: File): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return {
        w: bmp.width,
        h: bmp.height,
        draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
        close: () => bmp.close()
      }
    } catch {
      /* 落到 Image 分支 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('这张图读不出来，换一张试试'))
      el.src = url
    })
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url)
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

/**
 * 两阶段压缩：先降尺寸，再降 JPEG 质量。
 * 顺序不能反：大图保持原尺寸时即使质量降到 0.5 也很容易超过 500 KB；
 * 1440/1200/1024 三档从高到低尝试，命中 500 KB 就返回，否则保底 600 KB 内接受。
 * 画布先铺米白底，避免 PNG 透明区域转 JPEG 后变成黑块。
 */
export async function compressImage(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error('只支持 JPG / PNG / WebP')
  if (file.size > MAX_FILE_BYTES) throw new Error('原图超过 15 MB，先裁一下再传')

  const bmp = await loadBitmap(file)
  try {
    const sizes = [1440, 1200, 1024]
    let best = ''
    for (const maxSide of sizes) {
      const scale = Math.min(1, maxSide / Math.max(bmp.w, bmp.h))
      const w = Math.max(1, Math.round(bmp.w * scale))
      const h = Math.max(1, Math.round(bmp.h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('浏览器不支持图片处理')
      ctx.fillStyle = '#fbfaf7'
      ctx.fillRect(0, 0, w, h)
      bmp.draw(ctx, w, h)
      for (let q = 0.85; q >= 0.5; q -= 0.05) {
        const url = canvas.toDataURL('image/jpeg', Number(q.toFixed(2)))
        if (dataUrlBytes(url) <= MAX_RESULT_BYTES) return url
        best = url
      }
      if (dataUrlBytes(best) > HARD_LIMIT_BYTES) continue
      return best
    }
    if (best && dataUrlBytes(best) <= HARD_LIMIT_BYTES) return best
    throw new Error('这张图压完仍超过 600 KB，换一张分辨率低些的')
  } finally {
    bmp.close()
  }
}

export function isHttpImageUrl(input: string): boolean {
  const v = input.trim()
  if (v.length === 0 || v.length > MAX_URL_LENGTH) return false
  if (!/^https?:\/\//i.test(v)) return false
  try {
    const u = new URL(v)
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname)
  } catch {
    return false
  }
}

/** 预加载，确认地址真的能用；超时或失败抛错 */
export function preloadImage(src: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    let done = false
    const finish = (err?: Error) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      el.onload = null
      el.onerror = null
      if (err) reject(err)
      else resolve()
    }
    const timer = window.setTimeout(() => finish(new Error('图片加载超时，检查地址或网络')), timeoutMs)
    el.onload = () => finish()
    el.onerror = () => finish(new Error('这个地址加载不到图片'))
    el.src = src
  })
}
