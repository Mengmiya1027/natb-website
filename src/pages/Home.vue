<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParticleField from '@/components/ParticleField.vue'
import GridBackground from '@/components/GridBackground.vue'
import { useAnimationStore } from '@/stores/animation'

// 三处共用字体参数，任一处不一致，交接就会跳
const TITLE = 'New Android Tool Box'
const FONT_FAMILY = "'HarmonyOS Sans SC', Arial"
const FONT_WEIGHT = 1000

const HOLD_MS = 1000 // 粒子收尾后字在台上停一拍，之后才起飞
const FLY_MS = 1200 // 飞到窗口标题的时长，改它要同步 .title-flight 的 transition

const store = useAnimationStore()

const flightRef = ref(null) // 飞行中的那行字，落位后就撤
const titleRef = ref(null) // 窗口里的真标题，落位后由它接管
const targetProbe = ref(null) // 量落点的基线
const flyStyle = ref({})
// 起飞后不回头：驱动黑幕退场与彩虹褪色
const flying = computed(() => store.isFlying || store.isLanded)
// 落位：飞行层撤下，真标题现身，之后跟着布局走
const landed = computed(() => store.isLanded)
// 黑幕开始褪就让首页入场，与飞行的字同框
const revealed = computed(() => store.isFlying || store.isLanded)

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

let timers = []
let scheduled = false

function later(fn, ms) {
  const id = window.setTimeout(fn, ms)
  timers.push(id)
  return id
}

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id))
  timers = []
}

// h1 是 inset:0 的空盒子，只能逐字取框求并集
function charsRect(root) {
  const list = root?.querySelectorAll('.home__char')
  if (!list?.length) return null
  let left = Infinity
  let right = -Infinity
  list.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    if (r.left < left) left = r.left
    if (r.right > right) right = r.right
  })
  return left === Infinity ? null : { left, right, width: right - left }
}

// 块级元素 rect 是整行容器宽，真文字框得用 Range 量
function textRect(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const r = range.getBoundingClientRect()
  return r.width ? r : null
}

// 以源中心与基线为不动点，宽度缩放后落点才准
function measureFlight() {
  const flight = flightRef.value
  const title = titleRef.value
  const probe = targetProbe.value
  const srcProbe = flight?.querySelector('.home__probe')
  const src = charsRect(flight)
  const dst = title ? textRect(title) : null
  if (!src || !dst || !srcProbe || !probe) return null

  const list = flight.querySelectorAll('.home__char')
  // 起飞帧 CSS 会收掉 canvas 字距，宽度按收完的算才同宽
  const titleEl = flight.querySelector('.intro-title')
  const gap = titleEl ? parseFloat(getComputedStyle(titleEl).getPropertyValue('--char-gap')) || 0 : 0
  const width = src.width - Math.max(0, list.length - 1) * gap

  const base = flight.getBoundingClientRect()
  const srcCenterX = (src.left + src.right) / 2
  const srcBaseY = srcProbe.getBoundingClientRect().bottom
  const dstCenterX = (dst.left + dst.right) / 2
  const dstBaseY = probe.getBoundingClientRect().bottom
  const scale = dst.width / width

  // 整行一份彩虹，每字按左边缘取段，拼接才连续
  list.forEach((el, index) => {
    const r = el.getBoundingClientRect()
    el.style.setProperty('--char-x', `${r.left - src.left - index * gap}px`)
  })

  return {
    '--rainbow-w': `${width}px`,
    transformOrigin: `${srcCenterX - base.left}px ${srcBaseY - base.top}px`,
    transform: `translate(${dstCenterX - srcCenterX}px, ${dstBaseY - srcBaseY}px) scale(${scale})`,
  }
}

// 定时器早一帧会切早了，故等过渡结束再落地
function onFlightEnd(event) {
  if (event.target !== flightRef.value || event.propertyName !== 'transform') return
  store.land()
}

async function flyToTitle() {
  await nextTick()
  const style = measureFlight()
  store.setStage('flying') // 放背景出来，同时开始褪色
  if (reduceMotion || !style) {
    store.land()
    return
  }
  flyStyle.value = style
  later(() => store.land(), FLY_MS + 400) // 变换被跳过时的兜底
}

