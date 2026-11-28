<script setup>
/**
 * 首页：首屏一屏到底，往下是完整的落地页论证。
 *
 * 首页就是一屏，不做滚动：hero（WebGPU 玻璃碎片 + 星云视频 + 玻璃按钮）负责
 * "这是什么、下一步去哪"，所有需要展开的信息都留在 dock 页里，
 * 首页不复制它们的正文，也不在首屏下面挂第二屏。
 * 视觉值走 src/styles/landing.css 里的 token，这里不各自写字号与间距。
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import GlassSurface from '@/components/vue-bits/GlassSurface.vue'
import TechText from '@/components/vue-bits/TechText.vue'
import WebThreads from '@/components/vue-bits/WebThreads.vue'
import IconRoot from '~icons/solar/shield-keyhole-bold'
import IconOta from '~icons/solar/refresh-circle-bold'
import IconApps from '~icons/solar/box-bold'
import IconCast from '~icons/solar/screen-share-bold'
import IconVerified from '~icons/solar/verified-check-bold'
import { useAnimationStore } from '@/stores/animation'
import { useUpdateLog } from '@/utils/updateLog'
import '@/styles/landing.css'

const QQ_URL = 'https://qm.qq.com/q/Cb2vLZtsZ4'
const QQ_GROUP = '496522811'

const anim = useAnimationStore()
const { latest } = useUpdateLog()

// 版本号跟着 public/json/UpdateLog.json 走；读不到时退回当前已知版本
const version = computed(() => latest.value?.version ?? 'v1.1.1')
const versionLabel = computed(() => `${version.value} 已发布`)

/* 四个能力标签：图标 + 文字。
 * 图标统一 Solar bold，与导航坞、按钮里用的是同一套笔画；
 * 颜色取低饱和的那支紫，只做点缀——标签本身仍是中性白灰。 */
const TAGS = [
  { label: '一键 ROOT', icon: IconRoot },
  { label: '离线 OTA', icon: IconOta },
  { label: '应用管理', icon: IconApps },
  { label: '投屏控制', icon: IconCast },
]

/**
 * 背景预览开关：?bg=aero-shards 才换成 WebGPU 版 AeroShards，其余情况（含无参数）完全走 WebThreads。
 * 两条保险：
 *   1. 没有 navigator.gpu 的设备即使带了参数也回落，不给浏览器一个必然失败的初始化；
 *   2. 用异步组件，正常访问时 vgpu（含整套 WebGPU 管线代码）根本不下载。
 */
const AeroShards = defineAsyncComponent(() => import('@/components/AeroShards.vue'))

function wantsAeroShards() {
  if (typeof window === 'undefined') return false
  // 首页默认启用 AeroShards：WebGPU 不可用的设备自动回落 WebThreads，不会白屏。
  // ?bg=webthreads 可强制切回旧背景（排障用，也给低端机留一个手动出口）。
  const optOut = new URLSearchParams(window.location.search).get('bg') === 'webthreads'
  const supported = typeof navigator !== 'undefined' && !!navigator.gpu
  return supported && !optOut
}

const useAeroShards = wantsAeroShards()

// 档位也可由 URL 覆盖：?quality=low(默认双层 dpr1.5) / single(单层 dpr1.5，pass 少但像素多) / mid / high
const AERO_QUALITIES = ['low', 'single', 'smooth', 'rich', 'mid', 'high']
const aeroQuery = new URLSearchParams(window.location.search)
// 默认 rich：实测这台机器连 dpr0.85 都撑不住真 60fps（smooth 达不到 60），
// 而 rich 是稳定 30fps（60Hz 上正好两帧一次、帧间隔均匀）+ 满画质，观感更好。
// ?quality=smooth 可切回帧率优先。
const aeroQuality = AERO_QUALITIES.includes(aeroQuery.get('quality')) ? aeroQuery.get('quality') : 'rich'

// ?fps=N 直接覆盖帧率上限（0=跟随刷新率）。在真机上探自己的上限，不必改代码。
const aeroFps = (() => {
  const raw = Number(aeroQuery.get('fps'))
  return aeroQuery.get('fps') !== null && Number.isFinite(raw) && raw >= 0 && raw <= 240 ? raw : null
})()

