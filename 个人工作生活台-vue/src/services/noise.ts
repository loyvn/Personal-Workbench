/**
 * 文件：src/services/noise.ts
 * 说明：Web Audio 程序化提示音。专注阶段结束用短促合成音，不加载音频文件，也不依赖系统通知权限。
 * 维护：保持单一职责；跨模块逻辑优先下沉到 services / stores / utils。
 */

let ctx: AudioContext | null = null

/**
 * 懒创建 AudioContext。
 * 浏览器要求音频必须由用户手势触发，这里只负责创建/恢复；
 * 若上下文处于 suspended，resume 返回的 Promise 被忽略，但实际调用发生在点击处理器内，可正常解锁。
 */
function ensureCtx(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/**
 * 两段短促正弦提示音。
 * 用指数衰减包络做出“叮”的收尾，避免方波/突然停止造成的爆音；
 * 工作结束音高（660/860），休息结束更低（480/680），不看系统通知权限。
 */
export function chime(kind: 'work' | 'break'): void {
  try {
    const c = ensureCtx()
    if (!c) return
    const t = c.currentTime
    const base = kind === 'break' ? 480 : 660
    ;[0, 0.14].forEach((off, i) => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.value = base + i * 200
      g.gain.setValueAtTime(0.0001, t + off)
      g.gain.linearRampToValueAtTime(i ? 0.14 : 0.22, t + off + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.9)
      o.connect(g)
      g.connect(c.destination)
      o.start(t + off)
      o.stop(t + off + 0.95)
    })
  } catch {
    /* ignore */
  }
}
