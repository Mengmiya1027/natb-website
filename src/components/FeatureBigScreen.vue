<script setup>
/**
 * 特色功能 · 大屏模式
 *
 * 八张功能卡在 3D 空间里各自竖直立着，围成一圈底面为正八边形的柱体；
 * 左右切换把整圈转 45°，让另一面正对镜头。版式语言沿用 features 基本页
 * （纸感八色 + 墨字 + 深墨蓝舞台 + 刊头两端对拉），卡片解剖借 updatelog
 * （eyebrow / 大标题 / 状态行 / 出血底纹 / 大圆角）。
 *
 * 两条几何上的硬约束，改这个文件前务必先读：
 *
 * 1) `preserve-3d` 不能被"分组属性"破坏。`.prism` 上只要落了 overflow:hidden、
 *    opacity<1、filter、clip-path 中的任何一个，transform-style 就会被降级成
 *    flat —— 八边形当场塌成一摞平面。所以裁剪一律交给 3D 树之外的 .screen /
 *    .screen__stage，入场淡入也只做在舞台那一层，绝不碰 .prism 的透明度。
 *
 * 2) 入场动画不许碰 `.prism` 的 transform（会覆盖掉 `--step` 的堆叠姿态），
 *    只动独立的 rotate / scale 属性 —— 它们与 transform 复合，绕的是同一根
 *    中心轴，所以看起来正是"整圈从 30° 外摆进来"。
 */
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

import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconX from '~icons/lucide/x'

// 指针跟随的 3D 倾斜壳：套在每一面「里面」，只让正对镜头的那一面跟着指针仰
import TiltCard from './3dcard.vue'

