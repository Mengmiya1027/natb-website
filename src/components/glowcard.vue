<script setup>
/**
 * glowcard —— 指针跟随的光斑层（通用、可嵌套）。
 *
 * 只做一件事：一束光斑跟着指针在宿主上移动。它不接管尺寸、背景、边框——
 * 使用方给什么表面，它就在什么表面上发光。
 *
 * 两种用法：
 *   1) 当壳用（光斑盖在内容之上，适合强度不高时）：
 *      <GlowCard :intensity="0.45"><article class="card">…</article></GlowCard>
 *   2) 当卡内的一层光（光斑在卡片背景之上、文字之下）：
 *      <div class="my-card">
 *        <GlowCard class="my-card__glow" track="parent" />  <!-- 自己给 position:absolute; inset:0 -->
 *        <p class="my-card__body">…</p>                       <!-- 自己给 position:relative; z-index:1 -->
 *      </div>
 *
 * 指针范围由 track 决定：
 *   self   = 只认落在宿主上的指针（宿主自己没被盖住时用，默认）
 *   parent = 认落在父元素上的指针（光斑层被文字压住、自己收不到事件时用）
 *   window = 整个视口（全屏背景用）
 *
 * ⚠️ 未被指针覆盖时不显示光斑：alpha 归零后整层 opacity 为 0，宿主上不残留任何光。
 *    指针离开时是**渐隐**（顺着阻尼淡出），不是啪一下消失。
 *    少动效（prefers-reduced-motion）时压根不接指针，也就始终不发光。
 *
 * 性能：光斑是一个定尺寸元素，每帧只改 transform / opacity（合成层操作）——
 *      渐变只光栅化一次，不重绘、不让宿主重算样式；
 *      fpsCap 默认限到 30fps；alpha 归零后自动停帧。
 *      宿主上的 --glow-* 变量默认不写（每帧写变量会让整棵子树样式失效），要就开 exposeVars。
 */
defineOptions({ name: 'GlowCard' })

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  /** 光斑颜色 */
  glowColor: { type: String, default: '#60a5fa' },
  /** 光斑直径（px） */
  glowSize: { type: Number, default: 260 },
  /** 光斑最亮时的强度（0–1） */
  intensity: { type: Number, default: 0.72 },
  /** 渐隐位置：光斑从中心到该比例处淡尽 */
  falloff: { type: Number, default: 62 },
  /** 阻尼：每帧向目标靠拢的比例，越小越"黏"；1 = 不做平滑 */
  smoothing: { type: Number, default: 0.18 },
  /** 帧率上限：0 = 不限（默认跑满刷新率）。只在极端省电场景才需要限 */
  fpsCap: { type: Number, default: 0 },
  /** 是否渲染光斑层（要自己画就走 glow 插槽并传 false） */
  glow: { type: Boolean, default: true },
  /** 指针范围：self / parent / window */
  track: { type: String, default: 'self' },
  /** 是否把指针位置写到宿主上（--glow-x/--glow-y/--glow-a）。
   *  每帧写自定义属性会让宿主整棵子树样式失效，默认关；宿主真要用再打开 */
  exposeVars: { type: Boolean, default: false },
  /** 只保留层、不接指针（省电，或外层自己接管指针时用） */
  disabled: { type: Boolean, default: false },
})

const rootRef = ref(null)
const spotRef = ref(null)
let frame = 0 // 0 = 没在跑：静止即停帧，别让全屏背景一直烧 CPU
let lastPaint = 0 // 上一帧真正落笔的时间，用来做帧率上限
let reduced = false
let trackEl = null
let leaveEl = null
let box = null // 宿主矩形缓存：fixed 元素不随滚动变，不必每次 pointermove 都量

// 位置用宿主内的 px（光斑直径才是稳定的屏上尺寸），强度用 0–1
const cur = { x: 0, y: 0, a: 0 }
const tgt = { x: 0, y: 0, a: 0 }
const KEYS = ['x', 'y', 'a']

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** 静态参数交给内联变量：颜色、直径、渐隐点 */
const spotStyle = computed(() => ({
  '--glow-c': props.glowColor,
  '--glow-s': `${props.glowSize}px`,
  '--glow-f': `${props.falloff}%`,
}))

/** 每帧只动光斑自己：transform + opacity 都在合成层上——不重绘渐变、不让宿主重算样式。
 *  宿主上的 --glow-* 变量只在 exposeVars 打开时写（每帧写变量会让整棵子树样式失效）。 */