if (import.meta.env.DEV) {
  // 开发期自测用：刷一下就知道当前挂在哪个背景上
  console.info(
    '[HomePage] 背景 =',
    useAeroShards
      ? `AeroShards (WebGPU, quality=${aeroQuality}, fps=${aeroFps ?? '档位默认'})`
      : 'WebThreads (WebGL)',
  )
}

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

/** 切到站内其它页：App.vue 收到这个事件后换背景页 */
function goTab(id) {
  window.dispatchEvent(new CustomEvent('natb:tab', { detail: id }))
}

/* 标题由 TechText 的 canvas 画：字号跟着 CSS 的 clamp 走（组件的 autoFontSize 读容器字号），
 * 脚本只补两件 CSS 办不到的事——落字对齐，以及画布里的金属色标。 */

/* 960 以下整块内容居中，标题的 canvas 也要按居中落字，否则它会贴住左缘 */
const narrowLayout =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 960px)')
    : null
const isNarrow = ref(narrowLayout?.matches === true)
const titleAlign = computed(() => (isNarrow.value ? 'center' : 'left'))

function onNarrowLayout(event) {
  isNarrow.value = event.matches
}

/* 九段纵向灰阶：标题原来的金属材质（CSS background-clip: text），
 * 顶部受光 → 中段暗带 → 回亮 → 下缘收灰。canvas 里换同一组 stop，材质才不丢。
 * 窄屏字号小，九段会挤成一道脏灰带，只留受光到收灰四段。 */
const TITLE_INK = ['#ffffff', '#f8f8f9', '#e2e2e6', '#b6b6bd', '#ececee', '#ffffff', '#e2e2e6', '#bfbfc5']
const TITLE_INK_NARROW = ['#ffffff', '#f8f8f9', '#e2e2e6', '#bfbfc5']
const titleInk = computed(() => (isNarrow.value ? TITLE_INK_NARROW : TITLE_INK))

/* 两行标题共用的 TechText 参数：只差一句 text，其余逐项相同就抽在一处，
 * 免得哪天调一次描边要在两个地方各改一遍。 */
const titleTech = computed(() => ({
  fontSize: 96,
  autoFontSize: true,
  fontWeight: 400,
  letterSpacing: -0.03,
  align: titleAlign.value,
  gradient: titleInk.value,
  accentColor: '#a98bff',
  reach: 180,
  strokeWidth: 1.4,
  dashLength: 4,
  dashGap: 3,
  labels: false,
  draggable: false,
  clickKick: false,
  sweep: !reduceMotion,
  speed: 0.7,
}))

const videoRef = ref(null)
const heroRef = ref(null)

/* 玻璃被拖动时把首页的动态背景停帧：拖拽期间玻璃每帧都要重采样 backdrop，
 * 视频解码 + WebGPU 重绘叠在一起会把它拖到 40fps 以下；松手立即恢复。 */
const glassDragging = ref(false)

function onGlassDrag(event) {
  glassDragging.value = event?.detail === true
}

/* 首屏滚出视口后停掉背景与视频：页面变长了，用户在下面读 FAQ 时
 * 没必要继续为一个看不见的 hero 每帧跑一次 WebGPU 与视频解码。 */
const heroOffscreen = ref(false)

const backgroundPaused = computed(
  () => reduceMotion || glassDragging.value || heroOffscreen.value,
)

let heroObserver = null

watch(
  [backgroundPaused, videoRef],
  ([paused, video]) => {
    if (!video) return
    if (paused) video.pause()
    else video.play?.().catch(() => {})
  },
  { flush: 'post' },
)

