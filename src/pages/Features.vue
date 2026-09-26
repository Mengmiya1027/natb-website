<script setup>
import GridBackground from '@/components/GridBackground.vue'
import FeatureCard from '@/components/FeatureCard.vue'
import FeatureViewer from '@/components/FeatureViewer.vue'
import { useViewerStore } from '@/stores/viewer'
import { useAnimationStore } from '@/stores/animation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { normalizeIcon, themeFromIcon } from '@/utils/themeColor'
// 卡片主图标统一用 solar 的 bold-duotone，两层深浅自带层次
import IconShieldKeyhole from '~icons/solar/shield-keyhole-bold-duotone'
import IconCloudDownload from '~icons/solar/cloud-download-bold-duotone'
import IconLayers from '~icons/solar/layers-minimalistic-bold-duotone'
import IconWidget from '~icons/solar/widget-bold-duotone'
import IconCpuBolt from '~icons/solar/cpu-bolt-bold-duotone'
import IconMagicStick from '~icons/solar/magic-stick-bold-duotone'
import IconFolderFiles from '~icons/solar/folder-with-files-bold-duotone'
import IconScreenShare from '~icons/solar/screen-share-bold-duotone'
// raw 方式导入：拿到源码本身，品牌色和背景形状都从里面取
// 挑这八个是为了色相铺得开：红橙 / 琥珀 / 绿 / 青 / 靛 / 蓝 / 紫 / 品红
import LogoVue from '~icons/logos/vue?raw'
import LogoPython from '~icons/logos/python?raw'
import LogoCPlusPlus from '~icons/logos/c-plusplus?raw'
import LogoJava from '~icons/logos/java?raw'
import LogoGo from '~icons/logos/go?raw'
import LogoKotlin from '~icons/logos/kotlin?raw'
import LogoAndroid from '~icons/logos/android?raw'
import LogoSwift from '~icons/logos/swift?raw'

/** 取出 svg 起止标签之间的图形内容，并一并认出原始视框 */
function readSvg(source) {
  const head = /<svg([^>]*)>/i.exec(source)
  const end = source.toLowerCase().lastIndexOf('</svg>')
  if (!head || end < 0) return null
  const box = /viewBox\s*=\s*"([^"]+)"/i.exec(head[1])
  const [, , w, h] = box ? box[1].trim().split(/[\s,]+/).map(Number) : []
  return { body: source.slice(head.index + head[0].length, end).trim(), w, h }
}

/**
 * 语言图标只当背景：取它原本的彩色内联图，外加按品牌色算出的主题色
 * 取不到色相时退回页面主色，卡片也不至于没色
 */

// 云母斑的模糊：视框 24，卡片上放大约九倍，0.32 就是屏幕上的 3px
// 烘进 SVG 里，卡片上就不必各挂一个实时滤镜层
const BLUR_FILTER =
  '<filter id="halo-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="0.32"/></filter>'

function prepareLogo(source) {
  const parsed = readSvg(source)
  if (!parsed) return null
  const boxed = normalizeIcon(parsed.body, parsed.w, parsed.h)
  const wrap = (inner) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${inner}</svg>`,
    )}")`
  return {
    // 保留图标自己的配色，糊开后才是一块有细节的云母斑
    src: wrap(`${BLUR_FILTER}<g filter="url(#halo-blur)">${boxed}</g>`),
    // 大窗那版用清晰图标加 CSS 模糊：SVG 自带的滤镜每换一个尺寸都要重光栅一次，
    // 正好撞在展开的头两帧上，实测一次三十多毫秒；CSS 模糊走合成，量级完全不同
    srcSharp: wrap(boxed),
    theme: themeFromIcon(parsed.body, '#0a59f7'),
  }
}

// 八项特色功能，一条一张卡；shot 是大窗右侧的实拍截图
const FEATURES = [
  {
    icon: IconShieldKeyhole,
    logo: LogoCPlusPlus,
    shot: 'root.webp',
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
  },
  {
    icon: IconCloudDownload,
    logo: LogoSwift,
    shot: 'ota.webp',
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
  },
  {
    icon: IconLayers,
    logo: LogoPython,
    shot: 'rtos.webp',
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
  },
  {
    icon: IconWidget,
    logo: LogoJava,
    shot: 'appmanager.webp',
    title: '应用管理',
    desc: '多种安装方式，支持install/data/第三方安装器/install-create，总有一种适合您。',
  },
  {
    icon: IconCpuBolt,
    logo: LogoGo,
    shot: '9008.webp',
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
  },
  {
    icon: IconMagicStick,
    logo: LogoKotlin,
    shot: 'magisk.webp',
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
  },
  {
    icon: IconFolderFiles,
    logo: LogoVue,
    shot: 'filemanager.webp',
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
  },
  {
    icon: IconScreenShare,
    logo: LogoAndroid,
    shot: 'scrcpy.webp',
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
  },
].map(({ logo, shot, ...item }) => ({
  ...item,
  ...prepareLogo(logo),
  // 走 base，子路径部署也能取到 public 下的截图
  shot: import.meta.env.BASE_URL + 'images/' + shot,
}))

