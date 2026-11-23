<script setup>
/**
 * 宣传海报 —— NATB CLI v1.1.1
 *
 * 路径：/poster/natb-cli-1-1-1
 * 站内没有任何入口指向这里：不进导航、不进 dock、不进更新日志页，
 * 只能直连这条 URL 打开，head 里也补了 noindex（见 router 的 afterEach）。
 *
 * 这是一张按导出尺寸排的海报：画布固定 2560 × 1440（16:9），
 * 所有字号、间距、圆角都是按这块画布定的绝对值，不跟浏览器窗口走。
 * 页面上只做一件事——把画布等比缩进窗口供预览；
 * 导出时用 2560 × 1440 的视口截图，拿到的就是设计稿本来的尺寸。
 *
 * 设计语言取自站内既有事实：
 *   - 纸感浅色板来自 Features 的 TINTS（陶土米 / 天青 / 鼠尾草 / 紫藤）；
 *   - 墨色 #16150f 与"发丝线分区"来自「项目信息」那页的排版习惯；
 *   - 图标取 Solar bold-duotone，与 Features 同一套笔重；
 *   - 主视觉是两张真产品截图（离线 OTA / RTOS 专区）——
 *     NATB 本体就是 PowerShell 里的 CLI，这些终端界面就是它的脸；
 *   - 标识用站点自带的应用图标 public/natb-icon.png。
 *
 * 内容是数据驱动：更新条目读 public/json/UpdateLog.json 里 v1.1.1 那一条
 * （站点唯一真源），读不到才退回同内容的快照。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import IconRoot from '~icons/solar/shield-keyhole-bold-duotone'
import IconOta from '~icons/solar/cloud-download-bold-duotone'
import IconRtostv from '~icons/solar/layers-minimalistic-bold-duotone'
import IconWatch from '~icons/solar/watch-square-bold-duotone'
import { useUpdateLog } from '@/utils/updateLog'
import '@/styles/landing.css'

const VERSION = 'v1.1.1'
const VERSION_NUMBER = '1.1.1'
const FALLBACK_DATE = '2026.11.22'
const SITE = 'natb.top'
const QQ = '496522811'

/* 品牌标识：站点自带的应用图标（public/natb-icon.png），不另画一个 */
const BRAND_ICON = import.meta.env.BASE_URL + 'natb-icon.png'

/* 标题区右侧的方形插画：只做气氛，不带信息 */
const HERO_ART = import.meta.env.BASE_URL + 'images/poster/hero-art.jpg'

/* 真产品截图：NATB 的界面就是终端。
 * 用离线 OTA 与 RTOS 专区两张 —— 正对上 1.1.1 改的下载链路与 RTOS 桌面。 */
const SHOT_DIR = import.meta.env.BASE_URL + 'images/features/screenshot/'
const SHOTS = [
  {
    src: SHOT_DIR + 'ota.webp',
    alt: 'NATB CLI 执行离线 OTA 升级时的终端提示',
    caption: '离线 OTA',
    position: '12% 18%',
  },
  {
    src: SHOT_DIR + 'rtos.webp',
    alt: 'NATB CLI 的 RTOS 专区菜单',
    caption: 'RTOS 专区',
    position: '6% 42%',
  },
]

/* ── 四块重点 ──────────────────────────────────────────────────
 * 每条都落在 v1.1.1 日志里的真实条目上，底色沿用 Features 的纸感色板。 */
const HIGHLIGHTS = [
  {
    no: '01',
    badge: '新增',
    icon: IconOta,
    title: '自动超级恢复',
    body: '直接拉取云端资源，不用再自己找包对版本。',
    tint: '#f0dfd0',
  },
  {
    no: '02',
    badge: '优化',
    icon: IconWatch,
    title: '下载器换新',
    body: '下载链路整段重写，中途断线重来更稳。',
    tint: '#d6e3ec',
  },
  {
    no: '03',
    badge: '修复',
    icon: IconRtostv,
    title: 'RTOS 桌面',
    body: '装完软件桌面不显示的那处问题已经修掉。',
    tint: '#dce6da',
  },
  {
    no: '04',
    badge: '优化',
    icon: IconRoot,
    title: 'ROOT 刷写',
    body: '重写刷入 userdata.img 的判断与流程。',
    tint: '#e2deee',
  },
]

