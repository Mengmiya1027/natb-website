<script setup>
/**
 * 3dcard —— 指针跟随的 3D 倾斜壳（通用、可嵌套）。
 *
 * 它只做一件事：把宿主按指针位置做轻微 3D 倾斜，并让一束光斑跟着指针走。
 * 内容、尺寸、配色全部交给使用方——默认插槽里放什么，就倾斜什么。
 * 因此它能套在背景层、声明卡、面板、图表上，也能再套一层自己（嵌套使用）。
 *
 *   <!-- 普通卡片：指针落在自己身上才倾斜 -->
 *   <TiltCard :max-tilt="14">
 *     <article class="pricing">…</article>
 *   </TiltCard>
 *
 *   <!-- 全屏背景：指针在页面任何地方移动都倾斜（track="window"） -->
 *   <TiltCard track="window" :max-tilt="10" :scale="1" :glare="false">
 *     <div class="bg">…</div>
 *   </TiltCard>
 *
 * 换光斑：用 glare 具名插槽；不要光斑：传 :glare="false"。
 * 少动效（prefers-reduced-motion）或 disabled 时组件完全不动，停在正中姿态。
 *
 * 性能：每帧只写宿主自己的 transform（合成层操作，不重绘、不让子树失效）；
 *      光斑没开时一个多余属性都不写；fpsCap 默认限到 30fps（跟随类效果肉眼无差、代价减半）；
 *      姿态贴到目标就自动停帧，静止时一分钱不花。
 *
 * ⚠️ 壳会写 transform，因此会成为后代 position:fixed 的包含块：
 *    要放 fixed 内容，请把它交给外层容器定位，壳内一律用 absolute。
 */
defineOptions({ name: 'TiltCard' })

import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  /** 单侧最大倾斜角（度）：指针贴到某条边时达到；0 = 完全不倾斜 */
  maxTilt: { type: Number, default: 18 },
  /** 透视距离（px）：越小越"贴脸"，透视越夸张 */
  perspective: { type: Number, default: 900 },
  /** 指针进入后的放大倍率：1 = 不放大 */
  scale: { type: Number, default: 1.04 },
  /** 阻尼：每帧向目标靠拢的比例，越小越"重"；1 = 不做平滑 */
  smoothing: { type: Number, default: 0.14 },
  /** 帧率上限：0 = 不限（默认跑满刷新率）。只在极端省电场景才需要限 */
  fpsCap: { type: Number, default: 0 },
  /** 内置光斑最亮时的不透明度：0 = 不出光斑 */
  glareOpacity: { type: Number, default: 0.65 },
  /** 光斑颜色 */
  glareColor: { type: String, default: '#60a5fa' },
  /** 光斑直径，按宿主宽高的百分比算 */
  glareSize: { type: Number, default: 120 },
  /** 是否渲染内置光斑（要自定义就走 glare 插槽并传 false） */
  glare: { type: Boolean, default: true },
  /** 指针监听范围：self = 只认落在宿主上的指针；window = 整个视口（全屏背景用） */
  track: { type: String, default: 'self' },
  /** 只保留姿态、不接指针（省电，或外层自己接管指针时用） */
  disabled: { type: Boolean, default: false },
})

const rootRef = ref(null)
const glareRef = ref(null)
let frame = 0 // 0 = 没在跑：静止即停帧，别让全屏背景一直烧 CPU
let lastPaint = 0 // 上一帧真正落笔的时间，用来做帧率上限
let reduced = false
let trackEl = null // 指针事件挂在哪
let leaveEl = null // 指针"离开"以谁为准
let box = null // 宿主矩形：每次指针移动都重量（宿主可能正被外层搬动，缓存会过期）

// 当前值与目标值分开：每帧把当前值往目标推，指针一离开就自然回位
const cur = { rx: 0, ry: 0, gx: 50, gy: 50, a: 0 }
const tgt = { rx: 0, ry: 0, gx: 50, gy: 50, a: 0 }
const KEYS = ['rx', 'ry', 'gx', 'gy', 'a']

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** 光斑盘比宿主大多少（%）：盘越大，同样的指针位移要走的百分比越小 */
function glareSpan() {
  return Math.max(20, props.glareSize) * 1.5
}

