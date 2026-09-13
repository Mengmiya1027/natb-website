/**
 * 复刻 masoneffect 的文字栅格布局，让静态字对齐粒子字。
 * 对应 TextToParticle.buildTargets，升级库时要核对。
 */
const MIN_FONT_SIZE = 12
const CANVAS_PADDING = 40
const MAX_CANVAS_SIZE = 4096
const CHAR_SPACING = 0.05 // 相对字号
const LINE_GAP = 0.1 // 相对字号

function createCtx() {
  return document.createElement('canvas').getContext('2d')
}

function applyFont(ctx, weight, family, size) {
  ctx.font = `${weight} ${size}px ${family}`
}

function measureFit(ctx, weight, family, size, text, maxWidth, maxHeight) {
  applyFont(ctx, weight, family, size)
  const lines = text.split('\n')
  const spacing = size * CHAR_SPACING
  let widest = 0
  for (const line of lines) {
    if (!line) continue
    const width = ctx.measureText(line).width + spacing * Math.max(0, line.length - 1)
    if (width > widest) widest = width
  }
  const height = size * lines.length + size * LINE_GAP * Math.max(0, lines.length - 1)
  return widest <= maxWidth && height <= maxHeight
}

// 二分逼近能塞进画布的最大字号，与原库一致
function findFontSize(ctx, weight, family, text, maxWidth, maxHeight, initial) {
  if (measureFit(ctx, weight, family, initial, text, maxWidth, maxHeight)) return initial
  if (initial <= MIN_FONT_SIZE) return MIN_FONT_SIZE
  let low = MIN_FONT_SIZE
  let high = initial
  let best = MIN_FONT_SIZE
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (measureFit(ctx, weight, family, mid, text, maxWidth, maxHeight)) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

/**
 * @param {{width:number,height:number,dpr:number,text:string,fontFamily:string,fontWeight:number|string}} options
 * width/height 为 CSS 像素，返回坐标在画布像素空间，需除以 ratio。
 */
export function measureTextLayout({ width, height, dpr, text, fontFamily, fontWeight }) {
  let canvasW = Math.floor(width * dpr)
  let canvasH = Math.floor(height * dpr)
  let ratio = dpr
  if (canvasW > MAX_CANVAS_SIZE || canvasH > MAX_CANVAS_SIZE) {
    const scale = Math.min(MAX_CANVAS_SIZE / canvasW, MAX_CANVAS_SIZE / canvasH)
    canvasW = Math.floor(canvasW * scale)
    canvasH = Math.floor(canvasH * scale)
    ratio = canvasW / width
  }

  const ctx = createCtx()
  const initial = Math.max(80, Math.floor(Math.min(canvasW, canvasH) * 0.18))
  const fontSize = findFontSize(
    ctx,
    fontWeight,
    fontFamily,
    text,
    canvasW - CANVAS_PADDING * 2,
    canvasH - CANVAS_PADDING * 2,
    initial,
  )

  applyFont(ctx, fontWeight, fontFamily, fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines = text.split('\n')
  const lineHeight = fontSize
  const lineGap = fontSize * LINE_GAP
  const spacing = fontSize * CHAR_SPACING
  const totalHeight = lineHeight * lines.length + lineGap * Math.max(0, lines.length - 1)
  let centerY = canvasH / 2 - totalHeight / 2 + lineHeight / 2

  const chars = []
  let offsetX = 0
  let offsetTaken = false
  for (const line of lines) {
    if (line) {
      const logicalWidth = ctx.measureText(line).width + spacing * Math.max(0, line.length - 1)
      let x = canvasW / 2 - logicalWidth / 2
      let drawn = 0
      for (const ch of line) {
        const charWidth = ctx.measureText(ch).width
        chars.push({ ch, x: x + charWidth / 2, y: centerY })
        x += charWidth + spacing
        drawn += charWidth + spacing
      }
      // 库按整行定起点却逐字符落笔，整行会右偏
      if (!offsetTaken) {
        offsetX = (drawn - spacing - logicalWidth) / 2
        offsetTaken = true
      }
    }
    centerY += lineHeight + lineGap
  }

  // letterSpacing 是字间额外间距（画布像素），要与真标题对齐
  return { ratio, fontSize, letterSpacing: spacing, canvasW, canvasH, chars, offsetX }
}
