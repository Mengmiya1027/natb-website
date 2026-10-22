<script setup>
/**
 * 首页：一屏到底。
 *
 * 背景是 Vue Bits 的 WebThreads，前景只留品牌、版本、一句话和两个入口；
 * 没有第二屏、没有滚动，所有信息在 100dvh 内收口。
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'

import WebThreads from '@/components/vue-bits/WebThreads.vue'
import { useAnimationStore } from '@/stores/animation'
import { useUpdateLog } from '@/utils/updateLog'

const QQ_URL = 'https://qm.qq.com/q/Cb2vLZtsZ4'
const QQ_GROUP = '496522811'

const anim = useAnimationStore()
const { latest } = useUpdateLog()

// 版本号跟着 public/json/UpdateLog.json 走；读不到时退回当前已知版本
const version = computed(() => latest.value?.version ?? 'v1.0.3')
const versionLabel = computed(() => `${version.value} 已发布`)

const TAGS = ['一键 ROOT', '离线 OTA', '应用管理', '投屏控制']

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

const videoRef = ref(null)

onMounted(() => {
  // 首页不再有粒子开场，但顶栏仍靠 isLanded 滑进来
  anim.land()
  document.documentElement.classList.add('home-is-dark')

  // 模板里写 muted 在部分浏览器不生效（会被判成"有声自动播放"而拒绝），这里用 property 兜底
  const video = videoRef.value
  if (video) {
    video.muted = true
    if (reduceMotion) video.pause()
  }
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('home-is-dark')
})
</script>

<template>
  <div class="home">
    <header class="hero">
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
            :paused="reduceMotion"
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
            :paused="reduceMotion"
          />
        </div>
        <div class="hero__veil"></div>
        <div class="hero__grid"></div>
        <div class="hero__scrim"></div>
      </div>

      <div class="hero__inner">
        <p class="hero__badge">
          <span class="hero__badge-version">
            {{ versionLabel }}
          </span>
          <span class="hero__badge-line" aria-hidden="true"></span>
          <span class="hero__badge-text">小天才手表 ADB 工具箱</span>
        </p>

        <h1 class="hero__title">
          <span class="hero__title-line">New Android</span>
          <span class="hero__title-line hero__title-line--accent">Tool Box</span>
        </h1>

        <p class="hero__tagline">小天才手表，一个窗口全部搞定。</p>
        <p class="hero__lead">把 ROOT、刷机、装应用、投屏收进一套顺手的工作流。</p>

        <div class="hero__actions">
          <a class="btn btn--primary" :href="QQ_URL" target="_blank" rel="noopener">
            <i-lucide-download width="17" height="17" aria-hidden="true" />
            <span>立即下载</span>
          </a>
          <a class="btn btn--ghost" href="#" @click.prevent="goTab('features')">
            <i-lucide-layout-grid width="17" height="17" aria-hidden="true" />
            <span>了解功能</span>
          </a>
        </div>
        <ul class="hero__tags" aria-label="核心能力">
          <li v-for="tag in TAGS" :key="tag" class="tag">{{ tag }}</li>
        </ul>
      </div>

      <div class="hero__foot" aria-hidden="true">
        <span>NATB DEVELOPER GROUP</span>
        <span>仅供学习交流 · ROOT 有风险</span>
      </div>
    </header>
  </div>
</template>

<style scoped>
.home {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: #05060a;
  color: #f4f6ff;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui, sans-serif;
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
.hero__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
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
  opacity: 0.82;
}

.hero__video-el {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  background:
    radial-gradient(ellipse 62% 56% at 50% 48%, rgba(5, 6, 10, 0.08) 0%, rgba(5, 6, 10, 0.34) 54%, rgba(5, 6, 10, 0.86) 100%),
    linear-gradient(180deg, rgba(5, 6, 10, 0.7) 0%, rgba(5, 6, 10, 0) 22%, rgba(5, 6, 10, 0) 64%, #05060a 100%);
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
  left: 50%;
  top: 50%;
  width: min(1120px, 96vw);
  height: min(640px, 72vh);
  transform: translate(-50%, -48%);
  background: radial-gradient(closest-side, rgba(5, 6, 10, 0.58), rgba(5, 6, 10, 0.24) 58%, transparent 78%);
  filter: blur(18px);
  pointer-events: none;
}

/* ============================================================
 * 内容
 * ========================================================== */
.hero__inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(1160px, 100%);
  height: 100%;
  margin: 0 auto;
  /* 本文件没有全局 border-box：不写这行，100% 宽 + 左右内边距会把盒子撑宽、整段内容右移 */
  box-sizing: border-box;
  padding: 59px 28px 96px;
  text-align: center;
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 4px 15px 4px 4px;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 999px;
  background: rgba(10, 12, 20, 0.52);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 12px 34px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  font-size: 12px;
  letter-spacing: 0.02em;
  color: rgba(235, 240, 255, 0.72);
  white-space: nowrap;
  animation: hero-rise 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both;
}

.hero__dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #b6a7ff, #4fe0ff);
  box-shadow: 0 0 0 3px rgba(124, 108, 255, 0.16), 0 0 14px 2px rgba(90, 200, 255, 0.55);
  animation: badge-pulse 2.6s ease-in-out infinite;
}