function scheduleFly() {
  if (scheduled) return
  scheduled = true
  later(flyToTitle, HOLD_MS)
}

watch(
  () => store.isDone,
  (done) => {
    if (done) scheduleFly()
  },
)

onMounted(() => {
  // 动画已播过时粒子层会立刻收尾，这里要跟上
  if (store.isDone) scheduleFly()
})

onBeforeUnmount(clearTimers)
</script>

<template>
  <div
    class="home"
    :class="{ 'is-revealing': revealed && !reduceMotion }"
    :style="{ '--title-font': FONT_FAMILY, '--title-weight': FONT_WEIGHT }"
  >
    <!-- 正式首页内容 -->
    <div class="bottom">
      <div class="wrapper">
        <div class="cover">
          <div class="background">
            <!-- 背景模糊副本，避开 backdrop-filter 的合成竞态 -->
            <div class="glass" aria-hidden="true"><div class="glass-blur"></div></div>
            <div class="window">
              <!-- macOS 窗口标题栏 -->
              <div class="window-bar">
                <span class="dot dot-red" />
                <span class="dot dot-yellow" />
                <span class="dot dot-green" />
                <div class="window-title-text">NATB App</div>
              </div>
              <div class="window-body">
                <div class="title-wrap">
                  <!-- 落位前隐形撑版式并当量尺，落位后接管 -->
                  <!-- 内容别换行，否则文字前会多一个空格 -->
                  <h1 ref="titleRef" class="cover-title" :class="{ 'is-visible': landed }">New Android Tool Box<i ref="targetProbe" class="cover-probe"></i></h1>
                  <p class="subtitle">小天才手表ADB工具箱</p>
                </div>
                <div class="divider-line"></div>
                <div class="tag-group">
                  <span class="tag">一键ROOT</span>
                  <span class="tag">离线OTA</span>
                  <span class="tag">XP框架安装</span>
                  <span class="tag">应用管理</span>
                </div>
                <!-- 两个入口：下载待接地址，QQ 直接进群 -->
                <div class="action-group">
                  <button class="btn btn-primary" type="button">
                    <i-lucide-download width="17" height="17" aria-hidden="true" />
                    <span>立即下载</span>
                  </button>
                  <a class="btn btn-ghost" href="https://qm.qq.com/q/Cb2vLZtsZ4" target="_blank" rel="noopener">
                    <i-lucide-message-circle width="17" height="17" aria-hidden="true" />
                    <span>QQ交流</span>
                  </a>
                </div>
                <!-- 空白间隔：和探索块一起分掉下方剩余高度 -->
                <div class="hint-fill" aria-hidden="true"></div>
                <!-- 标签下方的探索引导 -->
                <div class="scroll-hint">
                  <span>点击探索</span>
                  <i-lucide-chevrons-down class="scroll-hint-icon" width="18" height="18" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <grid-background zIndex="1" />
        <!-- 最底下一行：占满宽度 -->
        <div class="developer-group" aria-label="NATB DEVELOPER GROUP">
          <span>NATB DEVELOPER GROUP</span>
        </div>
      </div>
      <button class="edge-fab" type="button" aria-label="更多">
        <!-- 土星造型，呼应宇宙主题 -->
        <i-solaratom-bold-duotone width="40" height="40" aria-hidden="true" />
      </button>
    </div>

    <!-- 开场层：黑幕先退，那行字继续飞 -->
    <div v-show="!landed" class="intro">
      <div class="shade" :class="{ 'is-gone': flying }"></div>
      <ParticleField :text="TITLE" :font-family="FONT_FAMILY" :font-weight="FONT_WEIGHT">
        <template #title="{ chars, titleStyle, shift, visible, probe }">
          <div
            ref="flightRef"
            class="title-flight"
            :class="{ 'is-flying': flying }"
            :style="flyStyle"
            @transitionend="onFlightEnd"
          >
            <h1
              class="intro-title"
              :class="{ 'is-visible': visible }"
              :style="[titleStyle, { transform: `translateX(${shift})` }]"
              :aria-label="TITLE"
            >
              <span
                v-for="(item, index) in chars"
                :key="index"
                class="home__char"
                :style="{ left: item.left, top: item.top, '--i': index }"
              ><i v-if="index === 0" :ref="probe" class="home__probe"></i>{{ item.ch }}</span>
            </h1>
          </div>
        </template>
      </ParticleField>
    </div>
  </div>