onMounted(() => {
  narrowLayout?.addEventListener?.('change', onNarrowLayout)
  window.addEventListener('natb:glass-drag', onGlassDrag)
  // 首页不再有粒子开场，但顶栏仍靠 isLanded 滑进来
  anim.land()
  document.documentElement.classList.add('home-is-dark')

  // 模板里写 muted 在部分浏览器不生效（会被判成"有声自动播放"而拒绝），这里用 property 兜底
  const video = videoRef.value
  if (video) {
    video.muted = true
    if (reduceMotion) video.pause()
  }

  if ('IntersectionObserver' in window && heroRef.value) {
    heroObserver = new IntersectionObserver(
      (entries) => {
        heroOffscreen.value = !entries[0].isIntersecting
      },
      { threshold: 0.05 },
    )
    heroObserver.observe(heroRef.value)
  }
})

onBeforeUnmount(() => {
  narrowLayout?.removeEventListener?.('change', onNarrowLayout)
  window.removeEventListener('natb:glass-drag', onGlassDrag)
  document.documentElement.classList.remove('home-is-dark')
  heroObserver?.disconnect()
})
</script>

<template>
  <div class="home lp">
    <a class="lp-skip" href="#content">跳到正文</a>

    <main id="content">
      <header ref="heroRef" class="hero">
        <div class="hero__bg" aria-hidden="true">
          <div class="hero__fallback"></div>
          <div class="hero__video" aria-hidden="true">
            <video
              ref="videoRef"
              class="hero__video-el"
              src="/videos/bg-video.mp4"
              autoplay
              loop
              playsinline
              preload="auto"
            ></video>
          </div>
          <div class="hero__threads">
            <AeroShards
              v-if="useAeroShards"
              :quality="aeroQuality"
              :fps="aeroFps"
              shard-color="#6d5cff"
              accent-color="#a98bff"
              :paused="backgroundPaused"
            />
            <WebThreads
              v-else
              color1="#6d5cff"
              color2="#36d7ff"
              color3="#ffffff"
              :speed="reduceMotion ? 0 : 0.16"
              :thread-count="7"
              :frequency="4.6"
              :spread="0.2"
              :taper="0.85"
              :position="0.5"
              fan-mode="center"
              :glow="0.018"
              :falloff="0.62"
              :thickness="1.05"
              :brightness="0.62"
              :opacity="0.92"
              :mouse-interaction="!reduceMotion"
              :mouse-strength="0.22"
              :dpr="1.5"
              :paused="backgroundPaused"
            />
          </div>
          <div class="hero__veil"></div>
          <div class="hero__grid"></div>
          <div class="hero__scrim"></div>
        </div>

        <div class="hero__inner">
          <div class="hero__copy">
          <p class="hero__badge">
            <span class="hero__badge-version">
              <IconVerified width="14" height="14" aria-hidden="true" />
              {{ versionLabel }}
            </span>
            <span class="hero__badge-line" aria-hidden="true"></span>
            <span class="hero__badge-text">小天才手表 ADB 工具箱</span>
          </p>

          <!-- 标题交给 TechText 的 canvas：指针扫过的字母会从实心字变成虚线矢量轮廓。
               文本正文留在这里供读屏与搜索索引，视觉上裁到 1px。 -->
          <h1 class="hero__title">
            <span class="hero__title-sr">New Android Tool Box</span>
            <span class="hero__title-line hero__title-line--lead" aria-hidden="true">
              <TechText v-bind="titleTech" text="New Android" :sweep-phase="0" />
            </span>
            <span class="hero__title-line hero__title-line--accent" aria-hidden="true">
              <!-- 相位错开约三分之一程：两行待机扫过各走各的，不会一起从左扫到右 -->
              <TechText v-bind="titleTech" text="Tool Box" :sweep-phase="5" />
            </span>
          </h1>

          <p class="hero__tagline">小天才手表，一个窗口全部搞定。</p>
          <p class="hero__lead">
            ROOT、离线 OTA、装应用、投屏四件事在同一个 Windows<br class="hero__lead-br" />
            窗口里做完，不敲命令。
          </p>
          </div>

          <GlassSurface
            class="hero__actions-glass"
            width="auto"
            height="auto"
            :border-radius="999"
            :border-width="0.18"
            :displace="0.5"
            :distortion-scale="-180"
            :background-opacity="0.2"
            :saturation="1"
            :blur="14"
            :brightness="62"
          >
            <div class="hero__actions">
              <a class="btn btn--primary" :href="QQ_URL" target="_blank" rel="noopener">
                <i-solar-download-minimalistic-bold width="18" height="18" aria-hidden="true" />
                <span>获取安装包</span>
              </a>
              <button class="btn btn--ghost" type="button" @click="goTab('features')">
                <i-solar-widget-4-bold width="18" height="18" aria-hidden="true" />
                <span>查看功能介绍</span>
              </button>
            </div>
          </GlassSurface>

          <ul class="hero__tags" aria-label="核心能力">
            <li v-for="tag in TAGS" :key="tag.label" class="tag">
              <component :is="tag.icon" width="14" height="14" aria-hidden="true" />
              <span>{{ tag.label }}</span>
            </li>
          </ul>
        </div>

        <div class="hero__foot" aria-hidden="true">
          <span>NATB DEVELOPER GROUP</span>
          <span>仅供学习交流 · ROOT 有风险</span>
        </div>
      </header>

    </main>
  </div>
