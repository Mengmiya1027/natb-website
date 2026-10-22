/**
 * 点击那一帧之外才该做的事。
 *
 * 大屏那一次开合的费用原本全压在点击的同一帧里：量 16 格几何、挂载整棵子树、
 * 解码 16 张图。这些都不必在点击帧发生 —— 用户此刻只看得见被点的那一格。
 */

/**
 * 空闲时再跑。requestIdleCallback 是这里唯一想要的语义（浏览器自己决定什么时候有空）；
 * 没有它的环境退回 1ms 的 setTimeout，顺序对、只是不挑时机。
 * @param {() => void} fn
 * @param {number} timeout 兜底：再忙也在这个毫秒数内跑一次
 * @returns {() => void} 取消用
 */
export function whenIdle(fn, timeout = 800) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => fn(), { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 1)
  return () => window.clearTimeout(id)
}

/**
 * 纯预热：把位图的解码提前做掉，动画开始时浏览器不必再解码。
 * 只碰 Image 对象，不动任何 DOM 结构与尺寸。
 * @param {string[]} urls
 */
export function predecodeImages(urls) {
  for (const url of urls) {
    if (!url) continue
    const img = new Image()
    img.decoding = 'sync'
    img.src = url
    // 解码失败（404 / 未落地）不影响任何东西，静默跳过
    if (typeof img.decode === 'function') img.decode().catch(() => {})
  }
}
