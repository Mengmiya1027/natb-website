<script setup>
import FeatureCard from '@/components/FeatureCard.vue'
import FeatureViewer from '@/components/FeatureViewer.vue'
import { useViewerStore } from '@/stores/viewer'
import { useAnimationStore } from '@/stores/animation'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 图标沿用 solar 的 bold-duotone：两路同色不同明度，压成单色后层次还在
import IconShieldKeyhole from '~icons/solar/shield-keyhole-bold-duotone'
import IconCloudDownload from '~icons/solar/cloud-download-bold-duotone'
import IconLayers from '~icons/solar/layers-minimalistic-bold-duotone'
import IconWidget from '~icons/solar/widget-bold-duotone'
import IconCpuBolt from '~icons/solar/cpu-bolt-bold-duotone'
import IconMagicStick from '~icons/solar/magic-stick-bold-duotone'
import IconFolderFiles from '~icons/solar/folder-with-files-bold-duotone'
import IconScreenShare from '~icons/solar/screen-share-bold-duotone'

/* ===== 色板 =====
 * 每格一块明亮色板，深色窗口截图浮在上面 —— 一屏之内就是一篇彩色画报。
 * 全部是低饱和的纸感色：深色截图压上去对比自然，彼此之间又不打架。
 * 八块都按"墨黑压在它上面"验过对比度，最低一块也有 13:1，远超 AA。
 */
const TINTS = [
  '#f0dfd0', // 陶土米
  '#dce6da', // 鼠尾草
  '#e2deee', // 紫藤
  '#f2e6c8', // 麦
  '#d6e3ec', // 天青
  '#efdcdc', // 玫瑰
  '#e0e6d2', // 橄榄
  '#e9e2d6', // 亚麻
]

/* ===== 插画资源 =====
 * 画报插图在 public/images/art（art-04 单张 639KB，已移除）。
 * 这里不走 import.meta.glob：public 下的文件不该再经打包器，
 * 否则同一张图会被"public 原样拷贝 + 打包器再产出一份"，白白翻倍。
 * 直接用 base 前缀取，剩下交给浏览器缓存。
 * features/cover 下是按功能定制的封面：有封面用封面，没有才回落到画报。
 */
const ART_DIR = import.meta.env.BASE_URL + 'images/art/'
const ART_FILES = ['art-01', 'art-02', 'art-03', 'art-05', 'art-06', 'art-07', 'art-08', 'art-09', 'art-10'].map(
  (n) => ART_DIR + n + '.svg',
)
const COVER_DIR = import.meta.env.BASE_URL + 'images/features/cover/'
// 产品界面截图：只在大窗右侧出现，卡片上用的是 cover
const SHOT_DIR = import.meta.env.BASE_URL + 'images/features/screenshot/'


const FEATURES = [
  {
    icon: IconShieldKeyhole,
    shot: 'root.webp',
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
  },
  {
    icon: IconCloudDownload,
    shot: 'ota.webp',
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
  },
  {
    icon: IconLayers,
    shot: 'rtos.webp',
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
  },
  {
    icon: IconWidget,
    shot: 'appmanager.webp',
    title: '应用管理',
    desc: '多种安装方式，支持install/data/第三方安装器/install-create，总有一种适合您。',
  },
  {
    icon: IconCpuBolt,
    shot: '9008.webp',
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
  },
  {
    icon: IconMagicStick,
    shot: 'magisk.webp',
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
  },
  {
    icon: IconFolderFiles,
    shot: 'filemanager.webp',
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
  },
  {
    icon: IconScreenShare,
    shot: 'scrcpy.webp',
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
  },
].map((item, index) => ({
  ...item,
  // 原始下标：点击时靠它定位，和卡片排在第几格无关
  idx: index,
  no: String(index + 1).padStart(2, '0'),
  tint: TINTS[index % TINTS.length],
  // 每个功能都配了自己那张封面，文件名与截图一致，所以直接按 shot 拼即可
  art: COVER_DIR + item.shot,
  // 截图挪到了 features/screenshot 下，走 base 前缀 —— 它只在大窗里出现
  shot: SHOT_DIR + item.shot,
}))