// 车道整条斜过来 20°，屏幕四角投到它的纵轴上有多长，卡片就按这个长度备
const ROT = Math.PI / 9
// 与原来 48 秒滚过一份八张的手感对齐
const SPEED = 37.7
// 入场收尾后的起步斜率：每秒抬这么多，约 0.4s 到满速 —— 滚动是"起步"不是"啪一下"
const SPEED_RAMP = 2.6
// 三条车道各错开三张
const PHASE_STEP = 3
// 一份八项循环铺开：八张就够盖住可见跨度，宽屏不够时再整份补，序号才连得住
const LOOP = FEATURES.map((item, index) => ({
  ...item,
  no: String(index + 1).padStart(2, '0'),
}))

// 三列车道
const LANES = [0, 1, 2]

// 副标题占位：字数决定竖排字号，改文案不用动样式
const SUBTITLE = '全方面支持小天才手表玩机需求'

// 车道倾角，与 .lanes 的 rotate 同源：量卡片几何时要靠它把外接矩形解回去
const LANE_ROT = 15

// 副标题拆成一字一格：入场时逐字亮起，十三个字不会挤在同一帧里
const GHOST = [...SUBTITLE]

/* ===== 入场动效的时间表 =====
 * 阶梯只写这一份：每个元素的起跑点与时长都从这里注入成 --enter-*，
 * 样式只负责姿态与曲线，时间轴不会在 CSS 与 JS 里各写一遍。
 * 顺序：网格底纹 → 左侧蓝雾 / 弧外蓝光 → 弧面与掠光 → 左列四块（主标题自上而下擦出）
 * → 卡片逐张落位、底线收势。
 */
const ENTER = {
  grid: 0, // 网格底纹
  bloom: 40, // 左上那层蓝雾
  glow: 60, // 弧外蓝光
  stage: 120, // 弧面
  sweep: 240, // 弧上掠光
  rule: 150, // 主次之间的分隔线
  title: 210, // 主标题
  ghost: 390, // 副标题首字
  ghostStep: 40, // 副标题逐字间隔
  mark: 540, // 列尾英文标记
  cards: 600, // 首张卡
  laneStep: 76, // 车道之间错开
  cardStep: 46, // 同车道相邻两张错开
  lineLag: 150, // 卡底线比卡本身晚一点
}
const ENTER_DUR = {
  grid: 900,
  bloom: 1000,
  glow: 820,
  stage: 520,
  sweep: 880,
  rule: 560,
  title: 820,
  ghost: 460,
  mark: 560,
  card: 580,
  line: 480,
}
// 最后一张卡的底线抽完，再留一帧余量：到这一刻动画整批撤掉
const ENTER_END =
  ENTER.cards +
  ENTER.laneStep * (LANES.length - 1) +
  ENTER.cardStep * (LOOP.length - 1) +
  ENTER.lineLag +
  ENTER_DUR.line +
  16

const ms = (v) => `${v}ms`
// 同一份数字交给 CSS：:style 挂在根节点上，var() 一路继承下去
const enterVars = {
  '--enter-grid': ms(ENTER.grid),
  '--enter-bloom': ms(ENTER.bloom),
  '--enter-glow': ms(ENTER.glow),
  '--enter-stage': ms(ENTER.stage),
  '--enter-sweep': ms(ENTER.sweep),
  '--enter-rule': ms(ENTER.rule),
  '--enter-title': ms(ENTER.title),
  '--enter-ghost': ms(ENTER.ghost),
  '--enter-ghost-step': ms(ENTER.ghostStep),
  '--enter-mark': ms(ENTER.mark),
  '--enter-cards': ms(ENTER.cards),
  '--enter-lane-step': ms(ENTER.laneStep),
  '--enter-card-step': ms(ENTER.cardStep),
  '--enter-line-lag': ms(ENTER.lineLag),
  '--enter-dur-grid': ms(ENTER_DUR.grid),
  '--enter-dur-bloom': ms(ENTER_DUR.bloom),
  '--enter-dur-glow': ms(ENTER_DUR.glow),
  '--enter-dur-stage': ms(ENTER_DUR.stage),
  '--enter-dur-sweep': ms(ENTER_DUR.sweep),
  '--enter-dur-rule': ms(ENTER_DUR.rule),
  '--enter-dur-title': ms(ENTER_DUR.title),
  '--enter-dur-ghost': ms(ENTER_DUR.ghost),
  '--enter-dur-mark': ms(ENTER_DUR.mark),
  '--enter-dur-card': ms(ENTER_DUR.card),
  '--enter-dur-line': ms(ENTER_DUR.line),
}