/** 把姿态写到元素上：姿态与光斑都只写 transform / opacity，全是合成层操作 */
function paint(el) {
  const zoom = 1 + (props.scale - 1) * cur.a
  el.style.transform =
    `perspective(${props.perspective}px) rotateX(${cur.rx.toFixed(3)}deg) ` +
    `rotateY(${cur.ry.toFixed(3)}deg) scale(${zoom.toFixed(4)})`
  if (!props.glare) return
  const glare = glareRef.value
  if (!glare) return
  /* 光斑整块平移，而不是每帧挪渐变的中心点。
   * 渐变中心是个自定义属性：每帧写它会让宿主整棵子树的样式失效、整张渐变重画一遍 ——
   * 宿主越大越贵（大屏那八张卡就是拿整张卡当宿主的，实测这一条占掉一半绘制时间）。
   * 换成一块停在正中的柔光盘 + transform 平移之后，每帧只剩一次合成层位移。 */
  const span = glareSpan()
  glare.style.transform =
    `translate3d(${(((cur.gx - 50) * 100) / span).toFixed(3)}%, ` +
    `${(((cur.gy - 50) * 100) / span).toFixed(3)}%, 0)`
  glare.style.opacity = (cur.a * props.glareOpacity).toFixed(3)
}

/** 回到正中姿态：目标与当前值一起归位，再画一次 */
function home(el) {
  for (const k of KEYS) {
    tgt[k] = k === 'gx' || k === 'gy' ? 50 : 0
    cur[k] = tgt[k]
  }
  if (el) paint(el)
}

function animate(ts) {
  frame = 0
  const el = rootRef.value
  if (!el) return
  // 帧率上限：这一帧还不够数就先不落笔，下一帧再来——代价减半、肉眼无差
  const gap = props.fpsCap > 0 ? 1000 / props.fpsCap : 0
  if (gap > 1 && ts - lastPaint < gap - 1.5) {
    frame = requestAnimationFrame(animate)
    return
  }
  lastPaint = ts
  const k = clamp(props.smoothing, 0.02, 1)
  for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * k
  // 已经贴到目标就收尾停帧，等下一次指针移动再唤醒
  const settled =
    Math.abs(tgt.rx - cur.rx) < 0.01 &&
    Math.abs(tgt.ry - cur.ry) < 0.01 &&
    Math.abs(tgt.gx - cur.gx) < 0.05 &&
    Math.abs(tgt.gy - cur.gy) < 0.05 &&
    Math.abs(tgt.a - cur.a) < 0.002
  if (settled) for (const key of KEYS) cur[key] = tgt[key]
  paint(el)
  if (!settled) frame = requestAnimationFrame(animate)
}

function kick() {
  if (!frame && !props.disabled && !reduced) frame = requestAnimationFrame(animate)
}

function measure() {
  box = rootRef.value?.getBoundingClientRect() ?? null
}

function onMove(event) {
  const el = rootRef.value
  if (!el || props.disabled || reduced) return
  /* 每次都重量：宿主可能正被外层搬动 —— 大屏那个八边形环换面时整圈都在转，
   * 而换面与"这一面开始跟随指针"是同一帧发生的，缓存下来的矩形会是转动之前的。
   * 实测症状很有迷惑性：只有水平方向的倾斜卡死在一边、垂直方向看着正常。
   * 单个元素的 getBoundingClientRect 很便宜，量错方向的代价大得多。 */
  measure()
  if (!box || !box.width || !box.height) return
  const px = clamp((event.clientX - box.left) / box.width, 0, 1)
  const py = clamp((event.clientY - box.top) / box.height, 0, 1)
  // 单侧满量程：指针贴上边 → +maxTilt，贴下边 → −maxTilt（左右同理）
  tgt.rx = (0.5 - py) * 2 * props.maxTilt
  tgt.ry = (px - 0.5) * 2 * props.maxTilt
  tgt.gx = px * 100
  tgt.gy = py * 100
  tgt.a = 1
  kick()
}

function onLeave() {
  if (props.disabled) return
  tgt.rx = 0
  tgt.ry = 0
  tgt.gx = 50
  tgt.gy = 50
  tgt.a = 0
  kick()
}

