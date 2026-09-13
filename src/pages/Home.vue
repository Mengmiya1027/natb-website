<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ParticleField from '@/components/ParticleField.vue'
import GridBackground from '@/components/GridBackground.vue'
import { useAnimationStore } from '@/stores/animation'

// 粒子层与静态字共用同一套字体参数，两边不一致就对不上
const TITLE = 'New Android Tool Box'
const FONT_FAMILY = "'HarmonyOS Sans SC', Arial"
const FONT_WEIGHT = 700

const HOLD_MS = 1000 // 汇聚成字后停留
const FLY_MS = 1200 // 飞到窗口标题的时长，改它要同步 .title-flight 的 transition

const store = useAnimationStore()

const flightRef = ref(null) // 全程唯一的那行字
const ghostRef = ref(null) // 窗口里的隐形占位，只用来量落点
const targetProbe = ref(null) // 量落点的基线
const flyStyle = ref({})
// 起飞后不再回头：黑幕退场、字褪成彩虹都由它驱动
const flying = computed(() => store.isFlying || store.isLanded)

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

let timers = []
let scheduled = false
let realignTimer = null

function later(fn, ms) {
  const id = window.setTimeout(fn, ms)
  timers.push(id)
  return id
}

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id))
  timers = []
}

// h1 是 inset:0 的空盒子，文字范围只能靠逐字定位框取并集
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

// 占位标题的真实文字框，块级元素的 rect 是整行容器宽，量不得
function textRect(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const r = range.getBoundingClientRect()
  return r.width ? r : null
}

// 源中心与基线做不动点：宽度缩放对上，基线对齐压低落点误差
function measureFlight() {
  const flight = flightRef.value
  const ghost = ghostRef.value
  const probe = targetProbe.value
  const srcProbe = flight?.querySelector('.home__probe')
  const src = charsRect(flight)
  const dst = ghost ? textRect(ghost) : null
  if (!src || !dst || !srcProbe || !probe) return null

  const base = flight.getBoundingClientRect()
  const srcCenterX = (src.left + src.right) / 2
  const srcBaseY = srcProbe.getBoundingClientRect().bottom
  const dstCenterX = (dst.left + dst.right) / 2
  const dstBaseY = probe.getBoundingClientRect().bottom
  const scale = dst.width / src.width

  // 整行一份彩虹，每个字按自己的左边缘取那一段，拼起来才连续
  flight.querySelectorAll('.home__char').forEach((el) => {
    const r = el.getBoundingClientRect()
    el.style.setProperty('--char-x', `${r.left - src.left}px`)
  })

  return {
    '--rainbow-w': `${src.width}px`,
    transformOrigin: `${srcCenterX - base.left}px ${srcBaseY - base.top}px`,
    transform: `translate(${dstCenterX - srcCenterX}px, ${dstBaseY - srcBaseY}px) scale(${scale})`,
  }
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
  later(() => store.land(), FLY_MS)
}

// 落定后视口变了要重新贴一次：先落回起点量，量完立刻贴上
async function realign() {
  if (!flying.value) return
  const flight = flightRef.value
  if (!flight) return
  flight.style.transition = 'none' // 免得中途飘一程
  flyStyle.value = {}
  await nextTick()
  flyStyle.value = measureFlight() || {}
  await nextTick()
  flight.style.transition = ''
}

function onResize() {
  window.clearTimeout(realignTimer)
  realignTimer = window.setTimeout(realign, 220)
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
  window.addEventListener('resize', onResize)
  // 粒子层若判定动画已播过会立刻收尾，这里要跟上
  if (store.isDone) scheduleFly()
})