const props = defineProps({
  /** 大屏模式开着没有。模式本身不自持状态：接线那一侧说了算 */
  open: { type: Boolean, default: true },
  /** 开场正对镜头的是第几面（0 起）。从某张卡进大屏时用它直接定位 */
  initial: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

/* ===== 色板 =====
 * 八块都是低饱和纸感色：深墨蓝舞台之上，一圈浅色立牌就是一圈灯笼。
 * 每一块都按"墨黑压在它上面"验过对比度，最低一块也有 13:1，远超 AA。
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

/* ===== 卡片素材 =====
 * 封面在 public/images/features/cover（16:9，与截图同名）。
 * 不走 import.meta.glob：public 下的文件不该再经打包器，否则同一张图会被
 * "public 原样拷贝 + 打包器再产出一份"，白白翻倍；直接用 base 前缀取。
 * screenshot 那八张深色界面截图不进卡片 —— 小尺寸下不可读，八张排成一圈
 * 又正是被废弃的"截图墙"，真实界面留给大窗/详情那一层。
 */
const COVER_DIR = import.meta.env.BASE_URL + 'images/features/cover/'

const FEATURES = [
  {
    icon: IconShieldKeyhole,
    tag: 'ROOT',
    shot: 'root.webp',
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
  },
  {
    icon: IconCloudDownload,
    tag: 'OTA',
    shot: 'ota.webp',
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
  },
  {
    icon: IconLayers,
    tag: 'RTOS',
    shot: 'rtos.webp',
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
  },
  {
    icon: IconWidget,
    tag: 'APP',
    shot: 'appmanager.webp',
    title: '应用管理',
    desc: '多种安装方式，支持install/data/第三方安装器/install-create，总有一种适合您。',
  },
  {
    icon: IconCpuBolt,
    tag: 'EDL',
    shot: '9008.webp',
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
  },
  {
    icon: IconMagicStick,
    tag: 'MODULE',
    shot: 'magisk.webp',
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
  },
  {
    icon: IconFolderFiles,
    tag: 'FILES',
    shot: 'filemanager.webp',
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
  },
  {
    icon: IconScreenShare,
    tag: 'MIRROR',
    shot: 'scrcpy.webp',
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
  },
].map((item, index) => ({
  ...item,
  idx: index,
  no: String(index + 1).padStart(2, '0'),
  tint: TINTS[index % TINTS.length],
  art: COVER_DIR + item.shot,
}))

/* ===== 八边形几何 =====
 * 面数只在这里定一次：CSS 里的步进角与边心距系数都由它算出来注入，
 * 想让柱体换成六边形或十二边形，改 FEATURES 长度即可，样式不用动。
 *
 * 边心距（中心 → 面）R = W / (2·tan(π/n))，这一步是"八块板严丝合缝围成
 * 正八边形"的唯一解；再乘 1.03 留一道约 3% 的缝，八块板才读成八块独立的
 * 立板，而不是一个实心柱。
 */
const N = FEATURES.length
const STEP_DEG = 360 / N
const RING_K = (1 / (2 * Math.tan(Math.PI / N))) * 1.03

const TOTAL_NO = String(N).padStart(2, '0')
const ringVars = {
  '--step-deg': `${STEP_DEG}deg`,
  '--ring-k': RING_K.toFixed(4),
}

/* ===== 入场时间表 =====
 * 与 Features / UpdateLog 同一套做法：阶梯只写这一份，注入成 --enter-*，
 * 样式只管姿态与曲线，时间轴不会在两边各写一遍。
 * 顺序：光池 → 巨型序号 → 页眉三段 → 关闭钮 → 舞台淡入 + 柱体摆入
 * → 两张切换钮 → 序号 → 指示器逐段展开 → 落款。
 */
const ENTER = {
  folio: 100,
  kicker: 130,
  title: 210,
  meta: 310,
  close: 260,
  stage: 200,
  prism: 330,
  navLeft: 470,
  navRight: 540,
  ordinal: 660,
  meter: 700,
  meterStep: 55,
  hint: 800,
}
const ENTER_DUR = {
  kicker: 620,
  title: 700,
  meta: 620,
  close: 520,
  stage: 900,
  prism: 1000,
  nav: 520,
  ordinal: 560,
  meter: 520,
  hint: 560,
}
const ms = (v) => `${v}ms`
const enterVars = {
  '--enter-kicker': ms(ENTER.kicker),
  '--enter-title': ms(ENTER.title),
  '--enter-meta': ms(ENTER.meta),
  '--enter-close': ms(ENTER.close),
  '--enter-stage': ms(ENTER.stage),
  '--enter-prism': ms(ENTER.prism),
  '--enter-nav': ms(ENTER.navLeft),
  '--enter-nav-step': ms(ENTER.navRight - ENTER.navLeft),
  '--enter-ordinal': ms(ENTER.ordinal),
  '--enter-meter': ms(ENTER.meter),
  '--enter-meter-step': ms(ENTER.meterStep),
  '--enter-hint': ms(ENTER.hint),
  '--enter-dur-kicker': ms(ENTER_DUR.kicker),
  '--enter-dur-title': ms(ENTER_DUR.title),
  '--enter-dur-meta': ms(ENTER_DUR.meta),
  '--enter-dur-close': ms(ENTER_DUR.close),
  '--enter-dur-stage': ms(ENTER_DUR.stage),
  '--enter-dur-prism': ms(ENTER_DUR.prism),
  '--enter-dur-nav': ms(ENTER_DUR.nav),
  '--enter-dur-ordinal': ms(ENTER_DUR.ordinal),
  '--enter-dur-meter': ms(ENTER_DUR.meter),
  '--enter-dur-hint': ms(ENTER_DUR.hint),
}
// 最晚落定的是指示器末段：它落定，这段入场就算走完
const ENTER_END = ENTER.meter + ENTER.meterStep * (N - 1) + ENTER_DUR.meter + 40

/* ===== 换面状态 =====
 * index 是"转过多少步"，无界：八边形本就是闭合的，转满八步回到原样，
 * 所以两侧按钮永不置灰、滚轮也永不到头。face 才是当前正对镜头的那一面。
 */
const index = ref(props.initial)
const face = computed(() => ((index.value % N) + N) % N)
const at = (i) => FEATURES[i]

/* ===== 连击加速 =====
 * 一次换面的过渡还没走完就又切，说明用户在快速连翻。这时若仍按 720ms 起跑，
 * 每次打断都恰好落在强缓动的慢尾巴上，越点越"一卡一卡"；所以只把连击这一路
 * 缩短，单点仍是原节奏。
 */
const COMBO_GAP = 500 // 距上次切换短于这么久就算连击
const COMBO_K = 0.5
const combo = ref(false)
let lastSwitch = -Infinity

function noteSwitch(force = false) {
  const now = performance.now()
  const quick = force || now - lastSwitch < COMBO_GAP
  lastSwitch = now
  if (combo.value !== quick) combo.value = quick
}

/* ===== 换面 ===== */
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

function step(delta) {
  if (!delta) return
  finishEntrance()
  noteSwitch()
  index.value += delta
}

/** 指示器与侧面板的跳转：走最短路径（7 → 0 只转一步，而不是倒着走七步） */
function goToFace(k) {
  const delta = (((k - face.value + N / 2) % N) + N) % N - N / 2
  step(delta)
}

/* ===== 指针：拖拽转圈 =====
 * 拖拽就是"抓住这圈板子横向拉"，松手吸附到最近的 45°。
 * 角位移不设上限：一圈本就是闭合的，想拉多远拉多远，落位时按最近的 45° 吸附。
 */
const SENS = 0.22 // 每像素转多少度

const viewportEl = ref(null)
const drag = ref(0)
const dragging = ref(false)

let pointerId = null
let startPoint = { x: 0, y: 0 }
let engaged = false
let moved = false
// 按下时指针压在哪一面上：指针捕获会吃掉卡片的 click，这一路要自己补
let downFace = -1

function onDown(event) {
  if (reduceMotion || event.button !== 0 || pointerId !== null) return
  pointerId = event.pointerId
  startPoint = { x: event.clientX, y: event.clientY }
  engaged = false
  moved = false
  downFace = event.target instanceof Element ? Number(event.target.closest('.face')?.dataset.face ?? -1) : -1
  // 捕获指针：手指/鼠标移出元素也继续跟手
  try {
    event.currentTarget.setPointerCapture(pointerId)
  } catch {
    /* 元素已卸载或浏览器不支持，拖拽降级为"出界即断" */
  }
}

function onMove(event) {
  if (pointerId === null || event.pointerId !== pointerId) return
  const dx = event.clientX - startPoint.x
  const dy = event.clientY - startPoint.y
  if (!engaged) {
    if (Math.abs(dx) < 6) return
    // 竖着手势交还给页面（触摸下就是滚动），只有明确的横向拖动才转圈
    if (Math.abs(dy) > Math.abs(dx)) {
      endDrag(event)
      return
    }
    engaged = true
    dragging.value = true
    finishEntrance()
  }
  moved = true
  drag.value = dx * SENS
}

function endDrag(event) {
  if (pointerId === null || (event && event.pointerId !== pointerId)) return
  const id = pointerId
  pointerId = null
  try {
    viewportEl.value?.releasePointerCapture(id)
  } catch {
    /* 指针已经没了，不必再放 */
  }
  if (!engaged) {
    /* 指针捕获会把 click 派发到捕获元素（视口）而不是卡片本身，
     * 卡片上的 @click 于是永远收不到指针点击 —— 那一路在这里补：
     * 按下的位置落在哪一面，就把它转到镜头正中（没拖动过才算数）。 */
    if (!moved && downFace >= 0) pick(downFace)
    downFace = -1
    return
  }
  engaged = false
  downFace = -1
  // 吸附：先把"拖出来的角度"折成整数步，再在同一帧里把过渡与角度一起归位 ——
  // 浏览器按改后样式起一条 720ms 的过渡，于是这最后一段是滑回去的，不是跳回去的。
  const steps = Math.round(drag.value / STEP_DEG)
  if (steps) {
    noteSwitch(true)
    index.value -= steps
  }
  drag.value = 0
  dragging.value = false
}

/* ===== 滚轮换面 =====
 * 攒够一格走一面、余额留到下一次：连滚几格就连切几面，不再有冷却挡着。
 */
const WHEEL_STEP = 100 // 一格鼠标滚轮≈100px，正好一面
const WHEEL_MAX_STEPS = 3 // 单段最多连切几面，猛滑一记不至于一路冲到底

let wheelAcc = 0

/** 行/页两种 deltaMode 折成像素，统一口径 */
const wheelPx = (event) =>
  event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY

function onWheel(event) {
  const dy = wheelPx(event)
  if (!dy) return
  finishEntrance()
  // 页面锁死在视窗里，本没有滚动可抢；拦下来是为了不把滚轮事件链给外层
  event.preventDefault()
  // 中途反向算新的一段，免得抖一下跑两面
  if (wheelAcc && Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0
  wheelAcc += dy
  const dir = wheelAcc > 0 ? 1 : -1
  const steps = Math.min(Math.floor(Math.abs(wheelAcc) / WHEEL_STEP), WHEEL_MAX_STEPS)
  if (steps <= 0) return
  wheelAcc -= dir * steps * WHEEL_STEP // 余额结转，下一格接着算
  step(dir * steps)
}

/* ===== 点面 =====
 * 点侧面板＝把它转到镜头正中。刚拖过的那一下会在 pointerup 之后补一个 click，
 * 用 moved 把它吞掉，免得"拖完顺手把某面也转了"。
 */
function pick(i) {
  if (moved) {
    moved = false
    return
  }
  // 正对镜头的那一面不可点：它已经在中间了，点它没有任何可换的对象
  if (i === face.value) return
  goToFace(i)
}

function close() {
  finishEntrance()
  emit('close')
}

function onKeydown(event) {
  if (!props.open || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  }
}

/* ===== 入场的开关 =====
 * 少动效时压根不加这个类，元素直接停在终态，一帧动画都不跑。
 */
const entering = ref(false)
let enterTimer = 0

/** 收尾：动画整批撤掉，元素回落到的静态样式就是动画终态，交接不跳 */
function finishEntrance() {
  if (enterTimer) {
    clearTimeout(enterTimer)
    enterTimer = 0
  }
  if (entering.value) entering.value = false
}

function startEntrance() {
  if (reduceMotion) return
  entering.value = true
  clearTimeout(enterTimer)
  enterTimer = window.setTimeout(finishEntrance, ENTER_END)
}

/** 每开一次都从 initial 那一面起跑，上一轮的拖拽角度也一并归零 */
watch(
  () => props.open,
  (on) => {
    if (!on) {
      finishEntrance()
      return
    }
    wheelAcc = 0
    index.value = props.initial || 0
    drag.value = 0
    dragging.value = false
    nextTick(startEntrance)
  },
)

watch(
  () => props.initial,
  (v) => {
    if (props.open) index.value = v || 0
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.open) startEntrance()
})

onBeforeUnmount(() => {
  if (enterTimer) clearTimeout(enterTimer)
  window.removeEventListener('keydown', onKeydown)
})

const announce = computed(() => {
  const item = at(face.value)
  return `正在展示 ${item.no} / ${TOTAL_NO} ${item.title}：${item.desc}`
})
const folio = computed(() => at(face.value).no)
</script>

<template>
  <!-- Teleport 到 body：整屏模式不受 features 页那个 fixed + overflow 的祖先连累 -->
  <Teleport to="body">
    <div
      v-if="open"
      class="screen"
      :class="{ 'is-entering': entering }"
      :style="[ringVars, enterVars, { '--dur-k': combo ? COMBO_K : 1 }]"
      role="dialog"
      aria-modal="true"
      aria-label="特色功能大屏模式"
    >
      <!-- ── 背景：光池 + 巨型序号 ── -->
      <div class="screen__backdrop" aria-hidden="true">
        <div class="screen__glow"></div>
        <!-- 换面时整块重挂一次，序号是"翻"上去的 -->
        <p :key="face" class="screen__folio">{{ folio }}</p>
      </div>

      <div class="screen__inner">
        <!-- ── 刊头：沿用 features 基本页的两端对拉 ── -->
        <header class="screen__head">
          <span class="screen__mark" aria-hidden="true"></span>

          <div class="screen__headgrid">
            <div class="screen__lead">
              <p class="screen__kicker">NATB — 特色功能</p>
              <h1 class="screen__title"><span>随心</span><span class="screen__title-b">所欲</span></h1>
            </div>

            <div class="screen__note">
              <p class="screen__lede">全方面支持小天才手表玩机需求</p>
              <p class="screen__meta">
                <span>{{ TOTAL_NO }} FEATURES</span>
                <span class="screen__dot" aria-hidden="true"></span>
                <span>SINCE 2026</span>
              </p>
            </div>
          </div>

          <span class="screen__rule" aria-hidden="true"></span>
        </header>

        <!-- ── 舞台：八边形柱体 ── -->
        <section class="screen__stage" aria-label="特色功能展示台">
          <div
            ref="viewportEl"
            class="screen__viewport"
            :class="{ 'is-dragging': dragging }"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="endDrag"
            @pointercancel="endDrag"
            @wheel="onWheel"
          >
            <div
              class="prism"
              :class="{ 'is-dragging': dragging }"
              :style="{ '--step': index, '--drag': `${drag.toFixed(2)}deg` }"
            >
              <button
                v-for="(item, i) in FEATURES"
                :key="item.idx"
                type="button"
                class="face"
                :class="{ 'is-front': face === i }"
                :data-face="i"
                :style="{ '--i': i, '--tint': item.tint }"
                :tabindex="face === i ? -1 : 0"
                :aria-current="face === i ? 'true' : undefined"
                :aria-label="`${item.no} ${item.title}`"
                @click="pick(i)"
              >
                <!-- 3D 倾斜壳套在「面里面」：壳写自己的 transform，这一面的 rotateY
                     由外层写着，两者互不覆盖，柱体因此毫发无损。
                     壳里的皮肤层才是"看得见的那张卡" —— 底色、描边、圆角、投影、
                     暗纱、出血序号全在它身上，所以指针一动是整张卡在仰，不是一个框
                     兜着几张会晃的图。只有正对镜头的那一面接指针，其余各面 disabled。 -->
                <TiltCard
                  class="face__shell"
                  :disabled="face !== i"
                  :max-tilt="6"
                  :perspective="1500"
                  :scale="1"
                  :glare="face === i"
                  glare-color="#ffffff"
                  :glare-opacity="0.26"
                  :glare-size="140"
                >
                  <span class="face__skin">
                    <span class="face__shot">
                      <img class="face__img" :src="item.art" alt="" draggable="false" decoding="async" />
                      <span class="face__no" aria-hidden="true">{{ item.no }}</span>
                      <span class="face__chip" aria-hidden="true">
                        <component :is="item.icon" width="17" height="17" />
                      </span>
                    </span>

                    <span class="face__body">
                      <span class="face__tag">{{ item.tag }}</span>
                      <span class="face__title">{{ item.title }}</span>
                      <span class="face__desc">{{ item.desc }}</span>
                      <span class="face__foot">
                        <span class="face__signal" aria-hidden="true"></span>
                        <span>{{ face === i ? '正在展示' : '转到这一面' }}</span>
                      </span>
                    </span>

                    <!-- 出血巨型序号：压到皮肤最底层，只提供质感 -->
                    <span class="face__mark" aria-hidden="true">{{ item.no }}</span>
                    <!-- 侧面板退到暗处，正对镜头的那一面才是亮的 -->
                    <span class="face__veil" aria-hidden="true"></span>
                  </span>
                </TiltCard>
              </button>
            </div>
          </div>

          <button class="screen__nav screen__nav--prev" type="button" aria-label="上一面" @click="step(-1)">
            <IconChevronLeft width="30" height="30" aria-hidden="true" />
          </button>
          <button class="screen__nav screen__nav--next" type="button" aria-label="下一面" @click="step(1)">
            <IconChevronRight width="30" height="30" aria-hidden="true" />
          </button>
        </section>

        <!-- ── 页脚：序号 / 指示器 / 落款 ── -->
        <footer class="screen__foot">
          <p class="screen__ordinal">
            <b>{{ folio }}</b> / {{ TOTAL_NO }}
          </p>

          <ul class="meter" aria-label="功能导航">
            <li v-for="(item, i) in FEATURES" :key="item.idx" :style="{ '--m-i': i }">
              <button
                type="button"
                class="meter__seg"
                :class="{ 'is-front': face === i }"
                :style="{ '--seg': item.tint }"
                :aria-current="face === i ? 'true' : undefined"
                :aria-label="`查看 ${item.title}`"
                @click="goToFace(i)"
              ></button>
            </li>
          </ul>

          <p class="screen__hint">MADE BY NATB DEVELOPER GROUP</p>
        </footer>
      </div>

      <button class="screen__close" type="button" aria-label="退出大屏模式" @click="close">
        <IconX width="15" height="15" aria-hidden="true" />
        <span class="screen__close-text">退出大屏</span>
      </button>

      <p class="screen__sr" aria-live="polite">{{ announce }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== 性能：两个只在柱体自己身上消费的变量，声明成不继承 =====
 * 拖拽时每帧写 --drag、换面时改 --step。自定义属性默认是继承的，浏览器改它时会把
 * 该元素**整棵子树**的样式重算一遍 —— 而这里的子树是八张卡的封面、文字、图标、暗纱。
 * 实测拖拽 150 帧里样式重算吃掉 1053ms，占了那 2.5s 主线程的 40%。
 * 声明 inherits: false 之后，改它只落在柱体自己身上，子树一根头发都不动。
 * （--face-w / --radius / --step-deg 是真要被面消费的，保持继承不变。）
 */
@property --drag {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@property --step {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

.screen {
  /* ── 纸与墨：卡面这一套直接沿用 features 基本页 ── */
  --paper: #f8f6f2;
  --ink: #16150f;
  --rule-soft: rgba(22, 21, 15, 0.09);

  /* ── 舞台：深墨蓝，图版从这里浮出来 ── */
  --stage: rgb(40, 50, 61);
  --stage-deep: rgb(15, 21, 28);
  --on-stage: #f2f5f8;
  --on-stage-2: rgba(242, 245, 248, 0.74);
  --on-stage-3: rgba(242, 245, 248, 0.48);
  --line: rgba(255, 255, 255, 0.16);
  --glass: rgba(10, 14, 20, 0.6);
  --accent: #0a59f7;

  --font-latin: ui-sans-serif, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace;

  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur: 720ms;
  /* 连击时按这个倍数缩短。单点仍是 --dur 原节奏，真正生效的时长统一走 --dur-run */
  --dur-k: 1;
  --dur-run: calc(var(--dur) * var(--dur-k));

  /* ── 八边形几何 ──
     面宽 = 八边形的一条边；边心距 R = W / (2·tan(π/n))，--ring-k 在脚本里算，
     已经含了 3% 的缝。正视面停在 z=0（容器整体回推一个 R），所以下面这个
     面宽就是它在屏幕上的真实宽度。
     宽高比压到接近 1：立牌太瘦就不像"围成柱体的板"，太胖又显不出环的弧。 */
  --face-w: clamp(264px, 30vw, 540px);
  --face-h: clamp(326px, 50vh, 520px);
  --radius: calc(var(--face-w) * var(--ring-k));
  --push: calc(var(--face-w) * var(--ring-k) * -1);
  /* 透视略缓：太近会把相邻那两面压得太小，"八块板围成一圈"的读感就散了 */
  --persp: 1700px;

  position: fixed;
  inset: 0;
  z-index: 120;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--stage);
  color: var(--on-stage);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* ===== 背景 ===== */
.screen__backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 舞台正中一团冷光把柱体托住；再往下压深，柱体才像"站在"地上 */
.screen__glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(52% 44% at 50% 46%, rgba(158, 188, 222, 0.2), rgba(158, 188, 222, 0) 72%),
    radial-gradient(120% 90% at 50% 24%, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 62%),
    linear-gradient(180deg, var(--stage) 0%, var(--stage-deep) 100%);
}

/* 巨型序号当底纹：只提供质感，不参与阅读 */
.screen__folio {
  position: absolute;
  left: 50%;
  bottom: -1.5vh;
  translate: -50% 0;
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(112px, 19vw, 268px);
  font-weight: 700;
  line-height: 0.78;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.075);
  /* 换面时这一块会重挂，序号是翻上来的 */
  animation: folio-swap 520ms var(--ease);
}

@keyframes folio-swap {
  from {
    opacity: 0;
    translate: -50% 7%;
  }
  to {
    opacity: 1;
    translate: -50% 0;
  }
}

/* ===== 版心 ===== */
.screen__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: clamp(18px, 3.4vh, 40px) clamp(18px, 4vw, 64px) clamp(14px, 2.6vh, 28px);
}

/* ===== 刊头 ===== */
.screen__head {
  position: relative;
  flex: none;
  padding-bottom: clamp(10px, 1.6vh, 18px);
}

/* 套准标记：印刷版式最小的那个记号，与 kicker 左对齐 */
.screen__mark {
  position: absolute;
  top: 0;
  left: 0;
  width: 11px;
  height: 11px;
}

.screen__mark::before,
.screen__mark::after {
  content: '';
  position: absolute;
  background: rgba(242, 245, 248, 0.34);
}

.screen__mark::before {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.screen__mark::after {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
}

/* 两端对拉：左栏刊名与刊题，右栏导语与期号 */
.screen__headgrid {
  display: grid;
  grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
  align-items: end;
  gap: clamp(24px, 4vw, 84px);
}

.screen__lead {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.3vh, 16px);
  min-width: 0;
}

.screen__kicker {
  margin: 0;
  font-family: var(--font-latin);
  font-size: clamp(10px, 0.7vw, 11.5px);
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--on-stage-3);
  white-space: nowrap;
}

.screen__title {
  margin: 0;
  font-size: clamp(32px, 3.6vw, 56px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--on-stage);
  white-space: nowrap;
}

/* 双色调刊题：后两字退成冷灰，一句四字就分出了主次 */
.screen__title-b {
  color: rgba(242, 245, 248, 0.4);
}

.screen__note {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  align-self: stretch;
  gap: clamp(9px, 1.4vh, 16px);
  text-align: right;
  /* 竖线落在最右边：它是版心的右界 */
  padding-right: clamp(20px, 2.6vw, 46px);
  padding-bottom: clamp(2px, 0.5vh, 6px);
  border-right: 1px solid var(--line);
  min-width: 0;
}

.screen__lede {
  margin: 0;
  font-size: clamp(14px, 1.05vw, 18px);
  line-height: 1.58;
  color: var(--on-stage-2);
  text-wrap: pretty;
}

.screen__meta {
  display: flex;
  align-items: center;
  gap: 0.9em;
  margin: 0;
  font-family: var(--font-latin);
  font-size: clamp(9.5px, 0.66vw, 10.5px);
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--on-stage-3);
}

