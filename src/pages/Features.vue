<script setup>
import GridBackground from '@/components/GridBackground.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
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
  return {
    // 保留图标自己的配色，糊开后才是一块有细节的云母斑
    src: `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${BLUR_FILTER}<g filter="url(#halo-blur)">${boxed}</g></svg>`,
    )}")`,
    theme: themeFromIcon(parsed.body, '#0a59f7'),
  }
}

// 八项特色功能，一条一张卡
const FEATURES = [
  {
    icon: IconShieldKeyhole,
    logo: LogoCPlusPlus,
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
  },
  {
    icon: IconCloudDownload,
    logo: LogoSwift,
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
  },
  {
    icon: IconLayers,
    logo: LogoPython,
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
  },
  {
    icon: IconWidget,
    logo: LogoJava,
    title: '应用管理',
    desc: '多种安装方式，支持install/data/第三方安装器/install-create，总有一种适合您。',
  },
  {
    icon: IconCpuBolt,
    logo: LogoGo,
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
  },
  {
    icon: IconMagicStick,
    logo: LogoKotlin,
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
  },
  {
    icon: IconFolderFiles,
    logo: LogoVue,
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
  },
  {
    icon: IconScreenShare,
    logo: LogoAndroid,
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
  },
].map(({ logo, ...item }) => ({ ...item, ...prepareLogo(logo) }))

// 车道整条斜过来 20°，屏幕四角投到它的纵轴上有多长，卡片就按这个长度备
const ROT = Math.PI / 9
// 与原来 48 秒滚过一份八张的手感对齐
const SPEED = 37.7
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

// 轨道里只留盖得住可见窗口的卡，滚出去的那张挪到队首，卡数只剩原来的三分之一
const lanesEl = ref(null)
const laneList = []
let rafId = 0
let lastTs = 0
let paused = false
let lanesWatch = null

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

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
  for (const lane of laneList) {
    lane.d += SPEED * dt
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

const onEnter = () => {
  paused = true
}
const onLeave = () => {
  paused = false
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
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  lanesWatch?.disconnect()
  lanesEl.value?.removeEventListener('pointerenter', onEnter)
  lanesEl.value?.removeEventListener('pointerleave', onLeave)
})
</script>

<template>
  <div class="feature">
    <GridBackground :rotation="-30" :z-index="1" />

    <div class="board">
      <!-- 左列：竖排白字，字号顶满整屏高度 -->
      <h1 class="board-title">随心所欲</h1>

      <!-- 主次之间的分隔细线 -->
      <span class="board-rule" aria-hidden="true"></span>

      <!-- 副标题：竖排，独占一列，字数多也不许超过这列宽 -->
      <p class="board-ghost" :style="{ '--ghost-count': SUBTITLE.length }">{{ SUBTITLE }}</p>

      <!-- 列尾英文标记，收住左侧重心 -->
      <span class="board-mark" aria-hidden="true">FEATURES</span>

      <!-- 右列：弧区负责造型，里面的滚动栏负责响应指针 -->
      <section class="panel" aria-label="特色功能">
        <!-- 弧外的蓝色侧光：独立一层，免得滤镜把整块弧区每帧重算一遍 -->
        <span class="panel-glow" aria-hidden="true"></span>
        <div class="stage">
          <div class="rail">
            <div ref="lanesEl" v-once class="lanes">
              <div
                v-for="lane in LANES"
                :key="lane"
                class="track"
              >
                <article
                  v-for="(item, index) in LOOP"
                  :key="index"
                  class="card"
                  :style="{
                    '--accent': item.theme.base,
                    '--logo': item.src,
                  }"
                >
                  <!-- 超大序号当背景水印，超出卡片的部分被裁掉 -->
                  <span class="card-no" aria-hidden="true">{{ item.no }}</span>
                  <!-- 品牌色水印：垫在磨砂层底下，透过玻璃化成一层彩雾 -->
                  <span class="card-halo" aria-hidden="true"></span>
                  <header class="card-head">
                    <!-- 主图标走 solar 系列 -->
                    <span class="card-icon">
                      <component :is="item.icon" width="20" height="20" />
                    </span>
                    <h2 class="card-title">{{ item.title }}</h2>
                  </header>
                  <p class="card-desc">{{ item.desc }}</p>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.feature {
  /* 四字竖排，留出上下气口；窄屏再按宽度收 */
  --title-size: min(20vh, 15vw);
  /* 全页强调色，卡片另按自身图标算主题色 */
  --accent: #0a59f7;

  position: fixed;
  inset: 0;
  overflow: hidden;
  /* 左侧一层蓝雾，和右边弧区接上，深灰才不硬切 */
  background:
    radial-gradient(42% 58% at 13% 50%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 72%),
    #2E3234; /* 首帧兜底，别闪白 */
  user-select: none;
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
  /* 先摆到区域中线，再斜过来 */
  transform: translate(-50%, -50%) rotate(15deg);
}

/* 三条车道各滚各的，位移由脚本每帧写一个 translateY */
.track {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* 提前提层：位移只走合成，卡内内容不必每帧重算 */
  will-change: transform;
}