const viewer = useViewerStore()
// 开场那场粒子戏还没落位时，这里的入场要等着
const anim = useAnimationStore()
const activeItem = computed(() => (viewer.active >= 0 ? LOOP[viewer.active] : null))
// 点开的那张卡在屏幕上的真实几何，充当覆盖层 FLIP 的起点
const originRect = ref(null)
// 卡内各元素的同一份几何：大卡要逐元素飞，不能整卡一起放大
const originParts = ref(null)
// 被分身顶替的源卡，收尾时还它可见
let sourceEl = null

/**
 * 元素躺在 15° 的车道里，拿到的是旋转后的外接矩形，
 * 用三角函数反解出未旋转的真实宽高，中心取外接矩形中心（旋转不改中心）。
 */
function quadOrigin(el) {
  const r = el.getBoundingClientRect()
  const rad = (LANE_ROT * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const den = cos * cos - sin * sin
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: (r.width * cos - r.height * sin) / den,
    h: (r.height * cos - r.width * sin) / den,
    rot: LANE_ROT,
  }
}

/** 卡片会被 cloneNode 补齐，所以点击只能走委托，序号认 data-index */
async function pickCard(event) {
  if (viewer.expanded) return
  const el = event.target instanceof Element ? event.target.closest('.card') : null
  if (!el || !lanesEl.value?.contains(el)) return
  const index = Number(el.dataset.index)
  if (!Number.isInteger(index) || index < 0 || index >= LOOP.length) return

  // 入场还没跑完就点：先把动画撤掉，等类真正落地再量，量到的才是落位后的几何
  if (entering.value) {
    finishEntrance()
    await nextTick()
  }
  const origin = quadOrigin(el)
  // 圆角也带上：大卡的圆角是固定值，压回源卡那一档时要靠它反推补偿量
  origin.radius = parseFloat(getComputedStyle(el).borderRadius) || 0
  originRect.value = origin
  // 共享元素用现成 class 量，小卡模板一个属性都不用加
  const pick = (sel) => {
    const node = el.querySelector(sel)
    return node ? quadOrigin(node) : null
  }
  // 字号也带上：框宽未必等于文字宽，只按框宽缩放会把标题压扁
  const font = (sel) => {
    const node = el.querySelector(sel)
    return node ? parseFloat(getComputedStyle(node).fontSize) : null
  }
  originParts.value = {
    no: pick('.card-no'),
    icon: pick('.card-icon'),
    title: pick('.card-title'),
    desc: pick('.card-desc'),
    // 字号用于等比缩放的比值，水印也一样
    fonts: {
      no: font('.card-no'),
      title: font('.card-title'),
      desc: font('.card-desc'),
    },
  }
  sourceEl = el
  viewer.open(index)
}

/** 覆盖层预光栅完、动画即将起手，这一刻才把真卡藏掉，交接处不留空白 */
function onViewerReady() {
  if (sourceEl) sourceEl.style.visibility = 'hidden'
}

/**
 * 真卡归位。收起时大窗会在卡片淡出前先发 release 把它放出来，
 * 此时它被覆盖层压着看不见，交接处就没有空白也没有突变。
 */
function restoreSource() {
  const el = sourceEl
  if (!el) return
  sourceEl = null
  el.style.transition = 'none'
  el.style.visibility = ''
  void el.offsetWidth
  // 等覆盖层卸载那一帧画完再放回过渡
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = ''
  }))
}

function onViewerClosed() {
  restoreSource()
  viewer.finish()
}

// 轨道里只留盖得住可见窗口的卡，滚出去的那张挪到队首，卡数只剩原来的三分之一
const lanesEl = ref(null)
const laneList = []
let rafId = 0
let lastTs = 0
let paused = false
// 入场收尾后从 0 抬到 1：轨道起步有个加速，不是一上来就满速
let speedK = 0
let lanesWatch = null
// 预解码的排队句柄与它的取消函数，卸载时要收干净
let warmId = 0
let warmCleanup = null

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