.screen__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--on-stage-3);
}

/* 刊头收尾的一条发丝线 */
.screen__rule {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--line);
  transform-origin: left center;
}

/* ===== 舞台 ===== */
.screen__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  margin-top: clamp(10px, 1.6vh, 22px);
}

/* 透视挂在这里：.prism 是它的子元素。注意这一层不许有 transform 之外的分组属性 */
.screen__viewport {
  position: absolute;
  inset: 0;
  perspective: var(--persp);
  perspective-origin: 50% 50%;
  cursor: grab;
  /* 竖滑交还页面，横滑才是转圈 */
  touch-action: pan-y;
}

.screen__viewport.is-dragging {
  cursor: grabbing;
}

/* ===== 八边形柱体 ===== */
/* 注意：这里故意不写 will-change。
 * will-change: transform 会把这一层的光栅化分辨率锁在"创建那一刻"的尺寸上，
 * 而正视面还要再放大 (1.045 × 透视)，于是整张卡（连文字）都被放大着显示 —— 糊。
 * 不写它，transform 一变浏览器照样会把柱体提成合成层，只是分辨率会跟着实际尺寸走。 */
.prism {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--face-w);
  height: var(--face-h);
  /* 唯一一处 preserve-3d：这里落任何 overflow / opacity / filter 都会塌成平面 */
  transform-style: preserve-3d;
  transform:
    translate(-50%, -50%)
    /* 整体回推一个边心距：正视面因此停在 z=0，所见即所得。
       不回推的话正视面离镜头只剩一个 R，透视会把它放大到 1.76 倍 */
    translateZ(var(--push))
    /* --step 是转过多少步，--drag 是拖拽中那一段自由角度 */
    rotateY(calc(var(--step, 0) * var(--step-deg) * -1 + var(--drag, 0deg)));
  transition: transform var(--dur-run) var(--ease);
}