.hero__badge-version {
  color: #000;
  background: #ffffff;
  font-weight: 700;
  border-radius: 16px;
  padding: 4px;
  font-variant-numeric: tabular-nums;
}

.hero__badge-line {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.16);
}

.hero__badge-text {
  color: rgba(226, 233, 255, 0.55);
}

.hero__title {
  margin: 26px 0 0;
  font-size: clamp(3.3rem, 8.8vw, 7.6rem);
  font-weight: 900;
  line-height: 0.88;
  letter-spacing: -0.055em;
  text-wrap: balance;
  filter: drop-shadow(0 12px 46px rgba(103, 84, 255, 0.24));
}

.hero__title-line {
  display: block;
  animation: hero-rise 0.95s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.hero__title-line:first-child {
  animation-delay: 0.14s;
}

.hero__title-line--accent {
  padding-right: 0.04em;
  color: transparent;
  background: linear-gradient(100deg, #f3f5ff 0%, #c8d2ff 26%, #a58dff 56%, #65e0ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  animation-delay: 0.24s;
}

.hero__tagline {
  margin: 28px 0 0;
  font-size: clamp(1.02rem, 1.5vw, 1.3rem);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #e8ecff;
  animation: hero-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.34s both;
}

.hero__lead {
  margin: 11px 0 0;
  max-width: 620px;
  font-size: 14.5px;
  line-height: 1.8;
  color: rgba(226, 232, 255, 0.56);
  animation: hero-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.42s both;
}

/* ============================================================
 * 按钮
 * ========================================================== */
.hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: color-mix(in srgb, rgb(217,217,217) 50%, transparent);
  padding: 4px;
  border-radius: 999px;
  corner-shape:superellipse(1.25);
  margin-top: 30px;
  animation: hero-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-decoration: none;
  white-space: nowrap;
  corner-shape:superellipse(1.25);
  cursor: pointer;
  transition:
    background 0.25s ease,
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}

.btn svg {
  display: block;
}


.btn:active {
  transform: translateY(0) scale(0.9);
}

.btn--primary {
  color: #070912;
  background: linear-gradient(135deg, #f0f3ff 0%, #b9c6ff 48%, #7ee6ff 100%);
  box-shadow:
    0 10px 30px rgba(124, 108, 255, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.btn--primary:hover {
  box-shadow:
    0 16px 44px rgba(124, 108, 255, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.btn--ghost {
  color: #eef1ff;
  background: rgb(0 0 0 / 0.5);
  border-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.btn--ghost:hover {
  background: rgb(0 0 0 / 0.7);
  border-color: rgba(255, 255, 255, 0.25);
}

.hero__note {
  margin: 16px 0 0;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: rgba(220, 228, 255, 0.34);
  animation: hero-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.58s both;
}

/* ============================================================
 * 能力标签
 * ========================================================== */
.hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 26px 0 0;
  padding: 0;
  list-style: none;
  animation: hero-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.66s both;
}

.tag {
  padding: 7px 13px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(230, 236, 255, 0.56);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

/* ============================================================
 * 底边小字
 * ========================================================== */
.hero__foot {
  position: absolute;
  right: 34px;
  bottom: 26px;
  left: 34px;
  z-index: 3;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  pointer-events: none;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: rgba(220, 228, 255, 0.28);
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

@keyframes badge-pulse {
  0%,
  100% {
    opacity: 0.7;
    scale: 0.9;
  }
  50% {
    opacity: 1;
    scale: 1.05;
  }
}

/* ============================================================
 * 响应式：只缩尺寸，不再换版式
 * ========================================================== */
@media (max-width: 720px) {

  .hero__title {
    width: 100%;
    font-size: clamp(3rem, 12.8vw, 4.2rem);
  }

  /* 负字距会在末字后留一截空隙，居中时整行墨迹看着偏右：给每行补回右侧留白抵消 */
  .hero__title-line {
    padding-right: 0.055em;
  }

  .hero__tagline {
    margin-top: 22px;
    letter-spacing: 0.05em;
  }

  .hero__lead {
    max-width: 330px;
    font-size: 13.5px;
    line-height: 1.75;
  }

  .hero__actions {
    width: 100%;
    flex-direction: column;
    gap: 10px;
    margin-top: 26px;
  }

  .hero__actions .btn {
    width: auto;
    padding: 0 22px;
  }

  .hero__note {
    max-width: 300px;
    line-height: 1.7;
  }

  .hero__tags {
    margin-top: 22px;
  }

  .hero__foot {
    display: none;
  }
}

@media (max-width: 420px) {
  .hero__badge {
    gap: 8px;
    font-size: 11px;
    padding-right: 12px;
  }

  .hero__badge-text {
    max-width: 128px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-height: 760px) and (min-width: 721px) {
  .hero__inner {
    padding-top: 48px;
    padding-bottom: 72px;
  }

  .hero__title {
    font-size: clamp(3.3rem, 7.6vw, 6rem);
  }

  .hero__tagline {
    margin-top: 20px;
  }

  .hero__tags {
    margin-top: 20px;
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
  .hero__actions,
  .hero__note,
  .hero__tags {
    animation: none !important;
    opacity: 1 !important;
    translate: none !important;
  }

  .hero__dot {
    animation: none !important;
  }
}
</style>
