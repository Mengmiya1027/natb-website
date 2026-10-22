/**
 * 八面位图缓存 —— 这一次性能修复的正身。
 *
 * 实测瓶颈是「8 张 1600×900 截图各自解码 + 各自光栅」：TaskDuration 与 ImageDecodeTask
 * 逐 run 同步。所以这里的做法是：进大屏之前（点卡片那 ≤120ms）就把该面要用的位图
 * 一次性解到目标尺寸 —— 正面全分辨率、背面 1/4 —— 动画起跑时页面上已经只有
 * 「贴已经存在的位图」这一件事，没有解码、没有大图光栅。
 *
 * 索引键是「面序号」。记录进 Map；动画结束 / 组件卸载时 close() 位图、删纹理。
 */

import { bakeWashBitmap, disposeBaker } from './washBake'

/** 烘焙尺寸：卡片是 16:9 一档，cover 在 shader 里算，所以固定尺寸不会挪动纹理位置 */
const WASH_W = 800
/* CSS blur(10px) 作用在 .face__wash 上，那一层是卡片的 1.28 倍（inset: -14%），
   1600 宽视口下约 1728 CSS px；烘到 800 宽即 0.463 倍，σ 同比：10 × 0.463 */
const WASH_SIGMA = 4.63
const WASH_SATURATE = 1.2
/** 背面 1/4：1600 → 400 */
const SHOT_BACK_W = 400
/** 正面按屏幕宽度出图就够（源图有 2560 宽的，再大只是白烧内存与解码） */
const SHOT_FRONT_W = 0 // 原生分辨率：与 <img> 同一条重采样链

/**
 * 本轮开合是否走管线。由 features 页在点击那 ≤120ms 窗口里判定：
 * 备齐 → 起动画时就用位图；没备齐 → 这一轮干净地走旧 <img>/CSS 模糊路径，
 * 不留半生不熟的状态。位图不因此丢弃，落定后空闲里补，下次开合才用。
 */
let armed = false

export function armPipeline(on) {
  armed = !!on
}

export function isArmed() {
  return armed
}

/** i → { wash, shot, shotFull, ready } */
const faces = new Map()
/** 去重：同一 (面, 类型, 分辨率) 只跑一次 */
const inflight = new Map()
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* 订阅方自己抛错不该影响烘焙 */
    }
  })
}