/* 拖拽过程中把八张卡的模糊阴影摘掉：阴影每帧都要跟着重画，是拖拽时最大的一笔绘制
   开销。手一松就回来 —— 只有静止对照才看得出差别，运动中的画面看不出来。 */
.prism.is-dragging .face__skin {
  box-shadow: none;
}

.prism.is-dragging {
  transition: none;
}

/* ===== 八边形的一面 =====
 * 这一层只剩"几何 + 语义"：它在环上的位置、背面剔除、指针与可访问性。
 * 之所以不留任何视觉、也不留 overflow —— 在 preserve-3d 里带裁剪的面会让
 * Chrome 的 3D 命中测试整片失效（实测容器转到 ∓90° 时八张卡全部点不动，
 * 连正视面自己都命中不到），裁剪因此全部下沉给皮肤层。
 */
.face {
  position: absolute;
  inset: 0;
  display: block;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  appearance: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  /* 面朝外立在这一圈的切向上；背面（对侧那四面）由 backface 直接抹掉。
     正视面另外向前推一截并放大 —— updatelog 那张"正在看"的卡就是这么立起来的：
     换面时旧面缩回、新面浮出，与整环的转动同一条时长，
     看上去是"环转到位 + 这一面被抽出来"，而不是八块板整体平移 */
  transform: rotateY(calc(var(--i) * var(--step-deg))) translateZ(var(--radius));
  /* 按下时的收缩走独立 scale 属性：160ms 的快节奏，不被 720ms 的换面拖着走 */
  scale: 1;
  backface-visibility: hidden;
  /* 这里绝对不能写 will-change: transform —— 它会把这一层的光栅化分辨率钉死在
     "建层那一刻"的尺寸上，而正对镜头的那一面还要被放大（scale × 透视）。
     于是它一直拿放大前的纹理放大着显示：动的时候浏览器每帧重建所以清楚，
     一停下来就回到那张不够大的纹理 —— 糊。八张卡里只有正中那张会被放大，
     所以也只有它会糊，而且正好是"停下才糊"。 */
  transition:
    transform var(--dur-run) var(--ease),
    scale 160ms var(--ease);
}

