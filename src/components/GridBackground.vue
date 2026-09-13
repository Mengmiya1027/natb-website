<script setup>
/**
 * 全屏背景：-30° 斜向无限滚动网格 + 交点图标
 * 屏幕 = R(θ)·(世界格点 + 偏移)：滚动只改偏移，格点索引不变，
 * 交点图标才不会随滚动闪烁。
 * 性能：图标先烘焙成位图，网格线合并成一条路径。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadIcon } from '@iconify/vue'
import { iconToGeometry, svgToIconify } from '../utils/iconifyPath2D'
import { GRID_ICONS } from '../utils/lucideGridIcons'

const props = defineProps({
  /** 网格旋转角，负值即横向斜向上 */
  rotation: { type: Number, default: -30 },
  /** 网格间距（CSS 像素） */
  spacing: { type: Number, default: 64 },
  /** 滚动速度（CSS 像素/秒），方向固定为屏幕左下 */
  speed: { type: Number, default: 14 },
  /** 网格线宽 */
  lineWidth: { type: Number, default: 1 },
  /** 网格线颜色，建议保持低透明度 */
  gridColor: { type: String, default: 'rgba(148, 163, 184, 0.12)' },
  /** 图标颜色 */
  iconColor: { type: String, default: 'rgba(148, 163, 184, 0.5)' },
  /** 图标边长（CSS 像素） */
  iconSize: { type: Number, default: 18 },
  /** 交点出现图标的概率，默认每个交点都有 */
  iconProbability: { type: Number, default: 1 },
  /** 图标名池，默认 25 个铺满一个 5×5 块；未内置的按需加载 */
  icons: {
    type: Array,
    default: () => [
      'lucide:rocket', 'lucide:star', 'lucide:zap', 'lucide:sparkles', 'lucide:hexagon',
      'lucide:triangle', 'lucide:circle-dot', 'lucide:globe', 'lucide:code', 'lucide:terminal',
      'lucide:database', 'lucide:cloud', 'lucide:cpu', 'lucide:layers', 'lucide:git-branch',
      'lucide:box', 'lucide:compass', 'lucide:activity', 'lucide:aperture', 'lucide:atom',
      'lucide:binary', 'lucide:bot', 'lucide:braces', 'lucide:camera', 'lucide:clock',
    ],
  },
  /** 图标是否跟随网格倾斜，默认保持水平 */
  rotateIcons: { type: Boolean, default: false },
  /** 画布层级；负值会被祖先背景盖住，故内容需更高 z-index */
  zIndex: { type: Number, default: 0 },
  /** 绘制帧率上限，滚动很慢时 30 足够，吃紧可再降 */
  fps: { type: Number, default: 30 },
  /** 像素比上限，防 4K 屏过度绘制 */
  maxDpr: { type: Number, default: 2 },
  /** 画布物理像素总量上限，超过就按比例降像素比 */
  maxPixels: { type: Number, default: 6e6 },
})

const MIN_SPACING = 12 // 间距下限，防参数给 0
const MAX_CELLS = 6000 // 单帧格点上限，超出则抽稀
const GRID_RESET = 1e6 // 偏移超过它才做整格归约，防浮点漂移
const BLOCK = 5 // 每块 5×5 个格点，块内图标不重样
const BLOCK_CACHE_MAX = 4096 // 块排列缓存上限
const SPRITE_PAD = 0.92 // 位图留白比例，防抗锯齿边缘被切
const HASH_SALT_HIT = 0x1f2e3d // 是否出图标的盐
const HASH_SALT_PICK = 0x7a5c11 // 块排列的盐
const BLOCK_KEY_STRIDE = 100003 // 块坐标打包成数字键的步长

const canvasRef = ref(null)