/* ===== 入场的开关 =====
 * 开场还在演就先把整页按住（visibility 连背景一起藏，不漏底），字一落位再从零起跑；
 * 少动效时两个都不开，元素直接停在终态，一帧动画都不跑。
 */
const gated = ref(!reduceMotion && anim.isIntro)
const entering = ref(!reduceMotion && !anim.isIntro)
// 开场迟迟不落位也要放行：页面不能一直空着
const GATE_MAX = 5000
let enterTimer = 0
let enterGate = 0
let stopGate = null

/** 收尾：动画连同蒙版一起撤掉，元素回到静态样式 —— 那正是动画的终态，交接不跳 */
function finishEntrance() {
  if (enterTimer) {
    clearTimeout(enterTimer)
    enterTimer = 0
  }
  if (!entering.value && !gated.value) return
  entering.value = false
  gated.value = false
  syncPause()
}

/** 从"按住"切到"起跑"：同一帧里换类，各条时间轴都从 0% 开始 */
function openEntrance() {
  gated.value = false
  entering.value = true
  syncPause()
  enterTimer = window.setTimeout(finishEntrance, ENTER_END)
}

/** 量一遍每张卡的高度（含间距），之后轮转就不必再摸布局 */
function readHeights(lane) {
  lane.heights = [...lane.el.children].map((c) => c.offsetHeight + lane.gap)
  lane.total = lane.heights.reduce((sum, h) => sum + h, 0)
  lane.tallest = lane.heights.length ? Math.max(...lane.heights) : 0
}

/** 队尾挪到队首：高度数组同步旋转，位移减掉它的高度，屏幕上其余卡片原地不动 */
function rotateLane(lane, shift = true) {
  const last = lane.el.lastElementChild
  if (!last || !lane.heights.length) return
  const h = lane.heights.pop()
  lane.heights.unshift(h)
  lane.el.insertBefore(last, lane.el.firstElementChild)
  if (shift) lane.d -= h
}