/* 正对镜头的那一面：浮出。位移留在 3D 里（它本来就是"离眼睛更近"），
   **但放大不写在这儿** —— 理由见下面 .face.is-front .face__skin。
   它已经站在中间、没有可换的对象，所以不给"可点"的手型，改回抓取手势 */
.face.is-front {
  transform:
    rotateY(calc(var(--i) * var(--step-deg)))
    translateZ(calc(var(--radius) + 20px));
  cursor: grab;
}

/* 点下去先收一下，松手才跳 —— updatelog 卡片的按下反馈。只在可点的那几面上给 */
.face:not(.is-front):active {
  scale: 0.97;
}

/* 但按下去之后如果是在拖（不是在点），这一下收缩要立刻撤掉：
   拖拽是"抓住整圈在转"，卡片还缩着就像被捏住了。
   选择器比上面那条更具体，所以覆盖得住；160ms 之内自己弹回去 */
.screen__viewport.is-dragging .face:not(.is-front):active {
  scale: 1;
}

/* 焦点环画在皮肤上：外框自己是透明的一层，画在它上面看不见 */
.face:focus-visible .face__skin {
  outline: 3px solid rgba(255, 255, 255, 0.92);
  outline-offset: 2px;
}

/* 3D 倾斜壳：壳自己不设尺寸，这里把它撑满整面 */
.face__shell {
  display: block;
  width: 100%;
  height: 100%;
  /* 皮肤不参与环的 3D 排序（它就是贴在面上的一张平面卡），留在 preserve-3d
     上下文里没有半点好处 —— 反而会让浏览器把"带裁剪的层"当成 3D 子树的一部分
     去合成，静止后缓存成一张低分辨率纹理：表现就是"入场动画时清楚、动画一停整张糊"。 */
  transform-style: flat;
  /* 这一层外面还要被 3D 变换（透视 + 倾斜），带上 backface-visibility 之后浏览器
     会按更高的像素密度光栅化它 —— 正对"动画期间清楚、停下就糊"这个症状：
     动画期间每帧重建所以清楚，停下来改从缓存的纹理取，密度不够就糊。 */
  backface-visibility: hidden;
}