/* ===== 装饰插画 =====
 * 插画格四面围一圈：顶行六张、底行六张（复用顶行）、左右各两张。
 * 卡片与装饰格共用同一批画报 —— 整面墙只有一套画报语言。
 * 插画格不可点、不进 Tab 序、对读屏隐藏：它们是版面的呼吸，不是内容。
 */
const ART_AT = (i) => ART_FILES[i % ART_FILES.length]
const DECOR_TOP = [0, 1, 2, 3, 4, 5].map(ART_AT)
const DECOR_BOTTOM = DECOR_TOP
const DECOR_SIDE = [6, 7, 8, 9].map(ART_AT)

/* ===== 版式：八格一次看全 =====
 * 桌面上是 4 列 × 4 行 —— 上下两行是装饰插画，中间两行是八张功能卡。
 * 列数写死在断点里，不用 repeat(var(--cols))：变量放进 repeat() 的第一个参数，
 * 有些浏览器会整条判成无效值，于是退化成单列 —— 一屏只顶一张卡，正是这个坑。
 */

/* ===== 入场时间表 =====
 * 只有一份数字，注入成 --enter-* 交给 CSS，样式只管姿态与曲线。
 */
const ENTER = {
  mark: 0,
  kicker: 80,
  title: 150,
  rule: 230,
  lede: 290,
  meta: 370,
  cards: 300,
  cellStep: 44,
  durHead: 780,
  durCell: 720,
}
const ENTER_END = ENTER.cards + ENTER.cellStep * (FEATURES.length - 1) + ENTER.durCell + 40

const ms = (v) => `${v}ms`
const enterVars = {
  '--enter-mark': ms(ENTER.mark),
  '--enter-kicker': ms(ENTER.kicker),
  '--enter-title': ms(ENTER.title),
  '--enter-rule': ms(ENTER.rule),
  '--enter-lede': ms(ENTER.lede),
  '--enter-meta': ms(ENTER.meta),
  '--enter-cards': ms(ENTER.cards),
  '--enter-cell-step': ms(ENTER.cellStep),
  '--enter-dur-head': ms(ENTER.durHead),
  '--enter-dur-cell': ms(ENTER.durCell),
}

const viewer = useViewerStore()
// 开场那场粒子戏还没落位时，这里的入场要等着
const anim = useAnimationStore()
const activeItem = computed(() => (viewer.active >= 0 ? FEATURES[viewer.active] : null))

const gridEl = ref(null)
const wallEl = ref(null)
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

// 点开的那一格在屏幕上的真实几何，充当覆盖层 FLIP 的起点
const originRect = ref(null)
// 格内各元素的同一份几何：大窗要逐元素飞，不能整格一起放大
const originParts = ref(null)
let sourceEl = null

/* ===== 指针：视差与倾斜 =====
 * 视差让整片网格跟着指针反向轻移（±14px），是"镜头在动"而不是"格子在做操"；
 * 倾斜只作用在指针贴着的那一格。角度给到 ±9°：再小就只剩"动了动"，
 * 看不出是朝着指针仰起。
 */
const pax = ref(0)
const pay = ref(0)
const TILT_MAX = 9
let tiltCell = null

function clearTilt() {
  if (!tiltCell) return
  tiltCell.style.removeProperty('--tilt-x')
  tiltCell.style.removeProperty('--tilt-y')
  tiltCell = null
}

function onPointerMove(event) {
  if (reduceMotion || viewer.expanded) return
  const wall = wallEl.value
  if (wall) {
    const r = wall.getBoundingClientRect()
    pax.value = (0.5 - (event.clientX - r.left) / r.width) * 14
    pay.value = (0.5 - (event.clientY - r.top) / r.height) * 10
  }
  const cell = event.target instanceof Element ? event.target.closest('.cell') : null
  if (!cell) {
    clearTilt()
    return
  }
  if (cell !== tiltCell) clearTilt()
  tiltCell = cell
  const r = cell.getBoundingClientRect()
  const nx = (event.clientX - r.left) / r.width - 0.5
  const ny = (event.clientY - r.top) / r.height - 0.5
  cell.style.setProperty('--tilt-y', `${(nx * TILT_MAX * 2).toFixed(2)}deg`)
  cell.style.setProperty('--tilt-x', `${(-ny * TILT_MAX * 2).toFixed(2)}deg`)
}