onBeforeUnmount(() => {
  clearTimers()
  window.clearTimeout(realignTimer)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="home">
    <!-- 正式首页：原 cover 的内容 -->
    <div class="bottom">
      <div class="wrapper">
        <div class="cover">
          <div class="background">
            <div class="window">
              <!-- macOS 窗口标题栏 -->
              <div class="window-bar">
                <span class="dot dot-red" />
                <span class="dot dot-yellow" />
                <span class="dot dot-green" />
                <div class="window-title-text">NATB App</div>
              </div>
              <!-- 窗口内容区 -->
              <div class="window-body">
                <div class="title-wrap">
                  <!-- 隐形占位：撑住版式，同时给出那行字该落在哪 -->
                  <div ref="ghostRef" class="cover-ghost" aria-hidden="true">
                    New Android Tool Box<i ref="targetProbe" class="cover-probe"></i>
                  </div>
                  <p class="subtitle">小天才手表ADB工具箱</p>
                </div>
                <div class="divider-line"></div>
                <div class="tag-group">
                  <span class="tag">一键ROOT</span>
                  <span class="tag">离线OTA</span>
                  <span class="tag">XP框架安装</span>
                  <span class="tag">应用管理</span>
                </div>
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

    <!-- 开场层：黑幕与粒子在下，那行字在上，黑幕先退、字继续飞 -->
    <div class="intro">
      <div class="shade" :class="{ 'is-gone': flying }"></div>
      <ParticleField :text="TITLE" :font-family="FONT_FAMILY" :font-weight="FONT_WEIGHT">
        <template #title="{ chars, titleStyle, shift, visible, probe }">
          <div
            ref="flightRef"
            class="title-flight"
            :class="{ 'is-flying': flying }"
            :style="flyStyle"
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
                :style="{ left: item.left, top: item.top }"
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

/* 黑幕：单拎出来，才能先退场而把那行字留在台上 */
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

/* 飞行外壳：h1 自带 translateX，位移缩放只能挂在外层 */
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
  /* 比飞行略短，起飞后稍等一拍再褪色，落地时刚好褪完 */
  transition: color 900ms ease 120ms, text-shadow 900ms ease 120ms;
}

/* 飞行途中白字渐渐褪成那行彩虹字，仍是同一个元素 */
.title-flight.is-flying .home__char {
  color: transparent;
  text-shadow: 0 0 24px rgba(120, 170, 255, 0);
  background-image: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
  background-repeat: no-repeat;
  background-size: var(--rainbow-w, 100%) 100%;
  background-position: calc(-1 * var(--char-x, 0px)) 0;
  -webkit-background-clip: text;
  background-clip: text;
}

/* 零尺寸基线探针，底边即该行 alphabetic 基线 */
.home__probe {
  display: inline-block;
  width: 0;
  height: 0;
  vertical-align: baseline;
}

/* ===== 外层容器：严格贴合视口，不产生滚动条 ===== */
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
  top: 88%; /* ★ 与 .cover 的 height: 88% 对齐 → 落在 cover 底边 */
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
  --l: 1500px; /* 尺规里那段线段的长度，也是圆半径 */
  position: relative; /* 抬到网格之上 */
  z-index: 2;
  height: 88%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  overflow: hidden;
  clip-path: circle(var(--l) at 50% calc(100% - var(--l)));
}

.background {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;

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
  width: min(860px, calc(100% - 40px));
  margin-top: 280px;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
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

/* 标题栏 */
.window-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(210, 210, 210, 0.45);
  background: rgba(248, 248, 248, 0.72);
}

/* 窗口标题文字 */
.window-title-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  color: #515154;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* 红黄绿三个圆点 */
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

/* 内容区 */
.window-body {
  padding: 50px 32px;
  text-align: center;
  background: transparent;
}

.title-wrap {
  margin-bottom: 20px;
}

/* 隐形的落点占位：字始终只有台上那一个 */
.cover-ghost {
  margin: 0 0 8px;
  font-size: clamp(70px, 4vw, 75px);
  font-weight: 1000;
  letter-spacing: 0.02em;
  visibility: hidden;
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
  width: 64px;
  height:1px;
  background: linear-gradient(90deg, transparent,#c7c7cc,transparent);
  margin:0 auto 24px;
}

.tag-group {
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

/* 探索引导：文字与图标整体居中，轻轻上下浮动 */
.scroll-hint {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  margin-top:38px;
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
  font-size: 8.23cqw; /* 数字试一下，差一点就微调 */
  font-weight: 700;
  line-height: 0.8;
  color: #3a3f42;
  white-space: nowrap;
  letter-spacing: -0.05em; /* ← 负值 = 收紧；原来 0.04em 是撑开 */
}
.developer-group span {
  display: inline-block;
  height: 0.8em;
}
</style>