/* 皮肤：这一面所有看得见的东西 —— 底色、描边、圆角、投影都在它身上，
   所以指针一动，整张卡（而不是框里的几张图）在仰。裁切也归它：
   封面的出血与那个巨型序号都靠它收边，外面那层因此可以完全透明。 */
.face__skin {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.6);
  /* 圆角比基本页大得多：大屏上这八块板是主角，角形就是它的性格 */
  border-radius: clamp(22px, 1.8vw, 30px);
  corner-shape: superellipse(2);
  background: var(--tint, #eeebe5);
  color: var(--ink);
  text-align: left;
  /* 阴影模糊半径直接决定这一层纹理要向外扩多少（约三倍半径），
     层纹理越大越容易被归进"该降级"的那一档 —— 所以这里的半径收得比较紧 */
  box-shadow: 0 1px 4px rgba(4, 7, 11, 0.3), 0 10px 20px rgba(4, 7, 11, 0.34);
  /* 阴影故意不进过渡列表：带超椭圆角形的层，每帧重画一遍模糊阴影是这里最贵的一笔
     （updatelog 的卡片踩过同一个坑，注释也写在那边）。换面时位移动画遮得住，
     直接切换看不出来，省下的是八张卡每帧一次的路径 + 模糊重算 */
  transition: transform var(--dur-run) var(--ease), border-color 420ms ease;
  transform: scale(1);
}

/* 正对镜头的那一面：亮边 + 压深一档的投影 + 放大。
 *
 * 放大必须写在**皮肤**上，不能写进 .face 的 3D transform：
 * 处在 preserve-3d 上下文里的层，浏览器是"先按原始尺寸把内容光栅化成一张纹理，
 * 再拿这张纹理去做 3D 重投影"—— 被放大时就一直是那张不够大的纹理在被拉伸，
 * 于是只有正对镜头这一面糊，而且动的时候会逐帧重建所以清楚、一停下就糊回去。
 * 皮肤是普通 2D 层，缩放它会让浏览器按缩放后的尺寸重新光栅化，字才立得住。 */
.face.is-front .face__skin {
  transform: scale(1.03);
  border-color: rgba(255, 255, 255, 0.84);
  box-shadow: 0 2px 6px rgba(4, 7, 11, 0.34), 0 16px 34px rgba(4, 7, 11, 0.5);
}

/* 封面：出血铺满卡的上半部。
 * 高度交给 flex 吃满剩余空间而不是钉死 16:9：卡高是定值，钉死比例就会在
 * 只有一行描述的那几张卡里留下一大块空白。留一个 40% 的底，描述到三行时
 * 封面也还站得住。 */
.face__shot {
  position: relative;
  display: block;
  flex: 1 1 auto;
  min-height: 40%;
  overflow: hidden;
  background: color-mix(in srgb, var(--tint) 72%, #fff);
}

.face__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

/* 只在底部一段化进卡面色，图与文字之间不留硬边 */
.face__shot::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0%,
    transparent 46%,
    color-mix(in srgb, var(--tint) 58%, transparent) 82%,
    color-mix(in srgb, var(--tint) 97%, transparent) 100%
  );
}

.face__no {
  position: absolute;
  top: clamp(10px, 1.1vh, 14px);
  right: clamp(12px, 1vw, 16px);
  font-family: var(--mono);
  font-size: clamp(11px, 0.72vw, 13px);
  font-weight: 700;
  letter-spacing: 0.16em;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 1px 7px rgba(8, 12, 18, 0.55);
}