function onPointerLeave() {
  clearTilt()
  pax.value = 0
  pay.value = 0
}

// 倾斜角度由样式给，脚本要用时现读 —— 断点改了角度这里跟着变，不会两处写死
function wallRotation() {
  const el = wallEl.value?.querySelector('.wall__tilt')
  if (!el) return 0
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  try {
    const m = new DOMMatrixReadOnly(t)
    return (Math.atan2(m.b, m.a) * 180) / Math.PI
  } catch {
    return 0
  }
}

/**
 * 元素躺在倾斜的墙里，拿到的是旋转后的外接矩形，
 * 用三角函数反解出未旋转的真实宽高（旋转不改中心）。
 */
function quadOrigin(el, rot) {
  const r = el.getBoundingClientRect()
  const rad = (rot * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const den = cos * cos - sin * sin
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: (r.width * cos - r.height * sin) / den,
    h: (r.height * cos - r.width * sin) / den,
    rot,
  }
}

async function pickCard(event) {
  if (viewer.expanded) return
  const el = event.target instanceof Element ? event.target.closest('.cell') : null
  if (!el || !gridEl.value?.contains(el)) return
  const index = Number(el.dataset.index)
  if (!Number.isInteger(index) || index < 0 || index >= FEATURES.length) return

  // 倾斜态下量出来的矩形是歪的，量之前先让这一格回正
  clearTilt()

  // 入场还没跑完就点：先把动画撤掉，等类真正落地再量，量到的才是落位后的几何
  if (entering.value) {
    finishEntrance()
    await nextTick()
  }
  const rot = wallRotation()
  const origin = quadOrigin(el, rot)
  origin.radius = parseFloat(getComputedStyle(el).borderRadius) || 0
  originRect.value = origin

  const pick = (sel) => {
    const node = el.querySelector(sel)
    return node ? quadOrigin(node, rot) : null
  }
  // 字号也带上：框宽未必等于文字宽，只按框宽缩放会把标题压扁
  const font = (sel) => {
    const node = el.querySelector(sel)
    return node ? parseFloat(getComputedStyle(node).fontSize) : null
  }
  originParts.value = {
    title: pick('.cell__head'),
    desc: pick('.cell__desc'),
    fonts: {
      title: font('.cell__title'),
      desc: font('.cell__desc'),
    },
  }
  sourceEl = el
  viewer.open(index)
}

/** 覆盖层预光栅完、动画即将起手，这一刻才把真格藏掉，交接处不留空白 */
function onViewerReady() {
  if (sourceEl) sourceEl.style.visibility = 'hidden'
}

/**
 * 真格归位。收起时大窗会在格子淡出前先发 release 把它放出来，
 * 此时它被覆盖层压着看不见，交接处就没有空白也没有突变。
 */
function restoreSource() {
  const el = sourceEl
  if (!el) return
  sourceEl = null
  el.style.transition = 'none'
  el.style.visibility = ''
  void el.offsetWidth
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = ''
  }))
}

function onViewerClosed() {
  restoreSource()
  viewer.finish()
}

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
}

/** 从"按住"切到"起跑"：同一帧里换类，各条时间轴都从 0% 开始 */
function openEntrance() {
  gated.value = false
  entering.value = true
  enterTimer = window.setTimeout(finishEntrance, ENTER_END)
}