/** 可见窗口在车道局部坐标里的上下界：屏幕四角投到旋转后的纵轴上 */
function boundsOf(lane) {
  const box = lanesEl.value.getBoundingClientRect()
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  const s = Math.sin(ROT)
  const c = Math.cos(ROT)
  let lo = Infinity
  let hi = -Infinity
  for (const [x, y] of [[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]]) {
    const v = (y - cy) * c - (x - cx) * s
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  // 车道顶边与 lanes 顶边重合，所以局部纵轴的中点取 lanes 的一半
  const mid = lanesEl.value.offsetHeight / 2
  return { a: mid + lo, b: mid + hi }
}

/** 窗口比卡片总长还高时整份补卡：整份补序号循环才连得住 */
function ensureCover(lane) {
  const span = lane.b - lane.a
  let guard = 0
  while (lane.total < span + lane.tallest && guard++ < 4) {
    for (const card of [...lane.el.children].slice(0, FEATURES.length)) {
      lane.el.appendChild(card.cloneNode(true))
    }
    readHeights(lane)
  }
}

function frame(ts) {
  rafId = requestAnimationFrame(frame)
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0
  lastTs = ts
  if (paused || reduceMotion) return
  // 停过之后接着跑：速度系数只在上限内慢慢抬，中途悬停打断也不会重置
  speedK = Math.min(1, speedK + dt * SPEED_RAMP)
  for (const lane of laneList) {
    lane.d += SPEED * dt * speedK
    // 内容顶边快要让出窗口时补上队尾那张，任何时刻窗口里都不该缺卡
    let guard = 0
    while (lane.d > lane.a && guard++ < 24) rotateLane(lane)
    lane.el.style.transform = `translateY(${lane.d.toFixed(2)}px)`
  }
}

function measureLanes() {
  for (const lane of laneList) {
    lane.gap = parseFloat(getComputedStyle(lane.el.firstElementChild).marginBottom) || 0
    readHeights(lane)
    const before = boundsOf(lane)
    lane.a = before.a
    lane.b = before.b
    const was = lane.total
    ensureCover(lane)
    if (lane.total !== was) {
      const grown = boundsOf(lane)
      lane.a = grown.a
      lane.b = grown.b
    }
    lane.d = lane.a - lane.tallest
  }
}

// 悬停、入场未收干净、大窗展开都停滚：展开时指针被遮罩接管，只认悬停会把列表放跑
let hovering = false
function syncPause() {
  paused = gated.value || entering.value || hovering || viewer.expanded
}
// 入场没跑完就把滚动扣住，等卡片落定再起步
syncPause()

const onEnter = () => {
  hovering = true
  syncPause()
}
const onLeave = () => {
  hovering = false
  syncPause()
}

onMounted(() => {
  const box = lanesEl.value
  if (!box) return
  ;[...box.children].forEach((el, index) => {
    const lane = { el, d: 0, a: 0, b: 0, gap: 0, heights: [], total: 0, tallest: 0 }
    lane.gap = parseFloat(getComputedStyle(el.firstElementChild).marginBottom) || 0
    readHeights(lane)
    const first = boundsOf(lane)
    lane.a = first.a
    lane.b = first.b
    const was = lane.total
    ensureCover(lane)
    // 补过卡以后总长变了，窗口上下界跟着平移，重量一次
    if (lane.total !== was) {
      const grown = boundsOf(lane)
      lane.a = grown.a
      lane.b = grown.b
    }
    // 相位错开只改排列，不动位移
    for (let k = 0; k < index * PHASE_STEP; k++) rotateLane(lane, false)
    // 顶部先压到窗口上界之外一张卡的位置，之后一路往下淌
    lane.d = lane.a - lane.tallest
    el.style.transform = `translateY(${lane.d}px)`
    laneList.push(lane)
  })

  rafId = requestAnimationFrame(frame)
  // 字体到位后换行可能变，窗口尺寸一变也要重算
  document.fonts?.ready?.then(measureLanes)
  if (typeof ResizeObserver !== 'undefined') {
    lanesWatch = new ResizeObserver(measureLanes)
    lanesWatch.observe(document.documentElement)
  }
  box.addEventListener('pointerenter', onEnter)
  box.addEventListener('pointerleave', onLeave)

  // 预取并逐个预解码八张截图：展开那一下是最贵的，不能再等解码。
  // 但解码要抢主线程，刚进页面就点会被它拖住近一秒（实测 200ms 时点要等 904ms），
  // 所以只在浏览器闲着的时候跑，而且大窗一开就让路
  const idle = (fn) => (window.requestIdleCallback
    ? window.requestIdleCallback(fn, { timeout: 600 })
    : window.setTimeout(fn, 60))
  const stopIdle = (id) => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id))

  const warm = (list) => {
    const [item, ...rest] = list
    if (!item) return
    // 展开或收起动画期间不抢：等它忙完再来
    if (viewer.expanded) {
      warmId = window.setTimeout(() => warm(list), 400)
      return
    }
    warmId = idle(() => {
      const img = new Image()
      img.src = item.shot
      const next = () => { warmId = window.setTimeout(() => warm(rest), 120) }
      if (img.decode) img.decode().then(next, next)
      else img.onload = next
    })
  }
  warm(LOOP)
  // 排队句柄可能来自 idle，也可能来自让路时的 setTimeout，两种都撤一次
  warmCleanup = () => {
    if (!warmId) return
    stopIdle(warmId)
    clearTimeout(warmId)
  }

  /* ===== 入场 =====
   * 首屏渲染时类就挂上了，动画此刻已在跑，这里只负责按时间表收尾；
   * 若开场还在演，则先等它落位（最多 GATE_MAX），门一开再从 0% 起跑。
   */
  if (entering.value) {
    enterTimer = window.setTimeout(finishEntrance, ENTER_END)
  } else if (gated.value) {
    stopGate = watch(() => anim.isLanded, (landed) => {
      if (!landed) return
      stopGate?.()
      stopGate = null
      clearTimeout(enterGate)
      enterGate = 0
      openEntrance()
    })
    enterGate = window.setTimeout(() => {
      stopGate?.()
      stopGate = null
      enterGate = 0
      openEntrance()
    }, GATE_MAX)
  }
})

watch(() => viewer.expanded, syncPause)

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  lanesWatch?.disconnect()
  lanesEl.value?.removeEventListener('pointerenter', onEnter)
  lanesEl.value?.removeEventListener('pointerleave', onLeave)
  warmCleanup?.()
  // 入场的两个句柄与那条等待分支一起收干净
  if (enterTimer) clearTimeout(enterTimer)
  if (enterGate) clearTimeout(enterGate)
  stopGate?.()
  restoreSource()
})
</script>

