/**
 * 位图管线接线层：把 washBake / bitmapCache / capability 接进 FeatureBigScreen 的渲染路径。
 *
 * 只有两种状态，没有第三种，也没有"按次武装"：
 *   ① 生效 —— capability 齐（WebGL2 + createImageBitmap + OffscreenCanvas）且没开
 *      「减少动效」：八面的位图烘一次、贴进每面自己的 <canvas>，常驻不重算；
 *   ② 回退 —— 上面任一条不满足：pipelineOn() 为 false，组件不挂 is-gl，
 *      模板原样走 CSS blur + <img>，一行旧代码都没动。
 *
 * 位图常驻：关闭大屏不释放（画布与位图都留着，下次开屏直接贴），
 * 只有离开 features 页（组件卸载）才 dispose。
 */
import { isWebglAvailable } from './capability'
import { ensureShot, ensureWash, getFace, onBitmapUpdate, releaseBitmaps, disposePipeline } from './bitmapCache'

let memo = null

function reduced() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  } catch {
    return false
  }
}

/** 管线是否全程生效。只算一次：探测本身要建一个 GL 上下文。 */
export function pipelineOn() {
  if (memo === null) memo = isWebglAvailable() && !reduced()
  return memo
}

/** 位图到手事件（贴画布的时机）。管线关着时是空订阅。 */
export function onFaceBitmap(fn) {
  return pipelineOn() ? onBitmapUpdate(fn) : () => {}
}

/** 该面的记录（{ wash, shot }）—— 只读 */
export function faceRecord(i) {
  return getFace(i)
}

/** 要这一面的封面模糊位图（幂等：已烘过直接命中） */
export function requestWash(i, entry) {
  if (pipelineOn()) ensureWash(i, entry)
}

/** 要这一面的截图位图。full=false 走 400 宽那一档（背面档） */
export function requestShot(i, entry, full = false) {
  if (pipelineOn()) ensureShot(i, entry, full)
}

/**
 * 把位图贴进画布：画布尺寸即位图像素尺寸（背面 400×235 那一档），
 * 布局尺寸交给 CSS（与 .face__shot / .face__wash 同一套）。
 */
export function paintBitmap(el, bmp) {
  if (!el || !bmp) return false
  if (el.width !== bmp.width) el.width = bmp.width
  if (el.height !== bmp.height) el.height = bmp.height
  const ctx = el.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(bmp, 0, 0)
  return true
}

/** 组件卸载（离开 features 页）：位图、纹理、上下文一起收 */
export function disposePipelineAll() {
  releaseBitmaps()
  disposePipeline()
}