/* JSON 读不到时的兜底快照，内容与 v1.1.1 那一条一致 */
const FALLBACK_ITEMS = [
  { kind: 'fix', tag: '修复', text: '修复了 RTOS 安装软件后桌面不显示软件的问题' },
  { kind: 'opt', tag: '优化', text: '更换了下载器，下载更稳定' },
  { kind: 'opt', tag: '优化', text: '美化了一点 UI' },
  { kind: 'new', tag: '新增', text: '新增自动超级恢复，直接拉取云端资源' },
  { kind: 'opt', tag: '优化', text: '更换了 ROOT 时刷入 userdata.img 的逻辑' },
  { kind: 'fix', tag: '修复', text: '修复了一些用户反馈的问题' },
  { kind: 'opt', tag: '优化', text: '还有一些细节改动没写进日志' },
]

const TALLY = [
  { key: 'new', label: '新增' },
  { key: 'opt', label: '优化' },
  { key: 'fix', label: '修复' },
]

const { releases } = useUpdateLog()

const release = computed(() => releases.value.find((item) => item.version === VERSION) ?? null)

const items = computed(() =>
  release.value?.items?.length ? release.value.items : FALLBACK_ITEMS,
)

/* 2026-11-22 摆成 2026.11.22：海报上不出现连字符 */
const date = computed(() => (release.value?.date || FALLBACK_DATE).replaceAll('-', '.'))

const counts = computed(() =>
  TALLY.map((row) => ({
    ...row,
    value: items.value.filter((item) => item.kind === row.key).length,
  })).filter((row) => row.value > 0),
)

const total = computed(() => items.value.length)

/* ── 预览缩放 ──────────────────────────────────────────────────
 * 画布固定 2560 × 1440，这里只把它缩进窗口好预览；
 * 导出时窗口给足尺寸，scale 就是 1，截出来即设计原尺寸。 */
const CANVAS_WIDTH = 2560
const CANVAS_HEIGHT = 1440
const fit = ref(1)

const fitStyle = computed(() => ({
  transform: 'scale(' + fit.value + ')',
}))

function measure() {
  const width = window.innerWidth
  const height = window.innerHeight
  fit.value = Math.min(1, width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
}

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => window.removeEventListener('resize', measure))
</script>