/* 图标章骑在封面与文字的交界上：上面是图、下面是字，它正好把两边缝起来 */
.face__chip {
  position: absolute;
  left: clamp(14px, 1.2vw, 20px);
  bottom: 0;
  translate: 0 46%;
  display: grid;
  place-items: center;
  width: clamp(32px, 2.5vw, 40px);
  height: clamp(32px, 2.5vw, 40px);
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 13px;
  corner-shape: superellipse(2);
  background: var(--paper);
  color: color-mix(in srgb, var(--ink) 66%, var(--tint));
  box-shadow: 0 4px 12px rgba(22, 21, 15, 0.18);
}

/* 卡面下半：标签 / 标题 / 一句话 / 状态行。按内容取高，剩下的全给封面 */
.face__body {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: clamp(6px, 0.9vh, 10px);
  min-height: 0;
  /* 上内距要把骑缝的图标章让出来 */
  padding: clamp(22px, 2.6vh, 32px) clamp(16px, 1.4vw, 22px) clamp(14px, 1.6vh, 18px);
}

.face__tag {
  align-self: flex-start;
  padding: 3px 10px;
  border: 1px solid rgba(22, 21, 15, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  font-family: var(--mono);
  font-size: clamp(10px, 0.68vw, 11.5px);
  font-weight: 600;
  letter-spacing: 0.14em;
  color: rgba(22, 21, 15, 0.6);
}

.face__title {
  /* 这一面的主角 */
  font-size: clamp(21px, 1.85vw, 30px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.face__desc {
  font-size: clamp(12px, 0.9vw, 14.5px);
  line-height: 1.62;
  color: rgba(22, 21, 15, 0.66);
  /* 两到三行封顶：卡高就那么多，多出来的留给封面 */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 状态行：贴到卡底，与 updatelog 卡里那行同一个位置、同一种语气 */
.face__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: clamp(8px, 1.2vh, 12px);
  border-top: 1px solid var(--rule-soft);
  font-size: clamp(11px, 0.76vw, 12.5px);
  letter-spacing: 0.08em;
  color: rgba(22, 21, 15, 0.56);
}

.face__signal {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid rgba(22, 21, 15, 0.4);
  transition: box-shadow 300ms ease, background-color 300ms ease, border-color 300ms ease;
}

.face.is-front .face__signal {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(10, 89, 247, 0.16);
}

/* 出血巨型序号：z-index 负值让它落在卡背景之上、内容之下 */
.face__mark {
  position: absolute;
  right: 0.06em;
  bottom: -0.08em;
  z-index: -1;
  font-family: var(--mono);
  font-size: clamp(64px, 5.4vw, 96px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  font-variant-numeric: tabular-nums;
  color: rgba(22, 21, 15, 0.07);
}

/* 暗纱：不朝镜头的那几面退到暗处，正面自然跳出来。随旋转淡入淡出 */
.face__veil {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
  background: rgb(6, 9, 13);
  opacity: 0.3;
  pointer-events: none;
  transition: opacity 420ms ease;
}

.face.is-front .face__veil {
  opacity: 0;
}

@media (hover: hover) {
  /* 悬停在侧面板上：先亮一点，告诉用户"这一面能点过来" */
  .face:not(.is-front):hover .face__veil {
    opacity: 0.1;
  }
}

/* ===== 左右切换 ===== */
.screen__nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: clamp(44px, 3.4vw, 54px);
  height: clamp(44px, 3.4vw, 54px);
  padding: 0;
  translate: 0 -50%;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 50%;
  background: var(--glass);
  color: var(--on-stage);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  box-shadow: 0 10px 26px rgba(4, 7, 11, 0.36);
  cursor: pointer;
  transition: background-color 0.2s ease, scale 0.2s var(--ease);
}

.screen__nav--prev {
  left: 0;
}

.screen__nav--next {
  right: 0;
}

.screen__nav:hover {
  background: rgba(10, 14, 20, 0.84);
}

.screen__nav:active {
  scale: 0.94;
}

.screen__nav:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.screen__nav svg {
  display: block;
}

/* ===== 页脚 ===== */
/* 三段等分：两侧各占掉同样多的弹性宽度，中间的指示条就严格落在屏幕中线上 */
.screen__foot {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  flex: none;
  align-items: center;
  gap: 16px;
  margin-top: clamp(10px, 1.6vh, 20px);
  padding-top: clamp(10px, 1.4vh, 16px);
  border-top: 1px solid var(--line);
}

.screen__ordinal {
  justify-self: start;
  margin: 0;
  font-family: var(--mono);
  font-size: 12.5px;
  letter-spacing: 0.14em;
  font-variant-numeric: tabular-nums;
  color: var(--on-stage-2);
}

.screen__ordinal b {
  font-weight: 600;
  color: var(--on-stage);
}

/* 指示器：每一段染上对应功能的那块纸色 —— 八段就是八张卡的缩略 */
.meter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.meter > li {
  display: flex;
}

.meter__seg {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: clamp(18px, 2.1vw, 32px);
  height: 4px;
  padding: 0;
  border: 0;
  appearance: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--seg, #fff) 44%, transparent);
  cursor: pointer;
  transition:
    width 340ms var(--ease),
    height 180ms ease,
    background-color 320ms ease,
    box-shadow 300ms ease;
}

/* 条本身只有 4px 高，点击热区靠伪元素撑开（左右各 3px，正好不越过 6px 的缝） */
.meter__seg::before {
  content: '';
  position: absolute;
  inset: -11px -3px;
}

/* 正对镜头的那一段：更长、满色、带一圈柔光 */
.meter__seg.is-front {
  width: clamp(30px, 3.4vw, 50px);
  background: var(--seg, #fff);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.16), 0 0 14px color-mix(in srgb, var(--seg, #fff) 55%, transparent);
}

/* 微交互刻意不跟着卡片放大，改用"变亮 + 变厚"这套语言 */
.meter__seg:hover,
.meter__seg:focus-visible {
  height: 6px;
  background: color-mix(in srgb, var(--seg, #fff) 82%, transparent);
}

.meter__seg.is-front:hover {
  background: var(--seg, #fff);
}

.meter__seg:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.screen__hint {
  justify-self: end;
  margin: 0;
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--on-stage-3);
}

/* ===== 关闭 ===== */
.screen__close {
  position: absolute;
  top: clamp(16px, 2.6vh, 32px);
  right: clamp(18px, 4vw, 64px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px 9px 13px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 999px;
  background: var(--glass);
  color: var(--on-stage);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  font-size: 12.5px;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background-color 0.2s ease, scale 0.2s var(--ease);
}

.screen__close:hover {
  background: rgba(10, 14, 20, 0.84);
}

.screen__close:active {
  scale: 0.96;
}

.screen__close:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

/* 读屏用：换面时把"现在看的是哪一项"播报出去 */
.screen__sr {
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

/* ===== 响应式 =====
 * 断点只调三样：面多大、列怎么分、哪些次要文字退场。
 */
@media (max-width: 1100px) {
  .screen {
    --face-w: clamp(232px, 32vw, 400px);
    --face-h: clamp(310px, 50vh, 470px);
  }

  .screen__headgrid {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}

@media (max-width: 767px) {
  .screen {
    /* 移动端本会话不纳入设计，这里只保证小窗不崩：
       面宽按视口收一档，让左右两张切换钮落在卡片之外 */
    --face-w: min(62vw, 300px);
    --face-h: clamp(280px, 44vh, 372px);
  }

  .screen__inner {
    padding: 14px 16px 12px;
  }

  /* 窄屏改成上下两行：右栏顶到刊题下面，导语不会被挤成一列窄条 */
  .screen__headgrid {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: clamp(6px, 1.2vh, 12px);
  }

  .screen__note {
    align-items: flex-start;
    align-self: auto;
    text-align: left;
    padding-right: 0;
    padding-bottom: 0;
    border-right: 0;
  }

  .screen__title {
    font-size: clamp(28px, 8.4vw, 40px);
  }

  /* 手机上刊语与落款都退场，把高度全留给柱体 */
  .screen__lede,
  .screen__hint {
    display: none;
  }

  .screen__close {
    padding: 10px;
    border-radius: 50%;
  }

  .screen__close-text {
    display: none;
  }

  .screen__nav {
    width: 44px;
    height: 44px;
  }

  .face__desc {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .screen__folio {
    font-size: clamp(104px, 34vw, 200px);
  }
}

/* ===== 入场 =====
 * 只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套挂在 .is-entering 下：撤掉这个类，动画连同上浮一起消失，
 * 元素回落到的静态样式就是动画终态，交接处不跳变。
 * 两个不能碰的地方：柱体的堆叠姿态由 transform 写着 —— 入场只动 rotate / scale
 * 这两个独立属性；舞台那一层才做淡入（prism 上做 opacity 会把 preserve-3d 压平）。
 */
.screen.is-entering .screen__kicker {
  animation: enter-rise var(--enter-dur-kicker) var(--ease) both;
  animation-delay: var(--enter-kicker);
}

.screen.is-entering .screen__title {
  animation: enter-rise var(--enter-dur-title) var(--ease) both;
  animation-delay: var(--enter-title);
}

.screen.is-entering .screen__note {
  animation: enter-rise var(--enter-dur-meta) var(--ease) both;
  animation-delay: var(--enter-meta);
}

.screen.is-entering .screen__mark {
  animation: enter-fade var(--enter-dur-meta) ease both;
  animation-delay: var(--enter-kicker);
}

.screen.is-entering .screen__rule {
  animation: enter-rule var(--enter-dur-title) var(--ease) both;
  animation-delay: var(--enter-meta);
}

.screen.is-entering .screen__close {
  animation: enter-pop var(--enter-dur-close) var(--ease) both;
  animation-delay: var(--enter-close);
}

/* 舞台做淡入（它不是 3D 上下文元素，安全），柱体在它里面摆正 */
.screen.is-entering .screen__stage {
  animation: enter-fade var(--enter-dur-stage) ease both;
  animation-delay: var(--enter-stage);
}

.screen.is-entering .prism {
  animation: enter-prism var(--enter-dur-prism) var(--ease) both;
  animation-delay: var(--enter-prism);
}

.screen.is-entering .screen__nav--prev {
  animation: enter-nav-left var(--enter-dur-nav) var(--ease) both;
  animation-delay: var(--enter-nav);
}

.screen.is-entering .screen__nav--next {
  animation: enter-nav-right var(--enter-dur-nav) var(--ease) both;
  animation-delay: calc(var(--enter-nav) + var(--enter-nav-step));
}

.screen.is-entering .screen__ordinal {
  animation: enter-rise var(--enter-dur-ordinal) var(--ease) both;
  animation-delay: var(--enter-ordinal);
}

.screen.is-entering .meter__seg {
  /* 段本身靠宽度表达"正对镜头"，入场用横向展开，不去动宽度 */
  transform-origin: center;
  animation: enter-piece var(--enter-dur-meter) var(--ease) both;
  animation-delay: calc(var(--enter-meter) + var(--m-i, 0) * var(--enter-meter-step));
}

.screen.is-entering .screen__hint {
  animation: enter-rise var(--enter-dur-hint) var(--ease) both;
  animation-delay: var(--enter-hint);
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
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-pop {
  from {
    opacity: 0;
    transform: scale(0.86);
  }
  to {
    opacity: 1;
    transform: none;
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

@keyframes enter-nav-left {
  from {
    opacity: 0;
    transform: translateX(22px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-nav-right {
  from {
    opacity: 0;
    transform: translateX(-22px) scale(0.88);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-piece {
  from {
    opacity: 0;
    transform: scaleX(0.18);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 整圈从 30° 外摆进来：只动独立属性，transform 里的堆叠姿态原样保留 */
@keyframes enter-prism {
  from {
    rotate: y -30deg;
    scale: 0.9;
  }
  to {
    rotate: y 0deg;
    scale: 1;
  }
}

/* 少动效：.is-entering 压根不会挂上，这里只兜住常驻的那几条过渡 */
@media (prefers-reduced-motion: reduce) {
  .prism,
  .face,
  .face__skin,
  .face__veil,
  .face__signal,
  .screen__nav,
  .screen__close,
  .meter__seg,
  .screen__folio {
    transition: none;
    animation: none;
  }
}
</style>