</template>

<style scoped>
.home {
  /* 首页只有一屏：整屏固定，不产生任何滚动。
   * 需要展开的内容放到 dock 页（功能 / 更新 / 关于）里，首页不承担。 */
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: var(--lp-bg);
  color: var(--lp-text-1);
  font-family: var(--lp-font);
  -webkit-font-smoothing: antialiased;
}

.hero {
  position: relative;
  isolation: isolate;
  height: 100dvh;
  min-height: 620px;
  overflow: hidden;
}

/* ============================================================
 * 背景
 * ========================================================== */
/* 背景只占右侧：左边留给文字，中间靠羽化过渡，不留一条硬边。
 * 羽化用 mask 而不是背景渐变——图像层保持完整，背景仍然不许用渐变铺。 */
.hero__bg {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: auto;
  z-index: 0;
  width: min(70%, 1180px);
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 0, 0, 0.45) 12%,
    rgba(0, 0, 0, 0.9) 30%,
    #000 46%,
    #000 100%
  );
  mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 0, 0, 0.45) 12%,
    rgba(0, 0, 0, 0.9) 30%,
    #000 46%,
    #000 100%
  );
}

.hero__fallback {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(58% 52% at 50% 46%, rgba(94, 82, 255, 0.2), transparent 72%),
    radial-gradient(42% 42% at 74% 30%, rgba(53, 214, 255, 0.11), transparent 72%),
    radial-gradient(38% 38% at 24% 62%, rgba(255, 114, 205, 0.07), transparent 72%);
}

/* 星云视频打底：AeroShards 的玻璃碎片浮在它上面，碎片的折射会带出星云颜色。
 * 压一档亮度，避免橙金高光和标题抢注意力。 */
.hero__video {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: 1;
}

.hero__video-el {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 视频裁到右侧竖块后只剩中间那段，星云的暗部正好落在这里。
   * 把取景往右推，让亮的那片云进画面，右侧才看得出是一块背景。 */
  object-position: 78% center;
  pointer-events: none;
}

.hero__threads {
  position: absolute;
  inset: -8% -6%;
  opacity: 0.95;
}