<template>
  <main class="lp ps-page">
    <!-- 只做横向模糊的滤镜：stdDeviation 的 y 给 0，竖向不动 -->
    <svg class="ps-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="ps-blur-x" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="2.6 0" />
        </filter>
      </defs>
    </svg>

    <div class="ps-fit" :style="fitStyle">
      <article class="ps-sheet" aria-label="NATB CLI v1.1.1 更新海报">
        <!-- 背景：巨型版本号水印，压在最底层当纹理 -->
        <div class="ps-deco" aria-hidden="true">
          <span class="ps-watermark">NATB</span>
        </div>

        <!-- 版头 -->
        <header class="ps-head">
          <div class="ps-brand">
            <img class="ps-brand__icon" :src="BRAND_ICON" alt="NATB 标识" draggable="false" />
            <span class="ps-brand__type">
              <span class="ps-brand__name">NATB</span>
              <span class="ps-brand__full">New Android Tool Box</span>
            </span>
          </div>

          <div class="ps-head__meta">
            <span class="ps-pill">CLI {{ VERSION }}</span>
            <span class="ps-mono">{{ date }}</span>
          </div>
        </header>

        <div class="ps-hairline"></div>

        <!-- 主体：左文右图 -->
        <section class="ps-body">
          <div class="ps-col">
            <div class="ps-hero">
              <img class="ps-hero__art" :src="HERO_ART" alt="" aria-hidden="true" draggable="false" />

              <h1 class="ps-version">{{ VERSION_NUMBER }}</h1>

              <h2 class="ps-tagline">下载链路重做<br />恢复交给云端</h2>

              <div class="ps-stats">
                <div v-for="row in counts" :key="row.key" class="ps-stat">
                  <span class="ps-stat__value">{{ row.value }}</span>
                  <span class="ps-stat__label">{{ row.label }}</span>
                </div>
                <div class="ps-stat ps-stat--sum">
                  <span class="ps-stat__value">{{ total }}</span>
                  <span class="ps-stat__label">合计</span>
                </div>
              </div>
            </div>

            <!-- 四块重点：Features 那套纸感色板 -->
            <section class="ps-cards" aria-label="四项重点">
              <article
                v-for="item in HIGHLIGHTS"
                :key="item.no"
                class="ps-card"
                :data-accent="item.no === '01' ? '1' : undefined"
                :style="{ '--tint': item.tint }"
              >
                <span class="ps-card__icon">
                  <component :is="item.icon" />
                </span>
                <span class="ps-card__body">
                  <span class="ps-card__head">
                    <span class="ps-card__badge">{{ item.badge }}</span>
                  </span>
                  <span class="ps-card__title">{{ item.title }}</span>
                  <span class="ps-card__text">{{ item.body }}</span>
                </span>

                <!-- 编号当水印压在右上角，被卡片裁掉一部分 -->
                <span class="ps-card__no" aria-hidden="true">{{ item.no }}</span>
              </article>
            </section>
          </div>

          <!-- 照片式的终端截图 -->
          <figure class="ps-shot">
            <figcaption class="ps-shot__caption">
              <span class="ps-mono">实测输出</span>
              <span class="ps-shot__dash"></span>
              <span>终端界面截图</span>
            </figcaption>

            <div class="ps-shot__stack">
              <div v-for="shot in SHOTS" :key="shot.src" class="ps-shot__frame">
                <img
                  class="ps-shot__img"
                  :src="shot.src"
                  :alt="shot.alt"
                  :style="{ objectPosition: shot.position }"
                  draggable="false"
                />
                <span class="ps-shot__label">{{ shot.caption }}</span>
              </div>
            </div>
          </figure>
        </section>

        <div class="ps-hairline ps-hairline--foot"></div>

        <!-- 落款 -->
        <footer class="ps-foot">
          <div class="ps-foot__left">
            <span class="ps-foot__site">{{ SITE }}</span>
            <span class="ps-foot__sub">NATB CLI · New Android Tool Box</span>
          </div>
          <div class="ps-foot__right">
            <span class="ps-foot__group">{{ QQ }}</span>
            <span class="ps-mono ps-foot__label">QQ 交流群</span>
          </div>
        </footer>
      </article>
    </div>
  </main>
</template>

<style scoped>
/* ── 纸感色板：取自 Features 的 TINTS 与「项目信息」的墨色 ─────── */
.ps-page {
  --ps-paper: #f1f0eb;
  --ps-sheet: #ffffff;
  --ps-ink: #16150f;
  --ps-ink-2: #55524a;
  --ps-ink-3: #7d7969;
  --ps-line: #e6e3d9;
  --ps-line-2: #d5d1c4;
  --ps-accent: #4f3dd6;
  --ps-accent-soft: #ece8ff;
  --ps-mono: ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace;

  display: grid;
  place-items: center;
  min-height: 100vh;
  background: var(--ps-paper);
  color: var(--ps-ink);
  overflow: hidden;
}

/* 预览缩放层：只缩放，不参与排版 */
.ps-fit {
  transform-origin: center center;
}

/* 滤镜定义容器不参与布局 */
.ps-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/* ── 海报画布：固定 2560 × 1440 ───────────────────────────────── */
.ps-sheet {
  position: relative;
  width: 2560px;
  height: 1440px;
  padding: 68px 96px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--ps-sheet);
  color: var(--ps-ink);
  font-family: 'HarmonyOS Sans SC', system-ui, sans-serif;
  overflow: hidden;
}

/* 巨型版本号水印：海报的底纹，只露一点墨 */
.ps-deco {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.ps-watermark {
  position: absolute;
  right: 8px;
  bottom: -16px;
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 188px;
  line-height: 0.9;
  font-weight: 600;
  letter-spacing: -0.04em;
  white-space: nowrap;
  color: rgba(22, 21, 15, 0.04);
  user-select: none;
}

/* 内容一律压在底纹之上 */
.ps-head,
.ps-hairline,
.ps-body,
.ps-foot {
  position: relative;
  z-index: 1;
}

/* ── 版头 ─────────────────────────────────────────────────────── */
.ps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
}