</template>

<style scoped>
.home {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #05070d; /* 首帧兜底，别闪白 */
}

/* ===== 开场层 ===== */
.intro {
  position: absolute;
  inset: 0;
  z-index: 10; /* 压住网格与右下角按钮 */
  pointer-events: none;
}

/* 黑幕独立成层，才能先退场而留住那行字 */
.shade {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(circle at 50% 45%, #0b1424 0%, #05070d 58%, #000 100%);
  transition: opacity 800ms ease;
}

.shade.is-gone {
  opacity: 0;
}

/* h1 自带 translateX，位移缩放只能挂外层 */
.title-flight {
  position: absolute;
  inset: 0;
  z-index: 1;
  will-change: transform;
  transition: transform 1200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.intro-title {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  transition: opacity 700ms ease;
}

.intro-title.is-visible {
  opacity: 1;
}

.home__char {
  position: absolute;
  display: block;
  line-height: 1;
  white-space: pre;
  transform: translate(-50%, -50%);
  color: #eaf2ff;
  text-shadow: 0 0 24px rgba(120, 170, 255, 0.45);
  /* 略短于飞行，延后一拍褪色，落地刚好褪完 */
  transition: color 900ms ease 120ms, text-shadow 900ms ease 120ms;
}

/* 飞行途中白字褪成彩虹，仍是同一元素 */
.title-flight.is-flying .home__char {
  color: transparent;
  text-shadow: 0 0 24px rgba(120, 170, 255, 0);
  background-image: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
  background-repeat: no-repeat;
  background-size: var(--rainbow-w, 100%) 100%;
  background-position: calc(-1 * var(--char-x, 0px)) 0;
  -webkit-background-clip: text;
  background-clip: text;
  /* 收掉 canvas 字距，否则落地会横向跳一下 */
  translate: calc(
      (var(--char-n, 1) - 1) / 2 * var(--char-gap, 0px) - var(--i, 0) * var(--char-gap, 0px)
    ) 0;
  /* 收字距与飞行同步走完，落点才准 */
  transition:
    color 900ms ease 120ms,
    text-shadow 900ms ease 120ms,
    translate 1200ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 零尺寸基线探针，底边即该行 alphabetic 基线 */
.home__probe {
  display: inline-block;
  width: 0;
  height: 0;
  vertical-align: baseline;
}

/* ===== 外层容器：贴合视口，不留滚动条 ===== */
.bottom {
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

/* ===== wrapper：整体灰色背景 ===== */
.wrapper {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-height: 0; /* 关键：允许子项在 flex 中收缩 */
  background: #2E3234;
  overflow: hidden;
  user-select: none;
}

.edge-fab {
  --fab-size: 64px;

  position: absolute;
  left: 50%;
  top: 88%; /* 与 .cover 等高，落在其底边 */
  translate: -50% -75%; /* 圆心正好压在那条线上 */

  width: var(--fab-size);
  height: var(--fab-size);
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  z-index: 5; /* 只在开场层之下 */

  color: #ffffff;
  background: #0A59F7;
  box-shadow: 0 1px 2px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.35);
  transition: scale .25s cubic-bezier(.22,1,.36,1), box-shadow .25s ease, background .2s ease;
}
.edge-fab:hover  { scale: 1.06; }
.edge-fab:active { scale: .94; }
.edge-fab svg    { display: block; pointer-events: none; }

/* ===== 封面区域：吃掉剩余高度 ===== */
.cover {
  --l: 1500px; /* 圆半径，等于那段线段长度 */
  position: relative; /* 抬到网格之上 */
  z-index: 2;
  height: 88%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  /* 发光挂裁剪层外：同元素上 clip-path 会裁掉影子 */
  filter: drop-shadow(0 6px 18px rgba(10, 89, 247, 1));
}

.background {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;

  clip-path: circle(var(--l) at 50% calc(100% - var(--l))); /* 弧线裁在内容层 */

  background-image: url('/images/home-page-bg.webp');
  background-color: #dfe3ea; /* 图片未加载时的兜底色 */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;

  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ===== 仿 macOS 窗口｜增强高级质感 ===== */
.window {
  display: flex; /* 纵向排布，剩余高度才好分给探索块 */
  flex-direction: column;
  --window-drop: 80px; /* 窗口顶边与背景顶边的距离 */
  width: min(860px, calc(100% - 40px));
  margin-top: var(--window-drop);
  height: calc(100% - var(--window-drop)); /* 底边正好贴住背景底边 */
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.06),
      0 12px 32px rgba(0, 0, 0, 0.16),
      0 30px 60px rgba(0, 0, 0, 0.24);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease;
}
.window:hover {
  box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.08),
      0 20px 48px rgba(0, 0, 0, 0.20),
      0 40px 80px rgba(0, 0, 0, 0.28);
}
/* 拖窗口期间收掉毛玻璃，松手恢复 */
.window.is-resizing {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: rgba(255, 255, 255, 0.94);
}

/* 标题栏：高度固定，不参与剩余空间分配 */
.window-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 34px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(210, 210, 210, 0.45);
  background: rgba(248, 248, 248, 0.72);
}

.window-title-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  color: #515154;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.12));
}
.dot-red {
  background: #ff5f57;
  border: 0.5px solid #e0443e;
}
.dot-yellow {
  background: #febc2e;
  border: 0.5px solid #dea123;
}
.dot-green {
  background: #28c840;
  border: 0.5px solid #1aab29;
}