<template>
  <div
    class="feature"
    :class="{ 'is-entering': entering, 'is-gated': gated }"
    :style="enterVars"
  >
    <GridBackground :rotation="-30" :z-index="1" :paused="viewer.expanded" />

    <div class="board">
      <!-- 左列：竖排白字，字号顶满整屏高度 -->
      <h1 class="board-title">随心所欲</h1>

      <!-- 主次之间的分隔细线 -->
      <span class="board-rule" aria-hidden="true"></span>

      <!-- 副标题：竖排，独占一列，字数多也不许超过这列宽；一字一格，入场逐字亮 -->
      <p class="board-ghost" :style="{ '--ghost-count': SUBTITLE.length }"><span v-for="(ch, i) in GHOST" :key="i" class="board-ghost__ch" :style="{ '--ch-i': i }">{{ ch }}</span></p>

      <!-- 列尾英文标记，收住左侧重心 -->
      <span class="board-mark" aria-hidden="true">FEATURES</span>

      <!-- 右列：弧区负责造型，里面的滚动栏负责响应指针 -->
      <section class="panel" aria-label="特色功能">
        <!-- 弧外的蓝色侧光：独立一层，免得滤镜把整块弧区每帧重算一遍 -->
        <span class="panel-glow" aria-hidden="true"></span>
        <div class="stage">
          <div class="rail">
            <div
              ref="lanesEl"
              v-once
              class="lanes"
              :style="{ '--lane-rot': LANE_ROT + 'deg' }"
              @click="pickCard"
            >
              <div
                v-for="lane in LANES"
                :key="lane"
                class="track"
                :style="{ '--lane-i': lane }"
              >
                <FeatureCard
                  v-for="(item, index) in LOOP"
                  :key="index"
                  :item="item"
                  :data-index="index"
                  :style="{ '--card-i': index }"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 展开的大窗：Teleport 到 body，压在顶栏之上 -->
    <FeatureViewer
      v-if="viewer.expanded && activeItem && originRect"
      :item="activeItem"
      :origin="originRect"
      :origin-parts="originParts"
      :total="LOOP.length"
      @ready="onViewerReady"
      @release="restoreSource"
      @closed="onViewerClosed"
    />
  </div>
</template>

<style scoped>
.feature {
  /* 四字竖排，留出上下气口；窄屏再按宽度收 */
  --title-size: min(20vh, 15vw);
  /* 全页强调色，卡片另按自身图标算主题色 */
  --accent: #0a59f7;
  /* 入场共用一条缓动：只靠错峰分出层次，才像一口气 */
  --enter-ease: cubic-bezier(0.22, 1, 0.36, 1);

  position: fixed;
  inset: 0;
  overflow: hidden;
  /* 只留底色：左侧那层蓝雾挪进 ::before，入场时才有地方晕开 */
  /* 深灰首帧兜底，别闪白 */
  background: #2E3234;
  user-select: none;
}

/* 左侧一层蓝雾，和右边弧区接上，深灰才不硬切 */
.feature::before {
  content: '';
  position: absolute;
  inset: 0;
  /* 与原来挂在 background 上同层：垫在网格底下 */
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    42% 58% at 13% 50%,
    color-mix(in srgb, var(--accent) 26%, transparent),
    transparent 72%
  );
}

.board {
  position: relative; /* 抬到网格之上 */
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  gap: 3vh; /* 竖排各列之间留出呼吸 */
  height: 100%;
  padding-left: 5vw;
}