.ps-brand {
  display: flex;
  align-items: center;
  gap: 26px;
  /* 模糊套在整块品牌区上：图标与两行字一次生效 */
  filter: url(#ps-blur-x);
}

.ps-brand__icon {
  width: 84px;
  height: 84px;
  border-radius: 20px;
  object-fit: cover;
  box-shadow:
    0 2px 4px rgba(22, 21, 15, 0.12),
    0 10px 26px rgba(22, 21, 15, 0.1);
}

.ps-brand__type {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ps-brand__name {
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 56px;
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.ps-brand__full {
  font-family: var(--ps-mono);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ps-ink-3);
}

.ps-head__meta {
  display: flex;
  align-items: center;
  gap: 28px;
}

/* 版本徽标：实紫反白，整张纸上唯一的实色块 */
.ps-pill {
  padding: 8px 24px;
  border-radius: 999px;
  background: var(--ps-accent);
  color: #ffffff;
  font-family: var(--ps-mono);
  font-size: 24px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.ps-mono {
  font-family: var(--ps-mono);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 0.04em;
  color: var(--ps-ink-3);
}

/* 发丝线：分区靠 1px 线，不靠满屏网格 */
.ps-hairline {
  height: 2px;
  background: var(--ps-line);
}

/* 底部那条线：与上面的内容再松开一点，落款才有自己的位置 */
.ps-hairline--foot {
  margin-top: 16px;
}

/* 底部这条线要比上面那条重一点，否则在照片投影里看不见 */
.ps-hairline--foot {
  background: var(--ps-line-2);
}

/* ── 主体：左文右图 ───────────────────────────────────────────── */
.ps-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 7.7fr) minmax(0, 4.3fr);
  gap: 72px;
  align-items: stretch;
}

.ps-col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  min-width: 0;
}

.ps-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 28px;
}

/* 右侧气氛图：切成方块，四边渐隐，再压成一层墨 —— 半隐半显 */
.ps-hero__art {
  position: absolute;
  right: 24px;
  top: 44%;
  translate: 0 -50%;
  width: 720px;
  height: 540px;
  object-fit: cover;
  pointer-events: none;
  z-index: 0;
  opacity: 0.66;
  mix-blend-mode: multiply;
  filter: saturate(0.92) contrast(1.06);
  /* 过渡拉长：四边各留三成宽度做渐隐，边缘才真正化进纸里 */
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 32%, #000 68%, transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 32%, #000 68%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0, #000 32%, #000 68%, transparent 100%),
    linear-gradient(to bottom, transparent 0, #000 32%, #000 68%, transparent 100%);
  mask-composite: intersect;
}

/* 文字压在气氛图之上 */
.ps-hero > :not(.ps-hero__art) {
  position: relative;
  z-index: 1;
}

/* 海报唯一的渐变：只在版本号文字上，左到右，亮色取黑到灰 */
.ps-version {
  margin: 0;
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 230px;
  line-height: 0.94;
  font-weight: 600;
  letter-spacing: -0.04em;
  background: linear-gradient(90deg, #16150f 0%, #6f6b5d 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.ps-tagline {
  margin: 0;
  max-width: 1100px;
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 96px;
  line-height: 1.06;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ps-ink);
}

/* 计数：数字走大字号，标签走等宽小字，竖线分隔 */
.ps-stats {
  display: flex;
  align-items: baseline;
  gap: 44px;
  margin-top: 8px;
}

.ps-stat {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-right: 44px;
  border-right: 2px solid var(--ps-line);
}

.ps-stat:last-child {
  padding-right: 0;
  border-right: 0;
}

.ps-stat__value {
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 68px;
  line-height: 1.1;
  font-weight: 600;
}

.ps-stat__label {
  font-size: 28px;
  line-height: 1.4;
  color: var(--ps-ink-3);
}

.ps-stat--sum .ps-stat__value {
  color: var(--ps-accent);
}

/* ── 四块重点：纸感色块，横排（图标在左，文字在右） ───────────── */
.ps-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.ps-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding: 28px 34px;
  border-radius: 28px;
  background: var(--tint, #eeebe5);
  color: var(--ps-ink);
  overflow: hidden;
}

/* 卡片内容压在编号水印之上 */
.ps-card__icon,
.ps-card__body {
  position: relative;
  z-index: 1;
}

/* 编号水印：大号数字压在右上角，露出多少由卡边决定 */
.ps-card__no {
  position: absolute;
  top: 50%;
  translate: 0 -50%;
  right: 22px;
  font-family: var(--font-display, 'Archive', sans-serif);
  font-size: 196px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: -0.04em;
  color: rgba(22, 21, 15, 0.075);
  pointer-events: none;
  z-index: 0;
  user-select: none;
}

.ps-card__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.66);
  color: var(--ps-ink);
}