/* 卡内一切尺寸都按卡高折算，比例由 --card-w 定 */
.card {
  /* 版式自成一格：这些子树的布局与样式计算可以不再波及外面 */
  contain: layout style paint;
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: calc(var(--card-h) * 0.026);
  width: var(--card-w);
  height: fit-content;
  /* 间距用外边距，一份列表的高度才严格等于八张 */
  margin-bottom: var(--card-gap);
  /* 左右比上下宽一点：和浅色弧区并排，横向不留空虚 */
  padding: calc(var(--card-h) * 0.056) calc(var(--card-h) * 0.064) calc(var(--card-h) * 0.088);

  overflow: hidden;
  /* 自成层叠上下文，水印才能垫在内容下 */
  isolation: isolate;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: calc(var(--card-h) * 0.066);
  /* 深蓝墨底：底色几乎压满，压住后面浅弧区，深底上还要留住品牌色 */
  background:
    radial-gradient(
      122% 96% at 88% 114%,
      color-mix(in srgb, var(--accent) 24%, transparent) 0%,
      transparent 64%
    ),
    radial-gradient(90% 70% at 8% -14%, rgba(255, 255, 255, 0.11) 0%, transparent 62%),
    linear-gradient(158deg, #363c47 0%, #22262e 48%, #181b22 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 2px 4px rgba(8, 12, 24, 0.28),
    0 14px 28px rgba(8, 12, 24, 0.26),
    0 30px 58px rgba(8, 12, 24, 0.22);
  transition:
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.32s ease,
    border-color 0.32s ease;
}

/* 语言图标只当背景：原封不动的彩色图标糊开，在深底上化成一层品牌色雾 */
.card-halo {
  position: absolute;
  right: calc(var(--card-h) * -0.03);
  bottom: calc(var(--card-h) * -0.06);
  z-index: -2; /* 垫到最底下 */
  width: calc(var(--card-h) * 0.72);
  height: calc(var(--card-h) * 0.72);
  /* 直接用图标本身的彩色版，不再换成单色遮罩 */
  background-image: var(--logo);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  /* 模糊已经烘进图标本身，这里只留一层渐隐：图形芯子还认得出，外圈直接化进底色 */
  mask-image: radial-gradient(circle at 72% 72%, #000 30%, rgba(0, 0, 0, 0.45) 62%, transparent 92%);
  -webkit-mask-image: radial-gradient(
    circle at 72% 72%,
    #000 30%,
    rgba(0, 0, 0, 0.45) 62%,
    transparent 92%
  );
  opacity: 0.34;
  pointer-events: none;
}

/* 底部一道渐隐强调线，代替满卡留白 */
.card::after {
  content: '';
  position: absolute;
  left: calc(var(--card-h) * 0.064);
  right: calc(var(--card-h) * 0.22);
  bottom: calc(var(--card-h) * 0.06);
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 92%, transparent),
    color-mix(in srgb, var(--accent) 0%, transparent)
  );
}

.card:hover {
  transform: translateY(-8px) scale(1.015);
  border-color: color-mix(in srgb, var(--accent) 46%, rgba(255, 255, 255, 0.14));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 4px 10px rgba(8, 12, 24, 0.34),
    0 22px 42px rgba(8, 12, 24, 0.34),
    0 38px 74px color-mix(in srgb, var(--accent) 30%, transparent);
}

.card:hover .card-halo {
  opacity: 0.5;
}

/* 图标与标题同一行，图标在左、标题紧随 */
.card-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: calc(var(--card-h) * 0.055);
}

.card-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: calc(var(--card-h) * 0.185);
  height: calc(var(--card-h) * 0.185);
  /* 深处一点、亮处一点的品牌色，芯片在深底上透出光 */
  border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  border-radius: calc(var(--card-h) * 0.062);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--accent) 30%, transparent),
    color-mix(in srgb, var(--accent) 10%, transparent)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: color-mix(in srgb, var(--accent) 76%, #ffffff);
}

.card-icon svg {
  display: block;
  width: calc(var(--card-h) * 0.1);
  height: calc(var(--card-h) * 0.1);
}

.card-title {
  min-width: 0;
  margin: 0;
  font-size: max(17px, calc(var(--card-h) * 0.074));
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #f2f5fa;
}

.card-desc {
  /* 占住剩余高度，各卡版式一致 */
  display: block;
  flex: 1 1 auto;
  /* 行数超了直接截断，卡片高度才稳 */
  overflow: hidden;
  max-height: calc(var(--card-h) * 0.46);
  margin: 0;
  /* 正文比上一版抬一档，标题字号保持原样 */
  font-size: max(14px, calc(var(--card-h) * 0.07));
  line-height: 1.68;
  /* 中文末行不落单字，不支持也就是照旧换行 */
  text-wrap: pretty;
  overflow-wrap: break-word;
  color: #b6c0d0;
}

/* 超大水印序号，压在右上角当背景板 */
.card-no {
  position: absolute;
  top: calc(var(--card-h) * -0.12);
  right: calc(var(--card-h) * -0.07);
  z-index: -1; /* 垫到内容底下 */
  font-family: Arial, system-ui;
  font-size: calc(var(--card-h) * 0.44);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  /* 深底上要更亮才认得出，仍压在水印的层次上 */
  color: color-mix(in srgb, var(--accent) 52%, transparent);
  pointer-events: none;
}

.card:hover .card-no {
  color: color-mix(in srgb, var(--accent) 72%, transparent);
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
</style>