/* 内容区占满剩余高度，空档留给探索块 */
.window-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 50px 32px;
  text-align: center;
  background: transparent;
}

.title-wrap {
  flex: none;
  margin-bottom: 20px;
}

/* 落位前隐形当量尺，落位后接管 */
.cover-title {
  display: inline-block; /* 宽度收到文字上，渐变才对得上飞来的那行 */
  margin: 0 0 8px;
  font-family: var(--title-font); /* 与飞行层同一个来源，落地就不跳 */
  font-weight: var(--title-weight);
  font-size: clamp(70px, 4vw, 75px);
  color: rgba(0, 0, 0, 0);
  background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
  -webkit-background-clip: text;
  background-clip: text;
  visibility: hidden;
}

.cover-title.is-visible {
  visibility: visible;
}

.cover-probe {
  display: inline-block;
  width: 0;
  height: 0;
  vertical-align: baseline;
}

.subtitle {
  margin:0;
  font-size: clamp(23px,1.8vw,26px);
  color:#6e6e73;
  font-weight:500;
}

.divider-line {
  flex: none;
  width: 64px;
  height:1px;
  background: linear-gradient(90deg, transparent,#c7c7cc,transparent);
  margin:0 auto 24px;
}

.tag-group {
  flex: none;
  display:flex;
  gap:10px;
  justify-content:center;
  flex-wrap:wrap;
}
.tag {
  padding:4px 12px;
  background:rgba(0,0,0,0.05);
  border-radius:999px;
  font-size:13px;
  color:#444;
}

.action-group {
  flex: none;
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  margin: 26px auto 0;
  background: rgba( 255, 255, 255, 0.45 );
  width: fit-content;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.2);
  corner-shape: superellipse(1.5);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border: 1px solid transparent;
  border-radius: 999px;
  corner-shape: superellipse(1.5);
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none; /* 链接形态也要像按钮 */
  cursor: pointer;
  transition: scale 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}
.btn svg { display: block; }
.btn:active { scale: 0.96; }

.btn-primary {
  color: #fff;
  background: #0A59F7;
  box-shadow: 0 6px 18px rgba(10, 89, 247, 0.32);
}
.btn-primary:hover {
  background: #0b4fdb;
  box-shadow: 0 8px 24px rgba(10, 89, 247, 0.4);
}

.btn-ghost {
  color: #3a3f42;
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(0, 0, 0, 0.09);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
.btn-ghost:hover {
  background: #fff;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.13);
}

/* 空白间隔：与探索块平分下方剩余高度 */
.hint-fill {
  flex: 1 1 0;
  min-height: 0;
}

/* 占剩余高度一半，内容居中并轻轻浮动 */
.scroll-hint {
  flex: 1 1 0;
  min-height: 0;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  font-size:14px;
  letter-spacing:0.1em;
  color:#8a8a8e;
  animation: hint-float 2s ease-in-out infinite;
}
.scroll-hint-icon { display:block; }

@keyframes hint-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(4px); }
}