/** 组件订阅位图到达事件（返回退订函数） */
export function onBitmapUpdate(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function record(i) {
  let rec = faces.get(i)
  if (!rec) {
    rec = { wash: null, washReady: false, shot: null, shotFull: false, ready: false }
    faces.set(i, rec)
  }
  return rec
}

function closeBitmap(bmp) {
  if (bmp && typeof bmp.close === 'function') {
    try {
      bmp.close()
    } catch {
      /* 已关闭 */
    }
  }
}

async function decode(url, targetW) {
  if (!url) return null
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error('取图失败 ' + res.status + ' ' + url)
  const blob = await res.blob()
  // 只给 resizeWidth：等比缩放，浏览器在解码阶段就按目标尺寸解 —— 这正是省下来的那笔
  return targetW
    ? await createImageBitmap(blob, { resizeWidth: targetW, resizeQuality: 'high' })
    : await createImageBitmap(blob)
}

function once(key, run) {
  if (inflight.has(key)) return inflight.get(key)
  const p = run().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** 烘焙某面的封面（模糊 + saturate）。已烘过 / 在途则复用。 */
export function ensureWash(i, entry) {
  const rec = record(i)
  if (rec.wash) return Promise.resolve(rec.wash)
  return once('wash:' + i, async () => {
    const bmp = await decode(entry.cover, null)
    try {
      // 高度按源图自身比例给：画布用 object-fit: cover，裁切与 legacy 逐像素同一套
      const height = Math.max(1, Math.round((WASH_W * bmp.height) / bmp.width))
      const baked = bakeWashBitmap(bmp, {
        width: WASH_W,
        height,
        sigma: WASH_SIGMA,
        saturate: WASH_SATURATE,
      })
      if (baked) {
        rec.wash = baked
        // 烘焙完成即"这一面有封面可贴"；位图本身贴进画布后会被 close()，标记留着
        rec.washReady = true
        notify()
      }
      return rec.wash
    } finally {
      closeBitmap(bmp)
    }
  }).catch((err) => {
    console.warn('[gl] 封面烘焙失败，该面沿用 CSS 模糊：', err)
    return null
  })
}

/**
 * 解某面的截图位图。full=true 用原分辨率（正面），否则 1/4（背面）。
 * 已经有同档位或更高档位的就直接返回。
 */
export function ensureShot(i, entry, full) {
  const rec = record(i)
  if (rec.shot && (rec.shotFull || !full)) return Promise.resolve(rec.shot)
  const key = 'shot:' + i + (full ? ':full' : ':q')
  return once(key, async () => {
    const bmp = await decode(entry.plate, full ? SHOT_FRONT_W : SHOT_BACK_W)
    if (!bmp) return null
    if (rec.shot && rec.shotFull && !full) {
      closeBitmap(bmp)
      return rec.shot
    }
    closeBitmap(rec.shot)
    rec.shot = bmp
    rec.shotFull = full
    notify()
    return bmp
  }).catch((err) => {
    console.warn('[gl] 截图解码失败，该面沿用 <img>：', err)
    return null
  })
}

/** 该面是否已有可直接贴的截图位图 */
export function getFace(i) {
  return faces.get(i) || null
}

/**
 * 这一面是否真的备齐了（封面烘焙完成 + 截图位图在手）。
 * 判定预热窗口成败用它，而不是 rec.wash —— 封面位图贴进画布后就被 close() 了。
 */
export function isFaceReady(i) {
  const rec = faces.get(i)
  return !!(rec && rec.washReady && rec.shot)
}

/**
 * 预热：点下卡片之后的 ≤120ms 窗口里把八面的位图备好。
 * 顺序是有讲究的 —— 正面那张先来（整屏只有它按全分辨率出镜），
 * 背面 1/4 跟着一起跑，最后才是其余几面的封面烘焙。
 * 永不 reject：调用方拿 Promise.race 卡硬上限，超时就直接起动画。
 */
export async function prewarmFaces(entries, activeIndex) {
  const list = Array.isArray(entries) ? entries : []
  const active = entries?.[activeIndex] || null
  const jobs = []
  if (active) {
    jobs.push(ensureWash(activeIndex, active))
    jobs.push(ensureShot(activeIndex, active, true))
  }
  // 背面：1/4 分辨率，代价小、但正是「8 张大图」那一笔
  for (let i = 0; i < list.length; i += 1) {
    if (i === activeIndex) continue
    jobs.push(ensureShot(i, list[i], false))
    jobs.push(ensureWash(i, list[i]))
  }
  await Promise.allSettled(jobs)
}

/** 只预热点下去的那一面（正面全分辨率）—— 展开动画真正需要的就是它 */
export async function prewarmOne(entries, i, full = true) {
  const entry = entries?.[i]
  if (!entry) return
  await Promise.allSettled([ensureWash(i, entry), ensureShot(i, entry, full)])
}

/**
 * 其余七面：等展开动画落定之后再备（1/4 分辨率）。
 * 放在动画之后是有原因的 —— 八张图的解码与首次纹理上传若和动画抢主线程，
 * 省下来的解码时间会原样还给掉帧。
 */
export async function prewarmBacks(entries, activeIndex) {
  const list = Array.isArray(entries) ? entries : []
  const jobs = []
  for (let i = 0; i < list.length; i += 1) {
    if (i === activeIndex) continue
    jobs.push(ensureWash(i, list[i]), ensureShot(i, list[i], false))
  }
  await Promise.allSettled(jobs)
}

/** 封面位图贴进画布之后就可以放掉（画布自己留着像素） */
export function closeWash(i) {
  const rec = faces.get(i)
  if (!rec || !rec.wash) return
  closeBitmap(rec.wash)
  rec.wash = null
}

/** 动画结束：位图全部放掉。画布已经持有像素，页面上看不出任何变化。 */
export function releaseBitmaps() {
  faces.forEach((rec) => {
    closeBitmap(rec.wash)
    closeBitmap(rec.shot)
    rec.wash = null
    rec.washReady = false
    rec.shot = null
    rec.shotFull = false
  })
  faces.clear()
  inflight.clear()
}

/** 组件卸载：位图 + 纹理 + 上下文一起收 */
export function disposePipeline() {
  releaseBitmaps()
  disposeBaker()
  listeners.clear()
}