.hero__veil {
  position: absolute;
  inset: 0;
  /* 背景块已经缩到右侧，这一层只做收边与上下淡出，不能再整体压黑 */
  background:
    radial-gradient(ellipse 74% 64% at 54% 46%, rgba(5, 6, 10, 0) 0%, rgba(5, 6, 10, 0.1) 60%, rgba(5, 6, 10, 0.46) 100%),
    linear-gradient(180deg, rgba(5, 6, 10, 0.34) 0%, rgba(5, 6, 10, 0) 20%, rgba(5, 6, 10, 0) 70%, #05060a 100%);
}

.hero__grid {
  position: absolute;
  inset: 0;
  opacity: 0.3;
  background-image:
    linear-gradient(rgba(170, 185, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(170, 185, 255, 0.05) 1px, transparent 1px);
  background-size: 72px 72px;
  -webkit-mask-image: radial-gradient(ellipse 62% 54% at 50% 58%, #000 0%, transparent 78%);
  mask-image: radial-gradient(ellipse 62% 54% at 50% 58%, #000 0%, transparent 78%);
}

.hero__scrim {
  position: absolute;
  inset: 0;
  /* 压暗背景主体，让右侧的视觉往回收，不与左边的文字抢注意力 */
  background: radial-gradient(
    closest-side at 58% 50%,
    rgba(5, 6, 10, 0.16),
    rgba(5, 6, 10, 0.08) 46%,
    rgba(5, 6, 10, 0.02) 68%,
    transparent 88%
  );
  pointer-events: none;
}

/* ============================================================
 * 内容
 * ========================================================== */
/* 左文右图：内容列靠左，左内边距让开固定的导航坞（24 + 胶囊 64） */
.hero__inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  margin: 0;
  /* 本文件没有全局 border-box：不写这行，100% 宽 + 左右内边距会把盒子撑宽、整段内容右移 */
  box-sizing: border-box;
  padding: var(--sp-900) var(--sp-400) var(--sp-900)
    calc(var(--sp-300) + var(--dock-gutter, 0px) + var(--sp-700));
  text-align: left;
}

/* 文字块自身的宽度上限：标题与副标题都不超过 680，行长才不会失控 */
.hero__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* 同上：宽度确定下来，标题的 canvas 才有 680 的版心可用（列宽会跟着撑满）。
   * 但这一列里没有一个可点的地方：让指针穿透这层透明盒子，
   * 右侧背景才收得到 hover 与点击，而不是被它整片吃掉。 */
  width: 100%;
  max-width: 680px;
  pointer-events: none;
}

/* ── 版本徽章：整条 32 高，与下面的能力标签同一档
 * 材质与 tag 同源（平底 + 四边 1px + 顶部内高光），
 * 去掉 backdrop-filter 和那块 34px 的外阴影——元信息不该"浮"在页面上。 */
.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-100);
  margin: 0;
  /* 上下 4 + 版本号 24 = 32，和 tag 对齐 */
  padding: var(--sp-50) var(--sp-200) var(--sp-50) var(--sp-50);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.01em;
  color: rgba(232, 238, 255, 0.8);
  white-space: nowrap;
  animation: hero-rise 0.85s var(--ease) 0.05s both;
}

/* 版本号是这一条里唯一的实色块：Surface/Inverted 纯白 + 近黑字，
 * 圆角走 radius/full —— 原来那个 16px 圆角在这个高度上既不是圆也不是方，看着很业余。 */
.hero__badge-version {
  display: inline-flex;
  align-items: center;
  /* 图标 12 小于行高 16，加上它不会把 pill 撑高 */
  gap: var(--sp-50);
  color: #0a0b0e;
  background: #ffffff;
  font-size: 12px;
  line-height: 16px;
  /* Bold（700）是允许的上限——再往上就是技能明令禁止的 800/900 超粗了 */
  font-weight: 700;
  border-radius: var(--r-full);
  padding: var(--sp-50) var(--sp-75);
  font-variant-numeric: tabular-nums;
  /* 实心白块在深底上容易"飘"，给一层内高光 + 极近的硬影把它按回平面。
   * 与主按钮同一套做法：边缘干净，影子只交代贴近关系。 */
  box-shadow:
    inset 0 1px 0 #ffffff,
    0 1px 2px rgba(0, 0, 0, 0.45);
}

/* 图标跟字同色（currentColor），不额外染色。
 * 尺寸在 CSS 里写死 14，和下面四个能力标签的图标同一档。 */
.hero__badge-version svg {
  flex: none;
  display: block;
  width: 14px;
  height: 14px;
}

/* 分隔线只到 10 高，比文字矮一截才不会把它切成两半 */
.hero__badge-line {
  width: 1px;
  height: 10px;
  background: rgba(255, 255, 255, 0.14);
}

.hero__badge-text {
  color: rgba(226, 233, 255, 0.58);
}