function paint() {
  const spot = spotRef.value
  if (spot) {
    const half = props.glowSize / 2
    spot.style.transform = `translate3d(${(cur.x - half).toFixed(1)}px, ${(cur.y - half).toFixed(1)}px, 0)`
    spot.style.opacity = (cur.a * props.intensity).toFixed(3)
  }
  if (!props.exposeVars) return
  const el = rootRef.value
  if (!el) return
  el.style.setProperty('--glow-x', `${cur.x.toFixed(1)}px`)
  el.style.setProperty('--glow-y', `${cur.y.toFixed(1)}px`)
  el.style.setProperty('--glow-a', cur.a.toFixed(3))
}

/** 立即熄灭（出厂、或系统切到少动效时用）：不走动画，一步到位 */
function darken() {
  tgt.a = 0
  cur.a = 0
  paint()
}

function animate(ts) {
  frame = 0
  if (!rootRef.value) return
  // 帧率上限：这一帧还不够数就先不落笔，下一帧再来——代价减半、肉眼无差
  const gap = props.fpsCap > 0 ? 1000 / props.fpsCap : 0
  if (gap > 1 && ts - lastPaint < gap - 1.5) {
    frame = requestAnimationFrame(animate)
    return
  }
  lastPaint = ts
  const k = clamp(props.smoothing, 0.02, 1)
  for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k
  const settled =
    Math.abs(tgt.x - cur.x) < 0.3 && Math.abs(tgt.y - cur.y) < 0.3 && Math.abs(tgt.a - cur.a) < 0.002
  if (settled) for (const key of KEYS) cur[key] = tgt[key]
  paint()
  if (!settled) frame = requestAnimationFrame(animate)
}

function kick() {
  if (!frame && !props.disabled && !reduced) frame = requestAnimationFrame(animate)
}

function measure() {
  box = rootRef.value?.getBoundingClientRect() ?? null
}

function onMove(event) {
  if (!rootRef.value || props.disabled || reduced) return
  if (!box) measure()
  if (!box) return
  tgt.x = event.clientX - box.left
  tgt.y = event.clientY - box.top
  tgt.a = 1
  kick()
}

/** 指针离开：只把目标压到 0，光斑顺着阻尼渐隐——不是啪一下就没 */
function onLeave() {
  if (props.disabled) return
  tgt.a = 0
  kick()
}

/** 系统里切换"少动效"：切过去就熄灭停住，切回来把光交还给指针 */
function onMotionPref(event) {
  reduced = event.matches
  if (reduced) {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    darken()
  } else {
    kick()
  }
}

function bind() {
  const self = rootRef.value
  if (!self || props.disabled) return
  if (props.track === 'window') {
    trackEl = window
    leaveEl = document.documentElement
  } else if (props.track === 'parent' && self.parentElement) {
    trackEl = self.parentElement
    leaveEl = self.parentElement
  } else {
    trackEl = self
    leaveEl = self
  }
  trackEl.addEventListener('pointermove', onMove, { passive: true })
  leaveEl.addEventListener('pointerleave', onLeave)
  leaveEl.addEventListener('pointercancel', onLeave)
  if (props.track === 'window') window.addEventListener('resize', measure)
}

function unbind() {
  trackEl?.removeEventListener('pointermove', onMove)
  leaveEl?.removeEventListener('pointerleave', onLeave)
  leaveEl?.removeEventListener('pointercancel', onLeave)
  window.removeEventListener('resize', measure)
  trackEl = null
  leaveEl = null
}

let mq = null

onMounted(() => {
  // 触屏 / 无精确指针：没有鼠标可跟，光斑既没意义又费电，整体不启动
  if (window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === false) return
  mq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  reduced = mq?.matches ?? false
  measure()
  // 出厂即熄灭：没有指针覆盖时，宿主上一个光点都不该有
  darken()
  bind()
  mq?.addEventListener?.('change', onMotionPref)
})

onBeforeUnmount(() => {
  unbind()
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  mq?.removeEventListener?.('change', onMotionPref)
})
</script>

<template>
  <div ref="rootRef" class="glow">
    <!-- 默认插槽：光斑在它之上（当"壳"用时的形态） -->
    <slot />

    <!-- 光斑层：定尺寸 + transform 跟随；未覆盖时整层 opacity 为 0 -->
    <span v-if="glow" ref="spotRef" class="glow__spot" aria-hidden="true" :style="spotStyle" />
    <slot name="glow" />
  </div>
</template>

<style scoped>
/* 壳自己不设尺寸、不设背景：只提供一个定位上下文 */
.glow {
  position: relative;
}

.glow__spot {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--glow-s, 260px);
  height: var(--glow-s, 260px);
  pointer-events: none;
  /* 出厂不可见；有指针覆盖时才由 JS 抬起来 */
  opacity: 0;
  /* 单独一层：每帧只动它，渐变只光栅化一次 */
  will-change: transform, opacity;
  background: radial-gradient(circle closest-side, var(--glow-c, #60a5fa), transparent var(--glow-f, 62%));
}
</style>
