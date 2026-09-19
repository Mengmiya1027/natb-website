/**
 * 从图标源码里认出品牌主色
 * 品牌色写在图形上，不能只数颜色出现次数：渐变里的色标是死数，
 * 而一块大图形只写一次，按图形面积加权才接近肉眼观感
 * 也不直接搬品牌色：深色品牌（C++、Java）当底会闷，统一按色相重算
 */

/** 一次扫过开标签与收标签：三号位是自闭合斜杠，四号位是收尾标签名 */
const TOKEN = /<([a-zA-Z]+)\b([^>]*?)(\/?)>|<\/([a-zA-Z]+)\s*>/g
/** 数字记号，坐标全靠它算围盒 */
const NUMBER = /-?\d*\.\d+(?:e-?\d+)?|-?\d+(?:e-?\d+)?/g
/** 节点名以之为尾的就是渐变，里面的色标才是真的用色 */
const GRADIENT = /gradient$/i
/** 渐变色标节点 */
const GRADIENT_STOP = /^stop$/i

/** 固定饱和度与明度：卡片底色要压得住深色字，只让色相随品牌走 */
const SATURATION = 0.66
const LIGHTNESS = 0.5
/** 算品牌色时排除近白与近黑，它们多半是底衬和描边 */
const NEAR_WHITE = 0.92
const NEAR_BLACK = 0.14
/** 几乎透明的图形不参与配色 */
const MIN_ALPHA = 0.2
/** 单个图形的权重上限，免得一块超大底色独吞整个色相 */
const WEIGHT_CAP = 160
/** 围盒面积不满一格的按一格算，细描边也有存在感 */
const MIN_AREA = 1

/** 几何量转权重：取路径围盒面积的平方根，大块图形才压得住小碎块 */
function shapeWeightFromPath(d) {
  if (typeof d !== 'string' || !d) return 1
  return Math.min(Math.sqrt(boxArea(d)), WEIGHT_CAP)
}

/** 路径坐标的围盒面积，量不出大小就按最小值算 */
function boxArea(d) {
  const list = d.match(NUMBER)
  if (!list || list.length < 4) return MIN_AREA
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  // 数字按坐标对交替出现，奇偶各取范围
  for (let i = 0; i + 1 < list.length; i += 2) {
    const x = Number.parseFloat(list[i])
    const y = Number.parseFloat(list[i + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return MIN_AREA
  return Math.max((maxX - minX) * (maxY - minY), MIN_AREA)
}

/** 三位色值补成六位 */
function expand(hex) {
  return hex.length === 3
    ? hex
        .split('')
        .map((c) => c + c)
        .join('')
    : hex
}

/** 十六进制色值拆成三个零到一分量 */
function toRgb(hex) {
  const h = expand(hex)
  return [
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  ]
}

/** 三个分量求色相角，灰色返回空 */
function rgbHue([r, g, b]) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 0.02) return null
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/** 读填充或描边：色值给色值对象，渐变引用给编号，其余给空 */
function attrRef(attrs, name) {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(attrs)
  if (!m) return null
  const value = m[1].trim()
  // 一律去掉井号，后续按纯十六进制解析
  if (value.startsWith('#')) return { hex: value.slice(1) }
  const url = /^url\(\s*['"]?#([^)'"]+)/.exec(value)
  return url ? { id: url[1] } : null
}

/** 读编号，用来把渐变和引用它的图形对上 */
function attrId(attrs) {
  const m = /(?:^|\s)id\s*=\s*"([^"]+)"/.exec(attrs)
  return m ? m[1] : null
}

/** 读某个属性上的色值，去掉井号，取不到返回空 */
function attrHex(attrs, name) {
  const m = new RegExp(`${name}\\s*=\\s*"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})"`).exec(attrs)
  return m ? m[1] : null
}

/** 读透明度，缺省为一 */
function attrAlpha(attrs) {
  const m = /(?:fill|stroke)-opacity\s*=\s*"([\d.]+)"|opacity\s*=\s*"([\d.]+)"/.exec(attrs)
  if (!m) return 1
  const value = Number.parseFloat(m[1] ?? m[2])
  return Number.isFinite(value) ? value : 1
}

/** 色值转色相，太接近白或黑的一律不算品牌色 */
function hueOfHex(hex) {
  if (typeof hex !== 'string' || !hex) return null
  const rgb = toRgb(hex)
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  if (min >= NEAR_WHITE || max <= NEAR_BLACK) return null
  return rgbHue(rgb)
}

/** 图形权重：带路径的按几何量算，容器沿用父级 */
function shapeWeight(attrs, fallback) {
  const d = /(?:^|\s)d\s*=\s*"([^"]*)"/.exec(attrs)
  if (!d) return fallback
  return Math.max(shapeWeightFromPath(d[1]) * attrAlpha(attrs), 1)
}

/**
 * 扫描图标源码，按图形面积加权取出所有可用的色相
 * @returns {Array<{ hue: number, weight: number }>}
 */
