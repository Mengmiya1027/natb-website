<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { TextToParticle } from 'masoneffect/textToParticle'
import { useAnimationStore } from '@/stores/animation'
import { measureTextLayout } from '@/utils/masonTextLayout'

// 静态字的 DOM 由父级插槽给，这里只管量好、摆正、按时间轴放出来
const props = defineProps({
  text: { type: String, required: true },
  fontFamily: { type: String, default: "'HarmonyOS Sans SC', Arial" },
  fontWeight: { type: [Number, String], default: 700 },
})

// ── 粒子 ──
const MAX_PARTICLES = 20000 // 粒子极多，清晰度靠静态字兜
const POINT_SIZE = 0.65
const PARTICLE_COLOR = '#eaf2ff'
const SMALL_STEP = 3 // 小屏采样步长（画布像素），越大粒子越少

// ── 汇聚 ──
const EASE = 0.0126 // 满值加速度，按 60fps 基准标定
const EASE_MAX = 0.05 // 加速度上限，防止收尾过冲
const EASE_RAMP_MS = 3600 // 起步加速段：ease 从 0 爬到满值
const MORPH_SNAP_CSS_PX = 7 // 误差小于它就开始加大 ease 收口
const MORPH_DONE_CSS_PX = 0.3 // 平均误差降到这里即视觉聚拢完成
const FPS_BASE = 60 // 物理按帧推进，按实测帧率补偿

// ── 时间轴（毫秒）──
const STAR_HOLD_MS = 500 // 星空停留
const MORPH_LATEST_MS = 16000 // 最晚兜底：迟迟不收敛也不会拖过它
const REVEAL_MS = 800 // 静态字渐显
const FADE_LEAD_MS = 250 // 粒子比静态字渐显提前这么久开始隐
const FADE_MS = 1000 // 粒子渐隐

// 设备档位：采样步长 = round(densityStep × DPR)，库下限 2
function viewQuality() {
  const rawDpr = window.devicePixelRatio || 1
  if (window.matchMedia('(max-width: 768px)').matches) {
    const dpr = Math.min(rawDpr, 3)
    return { dpr, densityStep: SMALL_STEP / dpr }
  }
  // 桌面沿用库的默认密度
  return { dpr: Math.min(rawDpr, 1.8), densityStep: 2 }
}

const VIEW = viewQuality()

const hostRef = ref(null)
const chars = ref([])
const titleStyle = ref({})
const titleShift = ref('0px')
const staticVisible = ref(false)
const particleOpacity = ref(1)

const store = useAnimationStore()

let instance = null
let timers = []
let rafId = null
let resizeTimer = null
let resizeObserver = null
let revealed = false
let morphing = false
let morphFrames = 0
let morphStart = 0
let easeNow = -1
let fpsSmooth = FPS_BASE
let lastFrameAt = 0
let meanErrNow = Number.POSITIVE_INFINITY
let probeEl = null

function later(fn, ms) {
  const id = window.setTimeout(fn, ms)
  timers.push(id)
  return id
}

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id))
  timers = []
}

// 按画布尺寸重算静态字，与粒子字同位同尺寸
async function measureTitle() {
  const host = hostRef.value
  if (!host) return
  const width = host.clientWidth
  const height = host.clientHeight
  if (!width || !height) return

  const layout = measureTextLayout({
    width,
    height,
    dpr: VIEW.dpr,
    text: props.text,
    fontFamily: props.fontFamily,
    fontWeight: props.fontWeight,
  })

  const gap = layout.letterSpacing / layout.ratio
  titleStyle.value = {
    fontFamily: props.fontFamily,
    fontWeight: props.fontWeight,
    fontSize: layout.fontSize / layout.ratio + 'px',
    // 字距与字数交给 CSS：落点要靠它收掉这份间距才能对上真标题
    '--char-gap': gap + 'px',
    '--char-n': layout.chars.length,
  }
  // 库的居中会让整行右偏，两层一起回正
  titleShift.value = -(layout.offsetX / layout.ratio).toFixed(2) + 'px'
  chars.value = layout.chars.map((item) => ({
    ch: item.ch,
    left: item.x / layout.ratio + 'px',
    top: item.y / layout.ratio + 'px',
  }))

  // 字体度量随平台变，落一次 DOM 后用探针实测修正
  await nextTick()
  if (document.fonts?.ready) await document.fonts.ready
  await nextTick()
  const fix = baselineFix(layout, measureInk(layout))
  if (fix) {
    chars.value = chars.value.map((item) => ({
      ...item,
      top: parseFloat(item.top) + fix + 'px',
    }))
  }
}