let ctx = null
let rafId = 0
let disposed = false
let dprNow = 0 // 上次使用的像素比
let scaleX = 1 // 画布物理像素 / CSS 像素
let scaleY = 1
let viewW = 0
let viewH = 0
let ox = 0 // 世界坐标偏移，随滚动变化
let oy = 0
let hx = 0 // 归约掉的格数，计入伪随机才能保持图标不变
let hy = 0
let lastTs = 0
let drawnAt = -1e9
let blockCount = 0 // 当前图标数量，变化时清空块缓存
let spritePx = 0 // 图标位图边长（设备像素）
let spriteColor = '' // 图标位图使用的颜色

/** 图标几何缓存：null 表示加载失败，避免反复请求 */
const geometryCache = new Map()
const loadingIcons = new Set()
/** 图标位图缓存：名字 → canvas，贴图比逐条描边快得多 */
const spriteCache = new Map()
/** 块坐标 → 块内图标索引排列 */
const blockCache = new Map()

/** 系统开启「减少动态效果」时不再滚动 */
const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

// 复用的临时对象，避免每帧产生垃圾
const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
const clipOut = [0, 0, 0, 0]

/** 格点索引 → [0,1) 伪随机，同一点永远同值 */
function hash32(i, j, salt) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** 块内索引的一种随机排列，同一块永远同序 */
function blockOrder(bi, bj) {
  const key = bi * BLOCK_KEY_STRIDE + bj
  const cached = blockCache.get(key)
  if (cached) return cached

  const count = blockCount
  const order = new Array(count)
  for (let k = 0; k < count; k++) order[k] = k
  // 块哈希播种的 Fisher-Yates，保证稳定
  let seed = (hash32(bi, bj, HASH_SALT_PICK) * 0xffffffff) >>> 0
  for (let k = count - 1; k > 0; k--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const r = (seed >>> 8) % (k + 1)
    const tmp = order[k]
    order[k] = order[r]
    order[r] = tmp
  }

  if (blockCache.size >= BLOCK_CACHE_MAX) blockCache.clear()
  blockCache.set(key, order)
  return order
}

/** 交点取图标：块内 25 个位置不重样，块间互不影响 */
function iconAt(i, j, icons) {
  const bi = Math.floor(i / BLOCK)
  const bj = Math.floor(j / BLOCK)
  const order = blockOrder(bi, bj)
  const slot = (j - bj * BLOCK) * BLOCK + (i - bi * BLOCK)
  return icons[order[slot % order.length] % icons.length]
}

/** 异步取图标并转成绘制几何，失败只记一次 */
function ensureIcon(name) {
  if (geometryCache.has(name) || loadingIcons.has(name)) return
  if (typeof name !== 'string' || !name) return
  loadingIcons.add(name)
  loadIcon(name)
    .then((icon) => {
      if (!disposed) geometryCache.set(name, iconToGeometry(icon))
    })
    .catch(() => {
      if (!disposed) geometryCache.set(name, null)
    })
    .finally(() => loadingIcons.delete(name))
}

/** 静态图标在这里成型，首帧就能画出来 */
function primeStaticIcons() {
  for (const name in GRID_ICONS) {
    if (geometryCache.has(name)) continue
    const icon = svgToIconify(GRID_ICONS[name])
    geometryCache.set(name, icon ? iconToGeometry(icon) : null)
  }
}

/** 图标几何烘焙成位图，尺寸或颜色变化时才重建 */
function buildSprite(geo) {
  const px = spritePx
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const c = canvas.getContext('2d')
  if (!c) return null

  const k = (px / Math.max(geo.width, geo.height)) * SPRITE_PAD
  c.translate(px / 2, px / 2)
  c.scale(k, k)
  c.translate(-(geo.left + geo.width / 2), -(geo.top + geo.height / 2))
  c.fillStyle = spriteColor
  c.strokeStyle = spriteColor
  for (const group of geo.groups) {
    if (group.stroke) {
      c.lineWidth = group.lineWidth
      c.lineCap = group.lineCap
      c.lineJoin = group.lineJoin
      c.stroke(group.path)
    }
    if (group.fill) c.fill(group.path)
  }
  return canvas
}

function ensureSprite(name, geo) {
  const cached = spriteCache.get(name)
  if (cached) return cached
  const sprite = buildSprite(geo)
  spriteCache.set(name, sprite)
  return sprite
}