export function sampleColors(body) {
  if (typeof body !== 'string' || !body) return []

  const samples = []
  // 根节点兼作渐变表的落脚处，子节点共用同一张表
  const root = { color: null, weight: 1, gradientId: null, gradientStops: new Map() }
  const stack = [root]

  for (const match of body.matchAll(TOKEN)) {
    if (match[4]) {
      // 收尾标签弹栈，父级色值只在真正的嵌套里继承
      if (stack.length > 1) stack.pop()
      continue
    }

    const attrs = match[2] || ''
    const tag = match[1].toLowerCase()
    const top = stack[stack.length - 1]
    const fill = attrRef(attrs, 'fill')
    const stroke = attrRef(attrs, 'stroke')
    const weight = shapeWeight(attrs, top.weight)
    const isShape = Boolean(fill || stroke)
    // 渐变本体不描边，只有其中的色标算用色
    const gradientId = !isShape && GRADIENT.test(tag) ? attrId(attrs) || true : null
    // 先登记渐变，紧随其后的色标才知道自己属于哪一支
    if (gradientId) top.gradientStops.set(gradientId, [])

    if (GRADIENT_STOP.test(tag)) {
      // 色标把颜色写在 stop-color 上，本身没有几何量，固定记一份
      const hue = hueOfHex(attrHex(attrs, 'stop-color'))
      if (hue != null) top.gradientStops.get(currentGradientId(stack))?.push({ hue })
    } else if (isShape) {
      const fillHue = fill?.hex ? hueOfHex(fill.hex) : null
      if (fillHue != null) samples.push({ hue: fillHue, weight })
      // 一块图形引用一支渐变：整块图形的量按色标数平摊，别让每个色标各拿一份
      else if (fill?.id) {
        const stops = top.gradientStops.get(fill.id) || []
        const share = weight / Math.max(stops.length, 1)
        for (const stop of stops) samples.push({ hue: stop.hue, weight: share })
      }
      // 描边只算半份，免得细边抢走主色
      const strokeHue = stroke?.hex ? hueOfHex(stroke.hex) : null
      if (strokeHue != null) samples.push({ hue: strokeHue, weight: weight * 0.5 })
    }

    const inherited = attrAlpha(attrs) < MIN_ALPHA ? null : fill?.hex || stroke?.hex || top.color
    stack.push({ color: inherited, weight, gradientId, gradientStops: top.gradientStops })
    // 自闭合标签没有收尾标签，随用随弹
    if (match[3]) stack.pop()
  }

  // 没人引用的渐变也要算上，总好过一点色都取不到
  for (const stops of root.gradientStops.values()) {
    for (const stop of stops) samples.push({ hue: stop.hue, weight: 1 })
  }

  return samples
}

/** 栈里最近的一个渐变编号，不在渐变里返回空 */
function currentGradientId(stack) {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].gradientId) return stack[i].gradientId
  }
  return null
}

/** 色相按权重合成主色：同色系先合并，领先的一块再放大优势 */
export function dominantHue(samples) {
  const tally = new Map()
  for (const { hue, weight } of samples) {
    if (typeof hue !== 'number' || !Number.isFinite(hue)) continue
    const key = Math.round(hue)
    tally.set(key, (tally.get(key) || 0) + Math.max(weight, 0))
  }
  if (!tally.size) return null

  // 权重最高的一块定调，其余同色系跟随；两块势均力敌时取中间
  const top = Math.max(...tally.values())
  let x = 0
  let y = 0
  for (const [hue, weight] of tally) {
    // 指数放大差距：越接近最高权重越按原样计入，明显偏小的迅速失声
    const share = (weight / top) ** 4
    const rad = (hue * Math.PI) / 180
    x += Math.cos(rad) * share
    y += Math.sin(rad) * share
  }
  if (!x && !y) return null
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * 主色相加偏移，换成可直接写进样式的颜色
 * @param {number} hue 色相角
 * @param {number} shift 色相偏移，用来生成同色系的亮暗两支
 * @param {number} lightness 明度，亮部调高、暗部调低
 */
export function hslColor(hue, shift = 0, lightness = LIGHTNESS) {
  return `hsl(${Math.round((hue + shift + 360) % 360)} ${Math.round(
    SATURATION * 100,
  )}% ${Math.round(lightness * 100)}%)`
}

/**
 * 图标转主题色三件套
 * @param {string} body 图标源码
 * @param {string} fallback 取不到色相时的兜底色
 * @returns {{ base: string, light: string, deep: string }}
 */
export function themeFromIcon(body, fallback) {
  const hue = dominantHue(sampleColors(body))
  if (hue == null) return { base: fallback, light: fallback, deep: fallback }
  return {
    base: hslColor(hue),
    light: hslColor(hue, -14, 0.6),
    deep: hslColor(hue, 14, 0.36),
  }
}

/** 补齐视框：图标集原始尺寸普遍偏大，统一缩到二十四再交给图标组件 */
export function normalizeIcon(body, width, height) {
  const w = Number(width) > 0 ? Number(width) : 24
  const h = Number(height) > 0 ? Number(height) : 24
  if (w === 24 && h === 24) return body
  const k = 24 / Math.max(w, h)
  const nx = ((24 - w * k) / 2).toFixed(3)
  const ny = ((24 - h * k) / 2).toFixed(3)
  return `<g transform="translate(${nx} ${ny}) scale(${k.toFixed(5)})">${body}</g>`
}
