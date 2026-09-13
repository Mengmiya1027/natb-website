/**
 * Iconify 图标（SVG body）转 Canvas Path2D
 * Path2D 只认 path data，这里把各图形元素换算成等价 path，
 * 再按填充/描边分组合并；每个图标只解析一次
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 读取数值属性，缺省或非法时回退 */
function num(el, name, fallback = 0) {
  const raw = el.getAttribute(name)
  if (raw == null) return fallback
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}

/** 圆角矩形，无圆角时走直线 */
function rectData(x, y, w, h, rx, ry) {
  if (w <= 0 || h <= 0) return null
  if (!rx && !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  const cx = Math.min(rx || ry, w / 2)
  const cy = Math.min(ry || rx, h / 2)
  return (
    `M${x + cx} ${y}H${x + w - cx}A${cx} ${cy} 0 0 1 ${x + w} ${y + cy}` +
    `V${y + h - cy}A${cx} ${cy} 0 0 1 ${x + w - cx} ${y + h}` +
    `H${x + cx}A${cx} ${cy} 0 0 1 ${x} ${y + h - cy}` +
    `V${y + cy}A${cx} ${cy} 0 0 1 ${x + cx} ${y}Z`
  )
}

/** 顶点串 → path data，polygon 额外闭合 */
function pointsData(raw, close) {
  const list = (raw || '').trim().split(/[\s,]+/).map(Number)
  if (list.length < 4 || list.length % 2) return null
  let d = `M${list[0]} ${list[1]}`
  for (let i = 2; i < list.length; i += 2) d += `L${list[i]} ${list[i + 1]}`
  return close ? `${d}Z` : d
}

/** 单个图形元素 → path data，不支持的返回 null */
function shapeData(tag, el) {
  switch (tag) {
    case 'path':
      return el.getAttribute('d') || null
    case 'circle': {
      const cx = num(el, 'cx')
      const cy = num(el, 'cy')
      const r = num(el, 'r')
      if (r <= 0) return null
      // 两段半圆比 arcTo 更少指令
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
    }
    case 'ellipse': {
      const cx = num(el, 'cx')
      const cy = num(el, 'cy')
      const rx = num(el, 'rx')
      const ry = num(el, 'ry')
      if (rx <= 0 || ry <= 0) return null
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
    }
    case 'rect':
      return rectData(
        num(el, 'x'),
        num(el, 'y'),
        num(el, 'width'),
        num(el, 'height'),
        num(el, 'rx'),
        num(el, 'ry'),
      )
    case 'line':
      return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`
    case 'polyline':
      return pointsData(el.getAttribute('points'), false)
    case 'polygon':
      return pointsData(el.getAttribute('points'), true)
    default:
      return null
  }
}

/** 沿 DOM 树递归，属性按 SVG 规则向下继承 */
function collect(el, inherited, groups) {
  // 元素自身属性覆盖继承值
  const style = {
    fill: el.getAttribute('fill') ?? inherited.fill,
    stroke: el.getAttribute('stroke') ?? inherited.stroke,
    strokeWidth: el.getAttribute('stroke-width') ?? inherited.strokeWidth,
    lineCap: el.getAttribute('stroke-linecap') ?? inherited.lineCap,
    lineJoin: el.getAttribute('stroke-linejoin') ?? inherited.lineJoin,
  }

  const tag = el.nodeName.toLowerCase()
  if (tag !== 'g' && tag !== 'svg') {
    const d = shapeData(tag, el)
    if (d) addShape(style, d, groups)
  }
  for (const child of el.children) collect(child, style, groups)
}

/** 按填充/描边样式分组，同样式合并进同一个 Path2D */
function addShape(style, d, groups) {
  // SVG 默认 fill 为黑色，故只有显式 none 才不填充
  const paint = {
    fill: style.fill !== 'none',
    stroke: style.stroke != null && style.stroke !== 'none',
    lineWidth: Number.parseFloat(style.strokeWidth) || 1,
    lineCap: style.lineCap || 'round',
    lineJoin: style.lineJoin || 'round',
  }
  if (!paint.fill && !paint.stroke) return

  const key = `${paint.fill}|${paint.stroke}|${paint.lineWidth}|${paint.lineCap}|${paint.lineJoin}`
  let group = groups.get(key)
  if (!group) {
    group = { ...paint, path: new Path2D() }
    groups.set(key, group)
  }
  group.path.addPath(new Path2D(d))
}

/** 完整 SVG 文本 → Iconify 形状，静态图标走这里，不依赖 XMLSerializer */
export function svgToIconify(svgText) {
  if (typeof svgText !== 'string') return null
  const start = svgText.indexOf('<svg')
  const open = start < 0 ? -1 : svgText.indexOf('>', start)
  const close = svgText.lastIndexOf('</svg>')
  if (start < 0 || open < 0 || close < open) return null
  const body = svgText.slice(open + 1, close).trim()
  if (!body) return null

  const head = svgText.slice(start, open)
  const box = /viewBox\s*=\s*"([^"]+)"/.exec(head)
  const parts = box ? box[1].trim().split(/[\s,]+/).map(Number) : []
  const readSize = (name, fallback) => {
    const m = new RegExp(`${name}\\s*=\\s*"([\\d.]+)`).exec(head)
    return m ? Number.parseFloat(m[1]) : fallback
  }

  return {
    body,
    width: Number.isFinite(parts[2]) ? parts[2] : readSize('width', 24),
    height: Number.isFinite(parts[3]) ? parts[3] : readSize('height', 24),
  }
}

/**
 * Iconify icon 对象 → Canvas 绘制几何
 * @param {{body?: string, width?: number, height?: number, left?: number, top?: number}} icon
 * @returns {{width: number, height: number, left: number, top: number, groups: Array} | null}
 */
export function iconToGeometry(icon) {
  if (!icon || typeof icon.body !== 'string' || !icon.body) return null

  const doc = new DOMParser().parseFromString(
    `<svg xmlns="${SVG_NS}">${icon.body}</svg>`,
    'image/svg+xml',
  )
  const root = doc.documentElement
  if (!root || root.nodeName === 'parsererror') return null

  const groups = new Map()
  collect(root, { fill: null, stroke: null, strokeWidth: null, lineCap: null, lineJoin: null }, groups)
  if (!groups.size) return null

  return {
    width: icon.width || 24,
    height: icon.height || 24,
    left: icon.left || 0,
    top: icon.top || 0,
    groups: [...groups.values()],
  }
}