/* ===== 左列：随心所欲 ===== */
.board-title {
  flex: none;
  align-self: center; /* 高度收到文字上，渐变才贴住四字 */
  margin: 0;
  writing-mode: vertical-rl; /* 中文竖排，一字一行 */
  font-size: var(--title-size);
  letter-spacing: 0.05em; /* 竖排下就是字与字的间隙 */
  font-weight: 700;
  line-height: 1;
  color: transparent;
  /* 上白下蓝，压在深底上不刺眼 */
  background-image: linear-gradient(180deg, #ffffff 2%, #dae7ff 60%, #7ea6f5 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 0 30px rgba(120, 170, 255, 0.32));
}

/* ===== 主次之间的分隔细线 ===== */
.board-rule {
  flex: none;
  align-self: center;
  width: 1px;
  height: 46vh;
  background: linear-gradient(
    180deg,
    transparent,
    rgba(158, 186, 240, 0.55) 26%,
    rgba(158, 186, 240, 0.55) 74%,
    transparent
  );
}

/* ===== 次列：灰色副标题 ===== */
.board-ghost {
  flex: none;
  align-self: center;
  margin: 0;
  writing-mode: vertical-rl;
  /* 按字数平分剩余高度，再封顶，只当陪衬不抢主标题 */
  font-size: min(calc((100dvh - 22vh) / var(--ghost-count)), clamp(15px, 2.1vh + 6px, 28px));
  letter-spacing: 0.32em; /* 疏排，和粗标题分出主次 */
  white-space: nowrap; /* 字再多也只排一列 */
  overflow: hidden; /* 兜底：放不下就裁掉，不往旁边淌 */
  font-weight: 500;
  line-height: 1;
  color: rgba(203, 216, 236, 0.72);
}

/* ===== 列尾英文标记 ===== */
.board-mark {
  flex: none;
  align-self: center;
  writing-mode: vertical-rl;
  font-family: Arial, system-ui;
  font-size: clamp(11px, 1.1vh, 14px);
  font-weight: 700;
  letter-spacing: 0.44em;
  color: rgba(148, 174, 214, 0.42);
}

/* ===== 右列 ===== */
.panel {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 3vw;
}

/* 弧外的蓝色侧光：形状照抄弧区，但不含滚动内容，光栅一次就能长期复用 */
.panel-glow {
  --l: 1400px;

  position: absolute;
  inset: 0;
  /* 滤镜必须挂在裁剪层之外，同元素上加 clip-path 会把影子一起裁掉 */
  filter: drop-shadow(-6px 0 18px rgba(10, 89, 247, 1));
  pointer-events: none;
}

.panel-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: circle(var(--l) at var(--l) 50%);
  /* 只借它的轮廓投影，圆内会被弧区的实心渐变盖住 */
  background: var(--accent);
}

