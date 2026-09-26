<script setup>
/**
 * Ink-Splatter-Cursor —— 指针光标图标 + 烟花（通用）。
 *
 * 指针本身交给 CSS：用 cursor: url(内联 SVG) 把系统光标换成一颗白色圆点。
 * 图标由**系统合成器**绘制，不经过 JS、不经过 DOM 合成管线——
 * 因此和原生光标一样跟手，没有"慢半拍"。粒子与它无关，仍由那块透明 canvas 画。
 *
 *   <InkSplatterCursor :colors="['#ffffff', '#7aa7ff']" :dot-size="20" />
 *
 * 光标规则是现做现注入的一个 <style>（尺寸、颜色都来自 props），
 * 组件卸载即撤掉、系统光标原样还回去。
 * 少动效（prefers-reduced-motion）时仍然换光标图标，只是不启动粒子。
 *
 * 画布性能：拖尾用 destination-out 擦除（不是糊底色，内容永不被盖住），
 * 擦除可隔帧做、粒子数封顶、指针停下且粒子散尽即停帧。
 */
defineOptions({ name: 'InkSplatterCursor' })

import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  /** 粒子颜色池：每颗随机取一个 */
  colors: { type: Array, default: () => ['#ffffff', '#7aa7ff'] },
  /** 是否把系统光标换成圆点图标 */
  dot: { type: Boolean, default: true },
  /** 光标图标颜色 */
  dotColor: { type: String, default: '#ffffff' },
  /** 光标图标直径（px） */
  dotSize: { type: Number, default: 20 },
  /** 每次移动喷出的粒子数 */
  spawnRate: { type: Number, default: 2 },
  /** 触发喷溅的最小指针速度（px/帧） */
  minSpeed: { type: Number, default: 3 },
  /** 粒子基础半径 */
  blobSize: { type: Number, default: 4 },
  /** 每帧透明度衰减：越大越短命 */
  decay: { type: Number, default: 0.02 },
  /** 速度摩擦：越小越"黏" */
  friction: { type: Number, default: 0.9 },
  /** 拖尾强度（0 = 不留拖尾） */
  trail: { type: Number, default: 0.24 },
  /** 拖尾擦除间隔帧数：2 即每两帧擦一次（等效浓度不变，代价减半） */
  trailEvery: { type: Number, default: 2 },
  /** 粒子数上限：封顶防越积越多 */
  maxBlobs: { type: Number, default: 260 },
  /** 画布像素比上限：粒子要清晰，跟到 2× */
  maxDpr: { type: Number, default: 2 },
  /** 画布层级：粒子在最上层，但从不吃指针事件 */
  zIndex: { type: Number, default: 60 },
  /** 冻结粒子绘制（比如大窗展开时） */
  paused: { type: Boolean, default: false },
})

const HIDE_CLASS = 'is-ink-cursor'
const STYLE_ID = 'ink-cursor-style'
const canvasRef = ref(null)
let cleanup = () => {}

/** 把圆点做成 SVG 再交给 cursor: url(...)——让系统去画，才是真跟手 */
function cursorRule() {
  const d = Math.max(4, Math.round(props.dotSize))
  const half = d / 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}">` +
    `<circle cx="${half}" cy="${half}" r="${half}" fill="${props.dotColor}"/></svg>`
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  // 末尾的 auto 是兜底：这套浏览器不认这个图标时，退回系统箭头
  return `cursor: ${uri} ${half} ${half}, auto !important;`
}