.hero__title {
  /* 字号落在 type scale 的两个端点上：移动 48（text-5xl），桌面 96（text-8xl）。
   * 左列宽 680，96px 时 "NEW ANDROID" 量出来约 510，仍在列宽内。 */
  /* 标题的 canvas 必须有一个确定宽度：不写这行，h1 会被 canvas 的 1px 内容
   * 撑成 shrink-to-fit，fit 算出极小的字号，标题就缩成一行小字。 */
  width: 100%;
  margin: var(--sp-300) 0 0;
  /* 标题改由 canvas 绘制，墨迹正好从容器左缘起：
   * 原来那处 -0.0625em 的光学补偿（补 Archive 首字自带的留白）不再需要。 */
  margin-left: 0;
  font-family: var(--lp-display);
  font-size: clamp(3.5rem, 7.6vw, 6rem);
  font-weight: 400;
  line-height: 1;
  /* 大字必须紧排：默认字距在 96px 上会松成海报体，收 0.03em 才是标题的手感 */
  letter-spacing: -0.03em;
  text-wrap: balance;
  /* 紫色留给"落点"，不留给"发光"：
   *   一层无彩色投影把字托起来，
   *   一层大半径的低透明度紫影只做气息，半径大、alpha 低就不会糊成一圈霓虹。
   * 之前廉价正是因为在字边缘叠了两层高强度彩色光晕。 */
  filter:
    /* 上缘 1px 的亮边：金属的"棱"来自边缘光，不是来自发光 */
    drop-shadow(0 -1px 0 rgba(255, 255, 255, 0.2))
    drop-shadow(0 18px 40px rgba(0, 0, 0, 0.55));
}

.hero__title-line {
  display: block;
  /* 例外：标题的 canvas 靠自己的 pointermove 做"字母变虚线"的悬停 */
  pointer-events: auto;
  animation: hero-rise 0.95s var(--ease) both;
  /* 两行标题都由 TechText 的 canvas 画，容器只负责尺寸与入场动画。
   * 旧的 background-clip: text 金属渐变不适用了（canvas 里没有文字，只有像素），
   * 材质改由组件的 gradient 色标复刻，见脚本里的 TITLE_INK。 */
  width: 100%;
  /* TechText 把文字排进容器宽的 90%、高的 66%，并从宽度的 5% 处起排：
   * 高度给到 1.2em，那 66% 高才仍然宽于字形墨高，字号不会被压小；
   * 左移 5% 把那处起始留白还回去，墨迹重新贴回内容列左缘。 */
  height: 1.2em;
  margin-left: -5%;
}

/* 按钮装在 GlassSurface 里，同样要能从穿透的父层里接回指针 */
.hero__actions-glass {
  pointer-events: auto;
}

/* 两行之间收回到 1em 的行距：容器各占 1.2em，减去这里的 0.2em 正好贴回原来的紧排 */
.hero__title-line + .hero__title-line {
  margin-top: -0.2em;
}

/* 读屏与搜索用的标题正文：canvas 里的像素不能被解析成文本，这段不能省 */
.hero__title-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.hero__title-line--lead {
  animation-delay: 0.14s;
}

/* 第二行只保留延迟：首字的光学留白与末字右缘裁切，都是 canvas 排版里没有的问题 */
.hero__title-line--accent {
  animation-delay: 0.24s;
}

.hero__tagline {
  margin: var(--sp-200) 0 0;
  max-width: 680px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: rgba(232, 236, 246, 0.74);
  text-wrap: balance;
  animation: hero-rise 0.9s var(--ease) 0.34s both;
}

.hero__lead {
  margin: var(--sp-75) 0 0;
  max-width: 560px;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: rgba(226, 232, 255, 0.6);
  text-wrap: pretty;
  animation: hero-rise 0.9s var(--ease) 0.42s both;
}

/* 断行落在 "Windows / 窗口" 之间：四件事归一句，Windows 是那句的落点。
 * 也顺手避开把"命令。"单独甩到第三行。窄屏交给自然换行。 */
.hero__lead-br {
  display: block;
}