/** 用户在系统里切换"少动效"：切过去就归位停住，切回来把姿态交还给动画 */
function onMotionPref(event) {
  reduced = event.matches
  if (reduced) {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    home(rootRef.value)
  } else {
    kick()
  }
}

/** 指针监听：self 挂在宿主上；window 挂在视口上，并把"离开"定为指针离开文档。
 *  一律在挂载时挂上、卸载时摘掉 —— 开关交给 onMove 里的 disabled 判断。
 *  监听跟着 disabled 动态挂/摘看着更省，但那样"某一面从禁用切到启用"就多了一条
 *  容易出错的路径（时序稍有不对，那一面就整个不响应，而它看起来只是"没效果"）。 */
function bind() {
  const self = rootRef.value
  if (!self || trackEl) return
  if (props.track === 'window') {
    trackEl = window
    leaveEl = document.documentElement
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

/* disabled 切换：关掉时立刻归位（姿态归零、光斑熄掉），打开时重量一次宿主再唤醒循环。
 * 监听不在这里挂/摘 —— 它常驻（见 bind 的注释），这里只管"响不响应"这一个开关。 */
watch(
  () => props.disabled,
  (off) => {
    if (off) {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      home(rootRef.value)
      return
    }
    measure()
    /* 幂等兜底：常驻模式下通常早已挂过；留着它是为了"万一挂载那条路没走通"——
     * 曾经的失败模式就是这样：挂载时被环境判断拦掉，于是每一面都静默失效。 */
    bind()
    kick()
  },
)

let mq = null

onMounted(() => {
  /* 这里故意不做"有没有鼠标"的媒体特性判断。
   * 原先用 (hover: hover) and (pointer: fine)，后来换 (any-hover) / (any-pointer)，
   * 都不保险：触摸屏本、远程桌面、虚拟机里浏览器可能把整套 pointer / hover 特性
   * 都报成 coarse，而用户明明在用鼠标 —— 结果是每张卡在挂载时静默退出
   * （不挂监听、不写姿态），看起来只是"没有效果"，而切走再切回又被 watch 救回来。
   * 不判断的代价接近于零：真没有指针设备时，pointermove 根本不会发生，循环一帧都不跑。 */
  mq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  reduced = mq?.matches ?? false
  home(rootRef.value) // 静止时也先把姿态与变量写全，样式不依赖 JS 也有默认值
  measure()
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
  <div ref="rootRef" class="tilt">
    <!-- 默认插槽：放什么就倾斜什么（背景层、卡片、面板……） -->
    <slot />

    <!-- 内置光斑：整块平移（transform）而不是每帧挪渐变的中心点；要换外观就用 glare 插槽 -->
    <span v-if="glare" ref="glareRef" class="tilt__glare" aria-hidden="true" />
    <slot name="glare" />
  </div>
</template>

<style scoped>
/* 壳自己不设尺寸、不设背景：长什么样、多大，全由插槽内容决定 */
.tilt {
  position: relative;
  /* 倾斜只动 transform：transform 一变浏览器自会把它提成合成层，这里不用 will-change ——
   * will-change 会把光栅化分辨率钉在"创建那一刻"的尺寸上，而外层往往会把宿主放大
   * （大屏那个环会给正对镜头的那一面再放 1.045 倍并加透视），一放大就整块发糊，
   * 连文字都糊。去掉它，分辨率才会跟着实际尺寸走。 */
  transform-style: preserve-3d;
}

.tilt__glare {
  /* 颜色与尺寸都由 prop 带进来，使用方不必碰样式 */
  --tilt-glare-c: v-bind(glareColor);
  --tilt-glare-s: v-bind(glareSize);

  position: absolute;
  left: 50%;
  top: 50%;
  /* 一块比宿主大的柔光盘，停在正中；整块跟着指针平移（transform 由脚本写） */
  width: calc(var(--tilt-glare-s) * 1.5%);
  height: calc(var(--tilt-glare-s) * 1.5%);
  margin: calc(var(--tilt-glare-s) * -0.75%) 0 0 calc(var(--tilt-glare-s) * -0.75%);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    closest-side circle,
    color-mix(in srgb, var(--tilt-glare-c) 42%, transparent) 0%,
    transparent 100%
  );
}
</style>