// 与库同构地离屏画一遍，量出文字墨迹的上下边界
function measureInk(layout) {
  const off = document.createElement('canvas')
  off.width = layout.canvasW
  off.height = layout.canvasH
  const ctx = off.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${props.fontWeight} ${layout.fontSize}px ${props.fontFamily}`
  for (const item of layout.chars) ctx.fillText(item.ch, item.x, item.y)

  const { width: W, height: H } = off
  const data = ctx.getImageData(0, 0, W, H).data
  let minY = H
  let maxY = -1
  for (let y = 0; y < H; y += 1) {
    const row = y * W * 4
    for (let x = 0; x < W; x += 1) {
      const i = row + x * 4
      if (data[i] + data[i + 1] + data[i + 2] > 600) {
        if (y < minY) minY = y
        maxY = y
        break
      }
    }
  }
  return maxY < 0 ? null : { minY, maxY }
}

// 画布的 middle 基线各平台定义不一，用字体度量推算会偏；
// 改以库的墨迹为基准：探针给出 DOM 真实基线，再整体移到位
function baselineFix(layout, ink) {
  const host = hostRef.value
  if (!probeEl || !host || !ink) return 0
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = `${props.fontWeight} ${layout.fontSize}px ${props.fontFamily}`
  const metrics = ctx.measureText(props.text)
  const baselineCanvas =
    (ink.minY + ink.maxY) / 2 +
    (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
  const target = host.getBoundingClientRect().top + baselineCanvas / layout.ratio
  return target - probeEl.getBoundingClientRect().bottom
}

function onProbe(el) {
  probeEl = el
}

// 物理按帧推进，帧率低则真实耗时变长，这里实测帧率用于补偿
function trackFps() {
  const now = performance.now()
  if (lastFrameAt) {
    const dt = now - lastFrameAt
    if (dt > 0 && dt < 200) fpsSmooth += (1000 / dt - fpsSmooth) * 0.05
  }
  lastFrameAt = now
}

// 起步压住，收尾反过来加速，免得像指数尾巴那样慢慢蹭到目标
function rampEase(inst) {
  if (!morphing) return
  const t = Math.min(1, (performance.now() - morphStart) / EASE_RAMP_MS)
  const speed = Math.min(3, Math.max(0.4, FPS_BASE / fpsSmooth))
  const snapTol = MORPH_SNAP_CSS_PX * inst.DPR
  const snap = meanErrNow > snapTol ? 1 : snapTol / Math.max(meanErrNow, 1e-3)
  const value = Math.min(EASE_MAX, EASE * t * t * t * speed * snap)
  if (value !== easeNow) {
    easeNow = value
    inst.config.ease = value
  }
}

function watchConvergence(inst) {
  trackFps()
  rampEase(inst)
  if (revealed || !morphing) return
  morphFrames += 1
  if (morphFrames % 4) return

  // 库的抖动项让速度永不归零，但误差会收敛，按误差判断该换字的时机
  const list = inst.particles
  if (!list.length) return
  let sum = 0
  for (let i = 0; i < list.length; i++) {
    const p = list[i]
    const dx = p.tx - p.x
    const dy = p.ty - p.y
    sum += Math.sqrt(dx * dx + dy * dy)
  }
  meanErrNow = sum / list.length
  if (meanErrNow <= MORPH_DONE_CSS_PX * inst.DPR) revealTitle()
}

function revealTitle() {
  if (revealed) return
  revealed = true
  clearTimers()
  store.setStage('reveal')
  measureTitle()
  staticVisible.value = true
  later(() => {
    store.setStage('fading')
    particleOpacity.value = 0
    later(finishIntro, FADE_MS)
  }, REVEAL_MS - FADE_LEAD_MS)
}

function finishIntro() {
  instance?.stop()
  store.finish()
}

function startMorph() {
  if (!instance) return
  store.setStage('morphing')
  morphStart = performance.now()
  // 切目标那一帧必须先把 ease 归零，否则粒子带满值冲一帧再顿住
  easeNow = 0
  instance.config.ease = 0
  // 直接重建目标点：morph() 有防抖，目标未更新前会被误判成已汇聚
  instance.buildTargets()
  morphing = true
  morphFrames = 0
  meanErrNow = Number.POSITIVE_INFINITY // 起步不该被收尾加速接管
  later(revealTitle, MORPH_LATEST_MS)
}

function boot() {
  const host = hostRef.value
  if (!host || !host.clientWidth || !host.clientHeight) {
    rafId = requestAnimationFrame(boot)
    return
  }
  instance = new TextToParticle(host, {
    text: props.text,
    maxParticles: MAX_PARTICLES,
    densityStep: VIEW.densityStep,
    devicePixelRatio: VIEW.dpr,
    pointSize: POINT_SIZE,
    ease: EASE,
    particleColor: PARTICLE_COLOR,
    fontFamily: props.fontFamily,
    fontWeight: props.fontWeight,
    repelRadius: 0, // 关掉鼠标排斥
    onReady: (inst) => {
      // 鼠标事件不进画布，省掉逐粒排斥计算
      inst.canvas.style.pointerEvents = 'none'
      inst.scatter() // 先停在随机散点，形成星空
      later(startMorph, STAR_HOLD_MS)
    },
    onUpdate: watchConvergence,
  })
}

// 粒子层与舞台同框，尺寸变化直接观察自己
function onResize() {
  window.clearTimeout(resizeTimer)
  // 等库自己的防抖 resize 完成后再对齐静态字
  resizeTimer = window.setTimeout(measureTitle, 260)
}

onMounted(() => {
  measureTitle()
  if (hostRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(hostRef.value)
  }

  if (store.hasPlayed) {
    staticVisible.value = true
    particleOpacity.value = 0
    if (!store.isLanded) store.finish() // 已经落位就别把进程倒回去
    return
  }

  store.begin('starfield')
  rafId = requestAnimationFrame(boot)
})

onBeforeUnmount(() => {
  clearTimers()
  if (rafId) cancelAnimationFrame(rafId)
  if (resizeTimer) window.clearTimeout(resizeTimer)
  if (resizeObserver) resizeObserver.disconnect()
  instance?.destroy()
  instance = null
  store.reset()
})
</script>

<template>
  <div
    ref="hostRef"
    class="particle-field"
    :style="{ opacity: particleOpacity, transform: `translateX(${titleShift})` }"
  ></div>
  <slot
    name="title"
    :chars="chars"
    :title-style="titleStyle"
    :shift="titleShift"
    :visible="staticVisible"
    :probe="onProbe"
  />
</template>

<style scoped>
.particle-field {
  position: absolute;
  inset: 0;
  z-index: 0; /* 压在静态字下面 */
  transition: opacity 900ms ease;
}

.particle-field :deep(canvas) {
  display: block;
}
</style>