/* 弧线沿用首页写法，只是切边由底边换成左边 */
.stage {
  --l: 1400px; /* 半径要盖过区域右半边，右边才不被裁 */

  position: absolute;
  inset: 0;
  clip-path: circle(var(--l) at var(--l) 50%);
  background:
    radial-gradient(120% 82% at 76% 22%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 62%),
    linear-gradient(155deg, #f5f8fc 0%, #dde4ee 56%, #c8d3e3 100%);
}

.rail {
  position: absolute;
  inset: 0;
}

/* 三条车道并成一条斜向滚动栏，整栏一起转 */
.lanes {
  --card-h: min(39vh, 21vw);
  --card-w: calc(var(--card-h) * 0.85); /* 宽高比，偏竖但不至于挤成条 */
  --card-gap: 3.4vh;

  position: absolute;
  top: 50%;
  left: 60.5%;
  display: flex;
  gap: calc(var(--card-h) * 0.13); /* 列间收紧，三列成一整块 */
  /* 先摆到区域中线，再斜过来；角度由脚本给的 --lane-rot 定，量几何时才解得回去 */
  transform: translate(-50%, -50%) rotate(var(--lane-rot, 15deg));
}

/* 三条车道各滚各的，位移由脚本每帧写一个 translateY */
.track {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* 提前提层：位移只走合成，卡内内容不必每帧重算 */
  will-change: transform;
}

@media (max-width: 900px) {
  .board {
    gap: 3.5vw;
    padding-left: 5vw;
  }

  .board-mark {
    display: none;
  }
}

/* ===== 入场动效 =====
 * 这里只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套都挂在 .is-entering 下：撤掉这个类，动画连同蒙版一起消失，
 * 元素回落到的静态样式就是动画的终态，交接处不跳变。
 * 少动效时脚本根本不会加这个类，此处无须再挡一层。
 */
.feature.is-gated {
  /* 开场还没落位：整页先按住。visibility 连背景一起藏，不会漏出底色 */
  visibility: hidden;
}

/* ── 背景与弧区 ── */
.feature.is-entering::before {
  animation: enter-bloom var(--enter-dur-bloom) var(--enter-ease) both;
  animation-delay: var(--enter-bloom);
}

.feature.is-entering .grid-background {
  animation: enter-fade var(--enter-dur-grid) ease both;
  animation-delay: var(--enter-grid);
}

/* 蓝光先到、弧面后到：光扫进来，面才跟着亮 */
.feature.is-entering .panel-glow {
  animation: enter-glow var(--enter-dur-glow) var(--enter-ease) both;
  animation-delay: var(--enter-glow);
}

/* 弧面只淡入：它裹着全部卡片，动 transform 会把车道几何量歪 */
.feature.is-entering .stage {
  animation: enter-fade var(--enter-dur-stage) ease both;
  animation-delay: var(--enter-stage);
}

/* 掠光：一道软光沿弧面从左扫到右，正好压在卡片入场的前半段上 */
.feature.is-entering .stage::after {
  content: '';
  position: absolute;
  top: -14%;
  bottom: -14%;
  left: 0;
  width: 34%;
  pointer-events: none;
  background: linear-gradient(
    97deg,
    transparent 0%,
    rgba(255, 255, 255, 0.52) 44%,
    rgba(186, 214, 255, 0.34) 60%,
    transparent 100%
  );
  animation: enter-sweep var(--enter-dur-sweep) var(--enter-ease) both;
  animation-delay: var(--enter-sweep);
}

/* ── 左列 ── */
.feature.is-entering .board-rule {
  animation: enter-rule var(--enter-dur-rule) var(--enter-ease) both;
  animation-delay: var(--enter-rule);
}

/* 主标题自上而下"淌"出来：蒙版比字高三倍，一条软边从顶上一路走到底。
   用蒙版而不是逐字包 span —— 这行是 background-clip:text 的渐变字，
   一个字一层 transform 会把裁切路径和实际字形错开 */
.feature.is-entering .board-title {
  --wipe-mask: linear-gradient(180deg, #000 0%, #000 40%, transparent 52%, transparent 100%);

  mask-image: var(--wipe-mask);
  -webkit-mask-image: var(--wipe-mask);
  mask-size: 100% 300%;
  -webkit-mask-size: 100% 300%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  mask-position: 0 100%;
  -webkit-mask-position: 0 100%;
  animation: enter-title var(--enter-dur-title) var(--enter-ease) both;
  animation-delay: var(--enter-title);
}

/* 副标题逐字亮：字多，间隔小，连起来是一道往下淌的波 */
.feature.is-entering .board-ghost__ch {
  animation: enter-fade var(--enter-dur-ghost) ease both;
  animation-delay: calc(var(--enter-ghost) + var(--ch-i, 0) * var(--enter-ghost-step));
}

.feature.is-entering .board-mark {
  animation: enter-mark var(--enter-dur-mark) var(--enter-ease) both;
  animation-delay: var(--enter-mark);
}

/* ── 卡片：先按车道错开，再按卡序错开，一张接一张落位 ── */
.feature.is-entering .card {
  animation: enter-card var(--enter-dur-card) var(--enter-ease) both;
  animation-delay: calc(
    var(--enter-cards) + var(--lane-i, 0) * var(--enter-lane-step) + var(--card-i, 0) *
      var(--enter-card-step)
  );
}

/* 卡底线比卡本身晚一点抽出来，落位就有个收势 */
.feature.is-entering .card::after {
  transform-origin: left center;
  animation: enter-line var(--enter-dur-line) var(--enter-ease) both;
  animation-delay: calc(
    var(--enter-cards) + var(--lane-i, 0) * var(--enter-lane-step) + var(--card-i, 0) *
      var(--enter-card-step) + var(--enter-line-lag)
  );
}

@keyframes enter-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes enter-bloom {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-glow {
  from {
    opacity: 0;
    transform: translateX(72px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-sweep {
  from {
    opacity: 0;
    transform: translateX(-125%) skewX(-14deg);
  }
  20% {
    opacity: 0.85;
  }
  70% {
    opacity: 0.32;
  }
  to {
    opacity: 0;
    transform: translateX(340%) skewX(-14deg);
  }
}

@keyframes enter-rule {
  from {
    opacity: 0;
    transform: scaleY(0.06);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 蒙版从上往下走：起点整条藏在字上方，终点把四字连同外圈光晕一起放出来。
   终点不取 0%：留一点负偏移，标题那圈 drop-shadow 才不会被蒙版裁掉 */
@keyframes enter-title {
  from {
    opacity: 0;
    transform: translateY(-0.12em);
    mask-position: 0 100%;
    -webkit-mask-position: 0 100%;
  }
  to {
    opacity: 1;
    transform: none;
    mask-position: 0 6%;
    -webkit-mask-position: 0 6%;
  }
}

@keyframes enter-mark {
  from {
    opacity: 0;
    transform: translateY(-0.55em);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 卡片从车道下方浮起来：位移沿车道自己的纵轴，与滚动方向同源 */
@keyframes enter-card {
  from {
    opacity: 0;
    translate: 0 calc(var(--card-h) * 0.09);
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes enter-line {
  from {
    opacity: 0;
    transform: scaleX(0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