function applyCursor() {
  if (!props.dot) return
  document.documentElement.classList.add(HIDE_CLASS)
  let el = document.getElementById(STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = `html.${HIDE_CLASS}, html.${HIDE_CLASS} * { ${cursorRule()} }`
}

function dropCursor() {
  document.getElementById(STYLE_ID)?.remove()
  document.documentElement.classList.remove(HIDE_CLASS)
}

onMounted(() => {
  // 触屏 / 无精确指针：既不换光标（没有光标可换），也不溅粒子
  if (window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === false) return
  // 光标图标与动画无关：少动效也照换，只是不启动粒子
  applyCursor()

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  if (reduce) {
    cleanup = dropCursor
    return
  }

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  const mouse = { x: null, y: null, px: null, py: null }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, Math.max(0.5, props.maxDpr))
  // 光标本体由系统画，这里只收样本喂粒子；有 pointerrawupdate 就用它（样本更密）
  const moveEvent = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove'
  let frame = 0
  let tick = 0
  let trailTick = 0
  let lastMove = 0
  let width = 0
  let height = 0
  let blobs = []

  function resize() {
    const rect = canvas.getBoundingClientRect()
    width = rect.width
    height = rect.height
    canvas.width = Math.max(1, Math.floor(width * pixelRatio))
    canvas.height = Math.max(1, Math.floor(height * pixelRatio))
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  }

  /** 透明画布上的拖尾：擦掉一部分旧像素，而不是糊一层底色。
   *  每 trailEvery 帧擦一次——等效浓度一样，全屏像素操作却少一半。 */
  function fadeTrail() {
    trailTick += 1
    if (props.trail <= 0) {
      ctx.clearRect(0, 0, width, height)
      return
    }
    if (trailTick % Math.max(1, props.trailEvery) !== 0) return
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = `rgba(0, 0, 0, ${props.trail})`
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }

  function spawn(x, y, vx, vy, speed) {
    const palette = props.colors.length ? props.colors : ['#ffffff']
    for (let i = 0; i < props.spawnRate; i += 1) {
      const angle = Math.atan2(vy, vx) + (Math.random() - 0.5) * 0.8
      blobs.push({
        x,
        y,
        vx: Math.cos(angle) * (2 + Math.random() * speed * 0.3),
        vy: Math.sin(angle) * (2 + Math.random() * speed * 0.3),
        r: props.blobSize * (0.5 + Math.random()),
        alpha: 1,
        color: palette[Math.floor(Math.random() * palette.length)],
      })
    }
    // 封顶：宁可丢掉最老的几颗，也不让数组无限长
    const cap = Math.max(8, props.maxBlobs)
    if (blobs.length > cap) blobs.splice(0, blobs.length - cap)
  }

  function draw() {
    frame = 0
    if (props.paused) return
    // 指针停了、粒子也散尽了：画完这一帧就收工，下一次移动再唤醒
    const idle = blobs.length === 0 && performance.now() - lastMove > 500

    fadeTrail()

    if (mouse.x !== null && mouse.px !== null) {
      const vx = mouse.x - mouse.px
      const vy = mouse.y - mouse.py
      const speed = Math.hypot(vx, vy)
      if (speed > props.minSpeed) spawn(mouse.x, mouse.y, vx, vy, speed)
    }

    blobs = blobs.filter((blob) => {
      blob.x += blob.vx
      blob.y += blob.vy
      blob.vx *= props.friction
      blob.vy *= props.friction
      blob.alpha -= props.decay
      blob.r *= 0.99

      if (blob.alpha <= 0) return false

      ctx.globalAlpha = Math.max(0, Math.min(1, blob.alpha))
      ctx.beginPath()
      ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2)
      ctx.fillStyle = blob.color
      ctx.fill()
      ctx.globalAlpha = 1
      return true
    })

    mouse.px = mouse.x
    mouse.py = mouse.y
    tick += 1

    if (!idle) frame = requestAnimationFrame(draw)
  }

  function kick() {
    if (!frame && !props.paused) frame = requestAnimationFrame(draw)
  }

  function move(event) {
    // 一帧里可能攒了好几个样本：取最后一个，别用被合并过的那一个
    const list = event.getCoalescedEvents?.()
    const p = list && list.length ? list[list.length - 1] : event
    mouse.x = p.clientX
    mouse.y = p.clientY
    lastMove = performance.now()
    kick()
  }

  function leave() {
    mouse.x = null
    mouse.y = null
    mouse.px = null
    mouse.py = null
  }

  function onResize() {
    resize()
    kick()
  }

  resize()
  draw()
  window.addEventListener(moveEvent, move, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('resize', onResize)

  cleanup = () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener(moveEvent, move)
    document.documentElement.removeEventListener('pointerleave', leave)
    window.removeEventListener('resize', onResize)
    dropCursor()
  }
})

onBeforeUnmount(() => cleanup())
</script>

<template>
  <!-- 烟花：不接收指针事件，页面交互一切照旧。光标本体不在这里——它是 CSS cursor -->
  <canvas
    ref="canvasRef"
    class="splatter"
    aria-hidden="true"
    :style="{ zIndex: String(zIndex) }"
  />
</template>

<style scoped>
.splatter {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