/** 画布尺寸跟随视口与像素比，变化时才重设 */
function syncSize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const w = window.innerWidth
  const h = window.innerHeight
  if (!w || !h) return

  let dpr = Math.min(window.devicePixelRatio || 1, Math.max(1, props.maxDpr))
  // 像素总量封顶，否则 4K 屏开满像素比会把合成压垮
  const cap = Math.max(1, props.maxPixels)
  if (w * h * dpr * dpr > cap) dpr = Math.max(1, Math.sqrt(cap / (w * h)))
  if (dpr === dprNow && w === viewW && h === viewH) return

  dprNow = dpr
  viewW = w
  viewH = h
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  // 用实际比例，避免 round 带来的半像素错位
  scaleX = canvas.width / w
  scaleY = canvas.height / h
}

/** 偏移过大时扣掉整格，图案不变，索引同步补回 */
function normalizeShift(spacing) {
  if (Math.abs(ox) < GRID_RESET && Math.abs(oy) < GRID_RESET) return
  const nx = Math.round(ox / spacing)
  const ny = Math.round(oy / spacing)
  ox -= nx * spacing
  oy -= ny * spacing
  // 索引补偿：扣掉整格后同一物理点多了 nx
  hx -= nx
  hy -= ny
}

/** 滚动：屏幕位移固定向左下，再换成世界偏移 */
function advance(dt, c, s, spacing) {
  const v = reduceMotion ? 0 : props.speed
  const dx = -v * dt
  const dy = v * dt
  ox += c * dx + s * dy
  oy += -s * dx + c * dy
  normalizeShift(spacing)
}

/** 视口四角反映射，求可见区域的世界包围盒 */
function updateBounds(c, s) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k < 4; k++) {
    const px = k === 1 || k === 3 ? viewW : 0
    const py = k >= 2 ? viewH : 0
    const wx = c * px + s * py - ox
    const wy = -s * px + c * py - oy
    if (wx < minX) minX = wx
    if (wx > maxX) maxX = wx
    if (wy < minY) minY = wy
    if (wy > maxY) maxY = wy
  }
  bounds.minX = minX
  bounds.minY = minY
  bounds.maxX = maxX
  bounds.maxY = maxY
}

/** 整条直线裁到视口矩形，可见时写入 clipOut 并返回 true */
function clipToView(x0, y0, dx, dy) {
  // 下界须为负无穷，否则直线只剩半条
  let t0 = -Infinity
  let t1 = Infinity
  // 四条边各收紧一次参数区间
  for (let k = 0; k < 4; k++) {
    const p = k === 0 ? -dx : k === 1 ? dx : k === 2 ? -dy : dy
    const q = k === 0 ? x0 : k === 1 ? viewW - x0 : k === 2 ? y0 : viewH - y0
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
  }
  if (t1 < t0) return false
  clipOut[0] = x0 + t0 * dx
  clipOut[1] = y0 + t0 * dy
  clipOut[2] = x0 + t1 * dx
  clipOut[3] = y0 + t1 * dy
  return true
}