.ps-card__icon > svg {
  width: 44px;
  height: 44px;
}

.ps-card__body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.ps-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ps-card__badge {
  font-family: var(--ps-mono);
  font-size: 24px;
  line-height: 1.3;
  letter-spacing: 0.04em;
  color: rgba(22, 21, 15, 0.6);
}



.ps-card__title {
  font-size: 50px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.ps-card__text {
  font-size: 25px;
  line-height: 1.4;
  color: var(--ps-ink-2);
}

/* 首卡是整版的重点：实紫底反白，四块色板立刻有了主次 */
.ps-card[data-accent='1'] {
  background: var(--ps-accent);
  color: #ffffff;
}

.ps-card[data-accent='1'] .ps-card__badge {
  color: rgba(255, 255, 255, 0.78);
}

.ps-card[data-accent='1'] .ps-card__no {
  color: rgba(255, 255, 255, 0.16);
}

.ps-card[data-accent='1'] .ps-card__icon {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.ps-card[data-accent='1'] .ps-card__text {
  color: rgba(255, 255, 255, 0.84);
}

/* ── 产品截图：上下两张，无外框，自己带阴影与连续曲率圆角 ─────── */
.ps-shot {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}

.ps-shot__caption {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 22px;
  line-height: 1.3;
  color: var(--ps-ink-3);
}

.ps-shot__dash {
  width: 22px;
  height: 2px;
  background: var(--ps-line-2);
}

.ps-shot__stack {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 28px;
}

.ps-shot__frame {
  position: relative;
  min-height: 0;
  border-radius: 56px;
  corner-shape: superellipse(2.2);
  overflow: hidden;
  box-shadow:
    0 2px 6px rgba(22, 21, 15, 0.14),
    0 14px 30px rgba(22, 21, 15, 0.14);
}

/* 绝对定位铺满：图片的固有比例不参与父级高度计算 */
.ps-shot__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
  background: #0d1020;
}

/* 每张图右下角一枚小标签：说清这是哪个功能的界面 */
.ps-shot__label {
  position: absolute;
  right: 22px;
  bottom: 22px;
  padding: 6px 18px;
  border-radius: 999px;
  background: rgba(13, 16, 32, 0.72);
  color: #ffffff;
  font-family: var(--ps-mono);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 0.04em;
}

/* ── 落款 ─────────────────────────────────────────────────────── */
.ps-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.ps-foot__left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ps-foot__site {
  /* 域名保留小写：Archive 只有大写字形，会把 natb.top 排成 NATB.TOP */
  font-size: 42px;
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.ps-foot__sub {
  font-family: var(--ps-mono);
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: 0.08em;
  color: var(--ps-ink-3);
}

.ps-foot__right {
  /* 与左侧同构：上行大字、下行等宽小字，右对齐 */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.ps-foot__group {
  font-size: 38px;
  line-height: 1.3;
  font-weight: 600;
}

/* ── 入场：纯 CSS 动画，只动 transform 与 opacity ─────────────── */
@media (prefers-reduced-motion: no-preference) {
  .ps-head,
  .ps-hero,
  .ps-cards,
  .ps-shot,
  .ps-foot {
    animation: ps-rise 640ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .ps-hero {
    animation-delay: 60ms;
  }

  .ps-cards {
    animation-delay: 130ms;
  }

  .ps-shot {
    animation-delay: 190ms;
  }

  .ps-foot {
    animation-delay: 240ms;
  }
}

@keyframes ps-rise {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