/* ===== 最后一行：NATB DEVELOPER GROUP（占满宽度） ===== */
.developer-group {
  position: relative; /* 抬到网格之上 */
  z-index: 0;
  font-family: Arial, system-ui;
  width: 100%;
  font-size: 8.23cqw; /* 字号随容器宽，可微调 */
  font-weight: 700;
  line-height: 0.8;
  color: #3a3f42;
  white-space: nowrap;
  letter-spacing: -0.05em; /* 负值即收紧字距 */
}
.developer-group span {
  display: inline-block;
  height: 0.8em;
}

/* ===== 入场编排 =====
   黑幕开褪即起跑，窗口、顶栏、正文、底带依次进场。
   只用 translate/scale，免得动的时候带歪量好的落点；
   统一 backwards 填充，延迟期间先藏住，跑完不留尾巴。 */
@keyframes enter-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 窗口入场：起点压在自己身下，整块顶上来 */
@keyframes window-rise {
  from { translate: 0 102%; }
  to   { translate: 0 0; }
}

@keyframes rise-in {
  from { opacity: 0; translate: 0 18px; }
  to   { opacity: 1; translate: 0 0; }
}

@keyframes bar-drop {
  from { opacity: 0; translate: 0 -100%; }
  to   { opacity: 1; translate: 0 0; }
}

@keyframes pop-in {
  from { opacity: 0; scale: 0.6; }
  to   { opacity: 1; scale: 1; }
}

/* 分隔线从中间长出来 */
@keyframes line-grow {
  from { opacity: 0; scale: 0.2 1; }
  to   { opacity: 1; scale: 1 1; }
}

/* 底部字带从下往上顶出来 */
@keyframes band-rise {
  from { opacity: 0; translate: 0 60%; }
  to   { opacity: 1; translate: 0 0; }
}

.home.is-revealing .background,
.home.is-revealing .grid-background {
  animation: enter-fade 900ms ease backwards;
}

.home.is-revealing .window {
  animation: window-rise 1080ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

/* 顶栏随窗口落定再扣上，三个圆点依次弹出来 */
.home.is-revealing .window-bar {
  animation: bar-drop 520ms cubic-bezier(0.22, 1, 0.36, 1) 180ms backwards;
}
.home.is-revealing .dot {
  animation: pop-in 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.home.is-revealing .dot:nth-child(1) { animation-delay: 300ms; }
.home.is-revealing .dot:nth-child(2) { animation-delay: 370ms; }
.home.is-revealing .dot:nth-child(3) { animation-delay: 440ms; }
.home.is-revealing .window-title-text {
  animation: rise-in 460ms ease 470ms backwards;
}

/* 正文：标题由飞行落位，其余按顺序跟上 */
.home.is-revealing .subtitle {
  animation: rise-in 560ms cubic-bezier(0.22, 1, 0.36, 1) 560ms backwards;
}
.home.is-revealing .divider-line {
  animation: line-grow 520ms cubic-bezier(0.22, 1, 0.36, 1) 700ms backwards;
}
.home.is-revealing .tag {
  animation: rise-in 520ms cubic-bezier(0.22, 1, 0.36, 1) 820ms backwards;
}
.home.is-revealing .tag:nth-child(2) { animation-delay: 890ms; }
.home.is-revealing .tag:nth-child(3) { animation-delay: 960ms; }
.home.is-revealing .tag:nth-child(4) { animation-delay: 1030ms; }
.home.is-revealing .action-group {
  animation: rise-in 600ms cubic-bezier(0.22, 1, 0.36, 1) 1060ms backwards;
}
/* 浮动常驻；入场那条只碰透明度与位移 */
.home.is-revealing .scroll-hint {
  animation:
    hint-float 2s ease-in-out infinite,
    rise-in 600ms cubic-bezier(0.22, 1, 0.36, 1) 1260ms backwards;
}
.home.is-revealing .developer-group {
  animation: band-rise 820ms cubic-bezier(0.22, 1, 0.36, 1) 520ms backwards;
}
/* 圆钮只缩放弹入，别碰它用来居中的 translate */
.home.is-revealing .edge-fab {
  animation: pop-in 560ms cubic-bezier(0.34, 1.56, 0.64, 1) 460ms backwards;
}
</style>