function draw(c, s, theta) {
  if (!ctx || !viewW || !viewH) return
  const spacing = Math.max(MIN_SPACING, props.spacing)
  const icons = props.icons

  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0)
  ctx.clearRect(0, 0, viewW, viewH)

  updateBounds(c, s)
  // 两端各放宽一格，免得取整漏掉贴边线
  const i0 = Math.ceil(bounds.minX / spacing) - 1
  const i1 = Math.floor(bounds.maxX / spacing) + 1
  const j0 = Math.ceil(bounds.minY / spacing) - 1
  const j1 = Math.floor(bounds.maxY / spacing) + 1

  // 间距太小则抽稀；起点对齐步长倍数，索引才稳定
  let step = 1
  while (((i1 - i0) / step) * ((j1 - j0) / step) > MAX_CELLS) step *= 2
  const startI = Math.ceil(i0 / step) * step
  const startJ = Math.ceil(j0 / step) * step

  // 网格线：合并成一条路径，只描边一次
  ctx.beginPath()
  for (let j = startJ; j <= j1; j += step) {
    const wy = j * spacing + oy
    if (clipToView(c * ox - s * wy, s * ox + c * wy, c, s)) {
      ctx.moveTo(clipOut[0], clipOut[1])
      ctx.lineTo(clipOut[2], clipOut[3])
    }
  }
  for (let i = startI; i <= i1; i += step) {
    const wx = i * spacing + ox
    if (clipToView(c * wx - s * oy, s * wx + c * oy, -s, c)) {
      ctx.moveTo(clipOut[0], clipOut[1])
      ctx.lineTo(clipOut[2], clipOut[3])
    }
  }
  ctx.strokeStyle = props.gridColor
  ctx.lineWidth = props.lineWidth
  ctx.stroke()

  if (props.iconProbability <= 0 || !icons.length) return

  // 图标数量变了就清掉块排列，免得用旧尺寸
  if (icons.length !== blockCount) {
    blockCount = icons.length
    blockCache.clear()
  }

  // 位图尺寸或颜色变了就重烘焙
  const px = Math.max(8, Math.round(Math.max(4, props.iconSize) * Math.max(scaleX, scaleY)))
  if (px !== spritePx || props.iconColor !== spriteColor) {
    spritePx = px
    spriteColor = props.iconColor
    spriteCache.clear()
  }

  const drawW = spritePx / scaleX
  const drawH = spritePx / scaleY
  const halfW = drawW / 2
  const halfH = drawH / 2
  const margin = Math.max(drawW, drawH)

  for (let j = startJ; j <= j1; j += step) {
    for (let i = startI; i <= i1; i += step) {
      // 命中判定只看世界格点，与滚动偏移无关
      const gi = i + hx
      const gj = j + hy
      if (props.iconProbability < 1 && hash32(gi, gj, HASH_SALT_HIT) >= props.iconProbability) continue
      const x = i * spacing + ox
      const y = j * spacing + oy
      const sx = c * x - s * y
      const sy = s * x + c * y
      if (sx < -margin || sy < -margin || sx > viewW + margin || sy > viewH + margin) continue

      const name = iconAt(gi, gj, icons)
      const geo = geometryCache.get(name)
      if (!geo) {
        ensureIcon(name) // 未加载完先跳过，下一帧再画
        continue
      }
      const sprite = ensureSprite(name, geo)
      if (!sprite) continue

      if (props.rotateIcons) {
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(theta)
        ctx.drawImage(sprite, -halfW, -halfH, drawW, drawH)
        ctx.restore()
      } else {
        // 贴图不碰变换栈，非旋转路径下省掉 save/restore
        ctx.drawImage(sprite, sx - halfW, sy - halfH, drawW, drawH)
      }
    }
  }
}

function frame(ts) {
  if (disposed) return
  rafId = requestAnimationFrame(frame)

  // 滚动很慢，按 fps 限流即可，省掉一半以上的重绘
  const interval = 1000 / Math.max(1, props.fps || 60)
  if (ts - drawnAt < interval - 1) return
  drawnAt = ts

  syncSize()
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.1) : 0
  lastTs = ts

  const theta = (props.rotation * Math.PI) / 180
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  advance(dt, c, s, Math.max(MIN_SPACING, props.spacing))
  draw(c, s, theta)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  if (!ctx) return
  syncSize()
  primeStaticIcons()
  props.icons.forEach(ensureIcon) // 非静态名字走异步兜底
  rafId = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  disposed = true
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  ctx = null
  geometryCache.clear()
  loadingIcons.clear()
  spriteCache.clear()
  blockCache.clear()
  blockCount = 0
  lastTs = 0
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="grid-background"
    :style="{ zIndex: props.zIndex }"
    aria-hidden="true"
  ></canvas>
</template>

<style scoped>
.grid-background {
  position: fixed;
  inset: 0;
  pointer-events: none;
  display: block;
}
</style>