/* ============================================================
 * 按钮
 * ========================================================== */
.hero__actions-glass {
  width: auto;
  margin-top: var(--sp-400);
  animation: hero-rise 0.9s var(--ease) 0.5s both;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--sp-100);
}

/* ── Button 组件（Primary / Secondary）
 * 尺寸与间距全部走 token：垂直 8（spacing/75）、水平 12（spacing/100）、
 * 图标与文字之间 8、两枚按钮之间 12、圆角 radius/full、最小高度 44（触控）。
 * 表面一律是平的：按钮不许用渐变底，材质感只能来自描边与阴影。 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-75);
  min-height: 44px;
  padding: var(--sp-75) var(--sp-100);
  border: 1px solid transparent;
  border-radius: var(--r-full);
  font-family: inherit;
  /* Button-md：16 / 24 / Semibold */
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  letter-spacing: 0;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 300ms var(--ease),
    border-color 300ms var(--ease),
    box-shadow 300ms var(--ease);
}

.btn svg {
  display: block;
  /* 图标比文字浅一档：让字是主体，图标只是注解 */
  opacity: 0.92;
}

/* ── State：Hover / Pressed / Focus 三态都在，缺一个就算没做完 ──
 * 三态一律不动位置、不缩放：反馈只靠底色、描边与阴影的深浅。
 * 按钮在玻璃胶囊里，一动就会带着胶囊里的折射一起晃，观感反而廉价。 */

.btn:active {
  /* 按下只把时间压短，让手感变"实"，不做位移 */
  transition-duration: 120ms;
}

.btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 3px;
}

/* ── Primary：Surface/Inverted 纯白，文字 Text/Inverted 近黑 ──
 * 高级感来自"边缘干净 + 两层阴影"：
 *   一圈 1px 内描边把白底从深背景上割出来（否则白块边缘会发虚），
 *   近处 2px 硬影交代它离背景有多近，远处 28px 柔影只交代体量。
 * 之前那两团紫光是错的：彩色投影会让按钮看起来像贴在页面上的贴纸。 */
.btn--primary {
  color: #0a0b0e;
  background: #ffffff;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 1),
    0 1px 2px rgba(0, 0, 0, 0.5),
    0 10px 28px rgba(0, 0, 0, 0.35);
}

.btn--primary:hover {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.95),
    inset 0 1px 0 #ffffff,
    0 2px 4px rgba(0, 0, 0, 0.55),
    0 16px 38px rgba(0, 0, 0, 0.42);
}

.btn--primary:active {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.45),
    0 4px 12px rgba(0, 0, 0, 0.3);
}

/* ── Secondary：透明底 + 四边 1px 描边（Border/Primary 的量级）
 * 它坐在玻璃胶囊里，自己再加一层深色底就是三层材质打架，所以只留边。 */
.btn--ghost {
  color: rgba(242, 245, 255, 0.96);
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.btn--ghost:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.26);
}

.btn--ghost:active {
  background: rgba(255, 255, 255, 0.12);
}

/* ============================================================
 * 能力标签
 * ========================================================== */
.hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--sp-75);
  margin: var(--sp-300) 0 0;
  padding: 0;
  list-style: none;
  animation: hero-rise 0.9s var(--ease) 0.66s both;
}

/* ── Tag（Caption 4：12 / 16 / Medium）
 * 高度 32 = 垂直 8 + 行高 16，跟按钮同一档垂直间距，四枚并排不会参差。
 * 材质只有三样：平底、四边 1px 描边、顶部 1px 内高光——没有模糊、没有渐变。
 * 图标比文字低一档明度会更闷，所以图标反而用低饱和紫做唯一的彩色点缀。 */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-75);
  padding: var(--sp-75) var(--sp-100);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: rgba(232, 238, 255, 0.8);
  white-space: nowrap;
}

.tag svg {
  flex: none;
  display: block;
  /* 唯一的彩色点：低饱和紫，与标题行末那点紫同源 */
  color: rgba(180, 166, 232, 0.95);
}

/* ============================================================
 * 底边小字
 * ========================================================== */