onMounted(() => {
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

watch(() => viewer.expanded, (open) => {
  if (open) {
    clearTilt()
    pax.value = 0
    pay.value = 0
  }
})

onBeforeUnmount(() => {
  clearTilt()
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
    :inert="viewer.expanded || undefined"
  >
    <!-- ── 刊头：编辑版式的页眉。左栏是刊名与刊题，右栏是导语加八项目录 ── -->
    <header class="masthead">
      <!-- 印刷套准标记：编辑版式最小的那个记号 -->
      <span class="masthead__mark" aria-hidden="true"></span>

      <div class="masthead__grid">
        <div class="masthead__lead">
          <span class="masthead__kicker">NATB — 特色功能</span>
          <!-- 双色调标题：后两字退成暖灰，一句四字就分出了主次 -->
          <h1 class="masthead__title">
            <span class="masthead__title-a">随心</span><span class="masthead__title-b">所欲</span>
          </h1>
        </div>

        <div class="masthead__note">
          <p class="masthead__lede">全方面支持小天才手表玩机需求</p>
          <p class="masthead__meta">
            <span>08 FEATURES</span>
            <span class="masthead__dot" aria-hidden="true"></span>
            <span>SINCE 2026</span>
          </p>
        </div>
      </div>

      <span class="masthead__rule" aria-hidden="true"></span>
    </header>

    <!-- ── 图片墙：页面真正的主角 ── -->
    <section
      ref="wallEl"
      class="wall"
      aria-label="特色功能"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    >
      <!-- 内缩再旋转：旋转后四角仍落在墙内，一张卡都不会被裁 -->
      <div class="wall__tilt">
        <div
          ref="gridEl"
          class="grid"
          :style="{ transform: `translate3d(${pax.toFixed(2)}px, ${pay.toFixed(2)}px, 0)` }"
          @click="pickCard"
        >
          <!-- 顶行：六张插画 -->
          <span
            v-for="(src, i) in DECOR_TOP"
            :key="`top-${i}`"
            class="tile"
            aria-hidden="true"
            :style="{ '--i': i }"
          >
            <img class="tile__img" :src="src" alt="" draggable="false" />
          </span>

          <!-- 第二行：左插画 + 四张卡 + 右插画 -->
          <span class="tile" aria-hidden="true" :style="{ '--i': 6 }">
            <img class="tile__img" :src="DECOR_SIDE[0]" alt="" draggable="false" />
          </span>
          <FeatureCard
            v-for="(item, i) in FEATURES.slice(0, 4)"
            :key="item.idx"
            :item="item"
            :data-index="item.idx"
            :style="{ '--i': 7 + i }"
          />
          <span class="tile" aria-hidden="true" :style="{ '--i': 11 }">
            <img class="tile__img" :src="DECOR_SIDE[1]" alt="" draggable="false" />
          </span>

          <!-- 第三行：左插画 + 四张卡 + 右插画 -->
          <span class="tile" aria-hidden="true" :style="{ '--i': 12 }">
            <img class="tile__img" :src="DECOR_SIDE[2]" alt="" draggable="false" />
          </span>
          <FeatureCard
            v-for="(item, i) in FEATURES.slice(4)"
            :key="item.idx"
            :item="item"
            :data-index="item.idx"
            :style="{ '--i': 13 + i }"
          />
          <span class="tile" aria-hidden="true" :style="{ '--i': 17 }">
            <img class="tile__img" :src="DECOR_SIDE[3]" alt="" draggable="false" />
          </span>

          <!-- 底行：六张插画，把下沿也围上 -->
          <span
            v-for="(src, i) in DECOR_BOTTOM"
            :key="`bot-${i}`"
            class="tile"
            aria-hidden="true"
            :style="{ '--i': 18 + i }"
          >
            <img class="tile__img" :src="src" alt="" draggable="false" />
          </span>
        </div>
      </div>

    </section>

    <!-- 展开的大窗：Teleport 到 body，压在顶栏之上 -->
    <FeatureViewer
      v-if="viewer.expanded && activeItem && originRect"
      :item="activeItem"
      :origin="originRect"
      :origin-parts="originParts"
      :total="FEATURES.length"
      @ready="onViewerReady"
      @release="restoreSource"
      @closed="onViewerClosed"
    />
  </div>
</template>

<style scoped>
.feature {
  /* ── 纸感色板 ──
     每一档都按 WCAG AA 反推过对比度，注释里是对纸色的实测值 */
  --paper: #f8f6f2; /* 象牙白纸：刊头与页面底色 */
  --stage: rgb(40, 50, 61); /* 展示区的墨蓝底（inkore 实测值）——图版从这块深色里浮出来 */
  --ink: #16150f; /* 墨黑：刊题、卡题 —— 对纸 17.9:1 */
  --ink-2: #4a4740; /* 次级墨：导语、目录 —— 8.6:1 */
  --ink-3: #6b6559; /* 三级灰：小字 —— 5.6:1（小字需 ≥4.5） */
  --ink-4: #857e72; /* 浅灰：双色调刊题、分隔点 —— 3.4:1（大字需 ≥3） */
  --rule: rgba(22, 21, 15, 0.14);

  --font-latin: ui-sans-serif, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  /* 刊头高度：左栏要站得住 66px 的刊题，右栏要放下导语、八项目录与期号 */
  --masthead-h: clamp(124px, 16.5vh, 192px);

  /* 页面锁死在视窗里，不滚动 */
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  user-select: none;
}

/* ===== 刊头 ===== */
.masthead {
  /* 绝对定位在顶部，不参与网格的居中计算 ——
     展示区的中心才是视窗的中心，刊头只是压在它上方的字 */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  /* 少了这一句，height 里的 clamp 只是内容高，加上下 padding 实际会高出 40px */
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: var(--masthead-h);
  padding: clamp(18px, 2.5vh, 34px) clamp(24px, 4.6vw, 72px) clamp(13px, 1.9vh, 24px);
  /* 实底色：网格是斜着铺开的，不挡住就会从标题背后透出来 */
  background: var(--paper);
  /* 只是版面上的字，别挡住网格的指针操作 */
  pointer-events: none;
}

/* 套准标记：两根发丝交叉，与 kicker 左对齐 ——
   它不是角落里的小装饰，得落在版心那条线上 */
.masthead__mark {
  position: absolute;
  top: clamp(17px, 2.4vh, 30px);
  left: clamp(24px, 4.6vw, 72px);
  width: 11px;
  height: 11px;
}

.masthead__mark::before,
.masthead__mark::after {
  content: '';
  position: absolute;
  background: rgba(22, 21, 15, 0.3);
}

.masthead__mark::before {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.masthead__mark::after {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
}

/* 左右各占一半：左栏贴左放刊名与刊题，右栏贴右放导语与期号 ——
   编辑版式的页眉靠两端对拉，中间那片留白是留给版心的 */
.masthead__grid {
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
  align-items: end;
  gap: clamp(24px, 4vw, 84px);
}

.masthead__lead {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.3vh, 17px);
  min-width: 0;
}

.masthead__kicker {
  font-family: var(--font-latin);
  font-size: clamp(10px, 0.7vw, 11.5px);
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ink-3);
  white-space: nowrap;
}

/* 刊题：这一段版面的主角。上一版只有 39px，四个字撑不满左栏，
   右半边又空着，整条页眉就没有落点 */
.masthead__title {
  margin: 0;
  font-size: clamp(40px, 4.4vw, 66px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ink);
  white-space: nowrap;
}

.masthead__title-b {
  color: var(--ink-4);
}

.masthead__note {
  display: flex;
  flex-direction: column;
  /* 右对齐：右栏整体贴住版心右侧，与左边的刊题形成两端对拉 */
  align-items: flex-end;
  justify-content: flex-end;
  align-self: stretch;
  text-align: right;
  gap: clamp(9px, 1.4vh, 17px);
  /* 竖线落在最右边：它是版心的右界，不是栏与栏之间的那道分隔 */
  padding-right: clamp(20px, 2.6vw, 48px);
  border-right: 1px solid var(--rule);
  padding-bottom: clamp(2px, 0.5vh, 7px);
  min-width: 0;
}

.masthead__lede {
  margin: 0;
  font-size: clamp(15px, 1.15vw, 19px);
  line-height: 1.58;
  color: var(--ink-2);
  text-wrap: pretty;
}

.masthead__meta {
  display: flex;
  align-items: center;
  gap: 0.9em;
  margin: 0;
  font-family: var(--font-latin);
  font-size: clamp(9.5px, 0.66vw, 10.5px);
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}

.masthead__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--ink-4);
}

/* 刊头收尾的一条发丝线：主次之间的分界只靠这一笔，不加投影 */
.masthead__rule {
  position: absolute;
  left: clamp(20px, 4.4vw, 68px);
  right: clamp(20px, 4.4vw, 68px);
  bottom: 0;
  height: 1px;
  background: var(--rule);
  transform-origin: left center;
}

/* ===== 图片墙 ===== */
.wall {
  /* 铺满视窗，网格居中于视窗中心；溢出的部分由这里裁掉 ——
     裁切正是要的效果：图版伸出屏幕外，版面就没有边界 */
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  /* 墨蓝底：图版从深色里浮出来，格与格之间那道缝成了版面的网格线 */
  background: var(--stage);
}

/*
 * 比视窗大一圈：横竖都伸出屏幕外，边缘那一圈插画被裁在画外。
 * 上一版把它内缩在视窗里、四边留白，看着就是"贴在纸上的一张图"，
 * 边缘全是硬边 —— 出血才是编辑版式该有的样子。
 */
.wall__tilt {
  position: relative;
  width: 108vw;
  /* 高度按"刊头 + 上下两行插画各露一截"反推：108vh 会把底行整条推出屏外，
     100vh 才是卡片够高、上下又都透得出来的那一点 */
  height: 100vh;
  /* 整片墙往左下让一让：上方空出来给刊头，重心也压到版面偏下的位置 ——
     正中对齐时顶行插画几乎全被标题压住，往下挪一档就透出来了 */
  transform: translate(var(--wall-dx, -2.4vw), var(--wall-dy, 10vh))
    rotate(var(--wall-rot, 2.5deg));
}

.grid {
  display: grid;
  /* 左右各一条窄插画列、上下各一行插画行 —— 八张卡被四面围住，
     中间四列才是内容。窄列用 0.55fr：插画是配角，别跟卡抢宽度。
     列数写死在断点里：repeat() 的第一个参数放 CSS 变量，有些浏览器会整条判成
     无效值 → grid-template-columns 失效 → 退化成单列，一屏只顶一张卡 */
  grid-template-columns: 0.55fr repeat(4, minmax(0, 1fr)) 0.55fr;
  /* 插画行略矮、卡行高：按 1.6:1 的插画反推，卡里的图版才不挨裁。
     行高由这块"比屏幕还大"的画布按比例分，所以视窗一变，整片墙等比跟着变 */
  grid-template-rows: 0.9fr 1fr 1fr 0.9fr;
  gap: var(--grid-gap, 8px);
  width: 100%;
  height: 100%;
  /* 视差：整片网格跟着指针反向轻移。缓动给足，是"镜头在动"而不是"格子在做操" */
  transition: transform 1100ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 装饰格：一张画报插画铺满，没有文字、不可点。
   插画是 3:2 而格子更扁，用 cover 从中心裁 —— 有机图形裁掉上下依然成立 */
.tile {
  position: relative;
  display: block;
  height: 100%;
  overflow: hidden;
  border-radius: 2px;
  background: var(--paper);
}

.tile__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* ===== 响应式 =====
 * 断点改两样：列数（八格怎么排）与倾斜角（斜得越厉害，边缘要的余量越多）。
 */
@media (min-width: 768px) and (max-width: 1023px) {
  /* 六列在这个宽度下只剩 209px 一格，卡太窄 —— 收掉左右两条插画列与上下两端
     多出来的插画，只留上下各一行、四列四行，卡才保得住 270px。
     nth-child 按下标点名：1-6 是顶行、7/12/13/18 是左右两条、19-24 是底行 */
  .grid > *:nth-child(5),
  .grid > *:nth-child(6),
  .grid > *:nth-child(7),
  .grid > *:nth-child(12),
  .grid > *:nth-child(13),
  .grid > *:nth-child(18),
  .grid > *:nth-child(23),
  .grid > *:nth-child(24) {
    display: none;
  }

  .grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .wall__tilt {
    --wall-rot: 2.2deg;
  }

  .masthead__grid {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}

@media (max-width: 767px) {
  .feature {
    --grid-gap: 6px;
    /* 手机上刊头与网格要分掉 844px：刊头只留刊名、刊题、导语与期号 */
    --masthead-h: clamp(110px, 15vh, 152px);
  }

  .masthead {
    padding: clamp(12px, 1.8vh, 20px) clamp(16px, 5vw, 28px) clamp(8px, 1.4vh, 14px);
  }

  .masthead__mark {
    top: clamp(14px, 2vh, 20px);
    left: clamp(16px, 5vw, 28px);
  }

  .masthead__grid {
    /* 窄屏改成上下两行：右栏顶到标题下面，导语不会被挤成一列窄条 */
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: clamp(8px, 1.4vh, 14px);
  }

  .masthead__note {
    /* 窄屏改成上下两行：右对齐与右侧竖线在这里都失去意义 */
    align-items: flex-start;
    align-self: auto;
    text-align: left;
    padding-bottom: 0;
    padding-right: 0;
    border-right: 0;
  }

  .masthead__title {
    font-size: clamp(30px, 9vw, 44px);
  }

  .masthead__rule {
    left: clamp(16px, 5vw, 28px);
    right: clamp(16px, 5vw, 28px);
  }

  /* 两列四行：八张卡一次看全。手机上再斜就只剩裁切了，角度收到 2° */
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
  }

  /* 窄屏收起装饰插画：给卡留出可读的宽度 */
  .tile {
    display: none;
  }

  /* 手机上四行都要落在屏内：网格从刊头下沿起算，只向左右出血，
     所以纵向不再偏移、也不再溢出 */
  .wall {
    top: var(--masthead-h);
  }

  .wall__tilt {
    --wall-rot: 2deg;
    --wall-dy: 0vh;
    --wall-dx: -2vw;
    width: 112vw;
    height: 100%;
  }
}

@media (max-width: 480px) {
  .wall__tilt {
    /* 再窄就完全不斜：斜出来的裁切会把格子里的字吃掉 */
    --wall-rot: 0deg;
    padding: 0.6%;
  }
}

/* ===== 入场 =====
 * 这里只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套都挂在 .is-entering 下：撤掉这个类，动画连同蒙版一起消失，
 * 元素回落到的静态样式就是动画的终态，交接处不跳变。
 */
.feature {
  /* 入场共用一条缓动：只靠错峰分出层次，才像一口气 */
  --enter-ease: cubic-bezier(0.22, 1, 0.36, 1);
}

.feature.is-gated {
  /* 开场还没落位：整页先按住。visibility 连背景一起藏，不会漏出底色 */
  visibility: hidden;
}

.feature.is-entering .masthead__mark {
  animation: enter-fade var(--enter-dur-head) ease both;
  animation-delay: var(--enter-mark);
}

.feature.is-entering .masthead__kicker {
  animation: enter-rise var(--enter-dur-head) var(--enter-ease) both;
  animation-delay: var(--enter-kicker);
}

.feature.is-entering .masthead__title {
  animation: enter-rise var(--enter-dur-head) var(--enter-ease) both;
  animation-delay: var(--enter-title);
}

.feature.is-entering .masthead__rule {
  animation: enter-rule var(--enter-dur-head) var(--enter-ease) both;
  animation-delay: var(--enter-rule);
}

.feature.is-entering .masthead__lede {
  animation: enter-rise var(--enter-dur-head) var(--enter-ease) both;
  animation-delay: var(--enter-lede);
}

.feature.is-entering .masthead__meta {
  animation: enter-fade var(--enter-dur-head) ease both;
  animation-delay: var(--enter-meta);
}

/* 十六格一起按序号错峰浮现。位移走 translate 属性 —— transform 留给指针倾斜 */
.feature.is-entering .cell,
.feature.is-entering .tile {
  animation: enter-cell var(--enter-dur-cell) var(--enter-ease) both;
  animation-delay: calc(var(--enter-cards) + var(--i, 0) * var(--enter-cell-step));
}

@keyframes enter-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes enter-rise {
  from {
    opacity: 0;
    translate: 0 0.5em;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes enter-rule {
  from {
    opacity: 0;
    transform: scaleX(0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 格子从下方浮上来，并顺带把"窗口浮起"那点位移预演一遍 */
@keyframes enter-cell {
  from {
    opacity: 0;
    translate: 0 22px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* 少动效：类压根不会挂上，这里只做兜底，保证元素停在终态 */
@media (prefers-reduced-motion: reduce) {
  .grid {
    transition: none;
  }

  .feature.is-entering .cell,
  .feature.is-entering .masthead__mark,
  .feature.is-entering .masthead__kicker,
  .feature.is-entering .masthead__title,
  .feature.is-entering .masthead__rule,
  .feature.is-entering .masthead__lede,
  .feature.is-entering .masthead__meta {
    animation: none;
  }
}
</style>