.hero__foot {
  position: absolute;
  right: var(--sp-400);
  bottom: var(--sp-300);
  left: var(--sp-400);
  z-index: 3;
  display: flex;
  justify-content: space-between;
  gap: var(--sp-200);
  pointer-events: none;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: rgba(220, 228, 255, 0.34);
  white-space: nowrap;
}

/* ============================================================
 * 动画
 * ========================================================== */
@keyframes hero-rise {
  from {
    opacity: 0;
    translate: 0 20px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* ============================================================
 * 响应式：只缩尺寸，不再换版式
 * ========================================================== */
/* 960 以下没有左右两栏可分：背景回到整屏，文字回到居中。
 * 这一档之前的内容列只占半边，硬撑左对齐会让标题和背景叠在一起。 */
@media (max-width: 960px) {
  .hero__bg {
    width: 100%;
    -webkit-mask-image: none;
    mask-image: none;
  }

  .hero__inner {
    align-items: center;
    padding: var(--sp-800) var(--sp-300) var(--sp-800);
    text-align: center;
  }

  .hero__copy {
    align-items: center;
    max-width: 100%;
  }

  /* 居中版式里两行标题各自居中，canvas 那 5% 的起始留白左右对称，不必抵消 */
  .hero__title-line {
    margin-left: 0;
  }

  /* 窄屏不认那处手改断行：宽度不够，硬断会切出 "个 Windows" 这种残句 */
  .hero__lead-br {
    display: none;
  }

  .hero__actions {
    justify-content: center;
  }

  .hero__tags {
    justify-content: center;
  }
}

@media (max-width: 720px) {
  /* 小字号下九段灰阶会挤成一道脏灰带：色标换成四段（脚本里的 TITLE_INK_NARROW），
   * 这一档只留字号，标题的材质不再由 CSS 负责。 */
  .hero__title {
    width: 100%;
    font-size: clamp(2.25rem, 12.8vw, 3rem);
  }

  .hero__tagline {
    margin-top: var(--sp-100);
    font-size: 18px;
    line-height: 28px;
  }

  .hero__lead {
    max-width: 340px;
    font-size: 16px;
    line-height: 24px;
  }

  /* 窄屏不再改成竖排：竖排会让两枚按钮叠在同一枚玻璃胶囊里，看起来像粘成一团。
   * 保持横排、字号落到 Button-sm，玻璃就是一枚正常的两键胶囊。 */
  .hero__actions {
    flex-wrap: wrap;
    gap: var(--sp-75);
  }

  .hero__actions-glass {
    margin-top: var(--sp-300);
  }

  .hero__actions .btn {
    padding: var(--sp-75) var(--sp-100);
    font-size: 14px;
    line-height: 20px;
  }

  .hero__tags {
    margin-top: var(--sp-200);
  }

  .hero__foot {
    display: none;
  }
}

@media (max-width: 420px) {
  .hero__badge {
    gap: var(--sp-75);
    font-size: 12px;
    padding-right: var(--sp-75);
  }

  /* 这一档只留版本号：整条徽章挤在一行里被省略号截断，比不显示更难读 */
  .hero__badge-text,
  .hero__badge-line {
    display: none;
  }

  /* 只剩版本号时，外层那圈就没意义了——胶囊套胶囊看着像双边框，直接退成单枚 pill */
  .hero__badge {
    padding: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
}

@media (max-height: 760px) and (min-width: 721px) {
  .hero__inner {
    padding-top: var(--sp-600);
    padding-bottom: var(--sp-700);
  }

  .hero__title {
    font-size: clamp(3rem, 6.4vw, 5rem);
  }
}

/* ============================================================
 * 少动效
 * ========================================================== */
@media (prefers-reduced-motion: reduce) {
  .hero__badge,
  .hero__title-line,
  .hero__tagline,
  .hero__lead,
  .hero__actions-glass,
  .hero__tags {
    animation: none !important;
    opacity: 1 !important;
    translate: none !important;
  }

  .btn {
    transition: background-color 300ms var(--ease);
  }
}
</style>
