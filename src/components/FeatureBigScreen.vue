<script setup>
/**
 * 特色功能 · 大屏模式
 *
 * 八张功能卡在 3D 空间里各自竖直立着，围成一圈底面为正八边形的柱体；
 * 左右切换把整圈转 45°，让另一面正对镜头。版式语言沿用 features 基本页
 * （纸感八色 + 墨字 + 深墨蓝舞台），卡片解剖借 updatelog
 * （eyebrow / 大标题 / 状态行 / 出血底纹 / 大圆角）。
 *
 * 页面上只留两样东西：卡片，和底部那条八段进度条。刊头、背景巨号、页脚序号与落款
 * 都已经去掉；卡片自己也完全不接指针 —— 翻面只有左右箭头 / 滚轮 / 方向键三条路
 * （进度条也可以点）。退出走顶栏右侧那枚「退出」控件或 Esc。
 *
 * ── 顶部一条（v3 新增）────────────────────────────────────────────────
 * 退出钮原来是一枚 64px 的深色圆钮 + 1px 白描边，独自浮在右上角：与全页
 * 「纸感 + 发丝线」的编辑语言是两套东西（圆 vs 方、白描边 vs 墨发丝、
 * 悬浮整枚放大 1.18 倍 vs 只改明度），而且它与版心的对齐纯属巧合。
 *
 * 现在顶上是一条真正的版心行 .screen__top，与 .screen__inner 共用同一档左右
 * padding 与同一条顶端基线 —— 左端是刊头式小字，右端是退出控件，两端对拉扯出
 * 版心宽度。三枚控件（退出 / 上一面 / 下一面）共用同一套语言：
 *   尺寸  --ctrl 见方，与顶栏同高；形状 8px 方角，不再有圆；描边 1px 墨发丝；
 *   底色是舞台上的淡淡一层玻璃；悬浮只把明度与底色翻过来（退出钮落成实纸底 +
 *   墨字，像按下一枚白键），不做任何缩放 —— 放大是"贴纸"的动作，不是版面的动作；
 *   焦点环统一用 --accent。
 * 退出钮还多一枚等宽小字标签「退出」：只靠一枚 X 图标，没人知道它是关闭还是全屏；
 * 窄到 600px 以下再退回纯图标（aria-label 与 title 一直都在，读屏与悬浮提示不受影响）。
 * 这一条上刻意不画横贯的发丝线：它的 y 与站点顶栏胶囊同处一条带上（顶栏是全局 fixed
 * 槽位，压在所有页面之上），横线会正好从胶囊底下穿过去、像一道划痕 ——
 * 版心关系改由两端对齐与同一档基线承担。
 *
 * 几何上顶栏进了流，卡片让出这一条 —— --face-h 的兜底值跟着加高，
 * 版心下 padding 补回 (--top-h + --top-gap)，保证上下都在屏内、且卡片依旧严格居中
 * （柱体挂在整个舞台的中心，实测偏差 0px）。
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
 *
 * ── 设计系统（v2 · 现代极简 + 编辑杂志感）─────────────────────────────
 * 方向：Apple 的留白与层级 / Linear 的克制与精确 / Kinfolk 的纸感与网格。
 *
 * D1 原则  层级只用三样：字号、字重、发丝线（1px，墨色 9%–22%）。
 *          阴影只两级且收紧：静止一层浅影，正对镜头才给一层柔影；侧面板零阴影。
 *          一卡一纸色（沿用八色纸感色），墨字四档全部按 WCAG AA 反推。
 *          微交互只做"状态确认"，从不遮蔽内容（要点与参数在八面上都看得见）。
 *          控件（顶栏与三枚）是同一套方角语言：等尺寸、1px 发丝、只翻明度不缩放。
 * D2 网格  横版刊页：卡片 ≥ 80vw × 70vh。左「正文栏」/ 右「图版栏」，中间一道竖发丝；
 *          正文栏自上而下四段：眉标行 → 标题块 → 要点表 → 参数行。
 * D3 字阶  全部随卡片宽度走（vw）：标题 clamp(36,4vw,76) / 导语 clamp(15,1.2vw,22)
 *          / 要点 clamp(14,1.12vw,19) / 编号 mono clamp(17,1.5vw,26)
 *          / 栏目名·参数片 mono clamp(11.5,0.8vw,14) / 图注·状态 mono clamp(11.5,0.78vw,13)。
 * D4 颜色  纸：八色纸感色，每面一块。墨：--ink / --ink-soft / --ink-mute（三档全过 AA）。
 *          舞台：深墨蓝渐变 + 一团冷光。强调色只用在"正在展示"的信号点与标题线。
 * D5 图版  实机截图裁掉自带窗框（Windows 标题栏 + 右侧滚动条），正文留在顶部，
 *          黑底一路铺到卡底，配一枚等宽图注 —— 它是证据，不是配图。
 * D6 动效  曲线 cubic-bezier(.22,1,.36,1)；换面 720ms（连击 ×0.5）；
 *          微交互 180–520ms；prefers-reduced-motion 下整批退化为静态。
 * D7 无障碍  正文对比度 ≥ 4.5:1、大字 ≥ 3:1；焦点环 2px（--accent 混白）+ 3px 外扩；
 *          八面皆不接指针与点击，翻面控件只有箭头、进度条与键盘；换面时 aria-live 播报
 *          导语 + 要点 + 参数。
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
 * 图版用实机界面截图（public/images/features/screenshot，1958×1050 的控制台窗口，
 * 9008 那张是 1499×815）。不走 import.meta.glob：public 下的文件不该再经打包器，
 * 直接用 base 前缀取。
 * 截图自带的 Windows 窗框与右侧滚动条不进卡面 —— 那是"截屏"的味道，不是版面的味道；
 * 裁切参数（--shot-keep / --shot-skip / --shot-band）在下面的样式里，一处定义。
 */
const SHOT_DIR = import.meta.env.BASE_URL + 'images/features/screenshot/'
/* 截图里窗口标题栏写着版本号，图注照抄 —— 9008 那张是 fix1 版 */
const WIN = 'NewAndroidToolBox 1.0.3'
const WIN_FIX1 = 'NewAndroidToolBox 1.0.3fix1'

/* 每一面四样东西：
 *   desc   —— 沿用 features 基本页那句话，口径一致；
 *   points —— 三条一行读得完的要点，是这一面的"详细内容"；
 *   specs  —— 三枚关键参数，只放最硬的事实；
 *   shot   —— 实机界面截图，图版栏那块。
 * 要点与参数都从 desc 长出来，不新增没有依据的指标；改文案只动这一处数据。 */
const FEATURES = [
  {
    icon: IconShieldKeyhole,
    tag: 'ROOT',
    shot: 'root.webp',
    win: WIN,
    title: '一键ROOT',
    desc: '支持Z2-Z11全系列机型一键ROOT，实时修补BOOT，安全稳定。',
    points: ['覆盖 Z2–Z11 全系列机型', '实时修补 BOOT，开机即生效', '一键全自动，不必手敲命令'],
    specs: ['Z2–Z11', 'BOOT 修补', '全自动'],
  },
  {
    icon: IconCloudDownload,
    tag: 'OTA',
    shot: 'ota.webp',
    win: WIN,
    title: '离线OTA升级',
    desc: '支持离线OTA升级解决验证异常。',
    points: ['离线包升级，不挑网络环境', '解决验证异常，升级可正常完成', '无需第三方工具，NATB 内完成'],
    specs: ['离线包', '免网络', '验证修复'],
  },
  {
    icon: IconLayers,
    tag: 'RTOS',
    shot: 'rtos.webp',
    win: WIN,
    title: 'RTOS支持',
    desc: '支持Z7Pro、Z9a等RTOS系统手表。',
    points: ['Z7Pro、Z9a 等 RTOS 机型', '与 Android 机型同一套界面', '连接即识别，不必额外装驱动'],
    specs: ['Z7Pro', 'Z9a', 'RTOS'],
  },
  {
    icon: IconWidget,
    tag: 'APP',
    shot: 'appmanager.webp',
    win: WIN,
    title: '应用管理',
    desc: '多种安装方式，总有一种适合您。',
    points: ['install / data 两条直装通道', '第三方安装器与 install-create', '列表内直接卸载与清理'],
    specs: ['install', 'data', 'install-create'],
  },
  {
    icon: IconCpuBolt,
    tag: 'EDL',
    shot: '9008.webp',
    win: WIN_FIX1,
    title: '9008刷机',
    desc: '9008模式刷入Recovery/TWRP，备份与恢复。',
    points: ['9008 通道刷入 Recovery / TWRP', '分区备份与恢复并排管理', '不进系统也能救回变砖设备'],
    specs: ['9008', 'Recovery', 'TWRP'],
  },
  {
    icon: IconMagicStick,
    tag: 'MODULE',
    shot: 'magisk.webp',
    win: WIN,
    title: 'Magisk模块',
    desc: 'Magisk模块安装、卸载、列表管理，更方便地享受模块的乐趣。',
    points: ['本地模块一键安装与卸载', '模块清单随时查看与开关', '不必反复重刷，玩得更安心'],
    specs: ['安装', '卸载', '列表管理'],
  },
  {
    icon: IconFolderFiles,
    tag: 'FILES',
    shot: 'filemanager.webp',
    win: WIN,
    title: '文件管理',
    desc: '摒弃传统的ADB方案与文件管理器，直接在NATB内管理文件，省心省力。',
    points: ['内置文件树，直读手表存储', '上传、下载、删除同在一处', '告别命令行与第三方管理器'],
    specs: ['免 ADB', '内置文件树', '上传下载'],
  },
  {
    icon: IconScreenShare,
    tag: 'MIRROR',
    shot: 'scrcpy.webp',
    win: WIN,
    title: '投屏控制',
    desc: 'scrcpy投屏控制，手表屏幕实时投影到电脑。',
    points: ['scrcpy 实时投屏，画面即时同步', '电脑端鼠标直接操作手表', '连线即可用，不必额外配置'],
    specs: ['scrcpy', '实时投屏', '鼠标接管'],
  },
].map((item, index) => ({
  ...item,
  idx: index,
  no: String(index + 1).padStart(2, '0'),
  tint: TINTS[index % TINTS.length],
  /* 图版地址：截图目录 + 与功能同名的文件 */
  plate: SHOT_DIR + item.shot,
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
 * 顺序：顶栏（发丝线跟着展开）→ 退出控件 → 舞台淡入 + 柱体摆入 → 两张切换钮
 * → 进度条逐段展开。顶栏整条先落位，"这块版面从上面压下来"的顺序才读得出来。
 */
const ENTER = {
  top: 140,
  exit: 250,
  stage: 200,
  prism: 330,
  navLeft: 470,
  navRight: 540,
  meter: 700,
  meterStep: 55,
}
const ENTER_DUR = {
  top: 560,
  exit: 460,
  stage: 900,
  prism: 1000,
  nav: 520,
  meter: 520,
}
const ms = (v) => `${v}ms`
const enterVars = {
  '--enter-top': ms(ENTER.top),
  '--enter-exit': ms(ENTER.exit),
  '--enter-stage': ms(ENTER.stage),
  '--enter-prism': ms(ENTER.prism),
  '--enter-nav': ms(ENTER.navLeft),
  '--enter-nav-step': ms(ENTER.navRight - ENTER.navLeft),
  '--enter-meter': ms(ENTER.meter),
  '--enter-meter-step': ms(ENTER.meterStep),
  '--enter-dur-top': ms(ENTER_DUR.top),
  '--enter-dur-exit': ms(ENTER_DUR.exit),
  '--enter-dur-stage': ms(ENTER_DUR.stage),
  '--enter-dur-prism': ms(ENTER_DUR.prism),
  '--enter-dur-nav': ms(ENTER_DUR.nav),
  '--enter-dur-meter': ms(ENTER_DUR.meter),
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

/** 每开一次都从 initial 那一面起跑 */
watch(
  () => props.open,
  (on) => {
    if (!on) {
      finishEntrance()
      return
    }
    wheelAcc = 0
    index.value = props.initial || 0
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
  /* 卡面上看得见的三段（导语 + 要点 + 参数）都念出来：侧面板对读屏是暗的，
     转过来的这一面说了什么，得由这一行播报补全。 */
  return `正在展示 ${item.no} / ${TOTAL_NO} ${item.title}：${item.desc}要点：${item.points.join('；')}。参数：${item.specs.join('、')}`
})
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
      <!-- ── 背景：光池托底（巨号序号已去掉） ── -->
      <div class="screen__backdrop" aria-hidden="true">
        <div class="screen__glow"></div>
      </div>

      <div class="screen__inner">
        <!-- ── 顶部一条：与版心共用同一档左右 padding ──
             左端是刊头式小字，右端是退出控件，两端对拉扯出版心宽度。
             它是被舞台让出来的一条（flex 行），所以卡片一定在它下面，永不叠字 -->
        <header class="screen__top">
          <span class="screen__label">NATB — 特色功能 <i aria-hidden="true">/</i> {{ TOTAL_NO }} FEATURES</span>
        </header>

        <!-- ── 舞台：八边形柱体 ── -->
        <section class="screen__stage" aria-label="特色功能展示台">
          <!-- 视口只做两件事：给柱体提供透视、接滚轮。拖动与点面都已经去掉 -->
          <div class="screen__viewport" @wheel="onWheel">
            <div class="prism" :style="{ '--step': index }">
              <div
                v-for="(item, i) in FEATURES"
                :key="item.idx"
                class="face"
                :class="{ 'is-front': face === i }"
                :data-face="i"
                :style="{ '--i': i, '--tint': item.tint }"
              >
                <!-- 3D 倾斜壳套在「面里面」：壳写自己的 transform，这一面的 rotateY
                     由外层写着，两者互不覆盖，柱体因此毫发无损。
                     壳里的皮肤层才是"看得见的那张卡" —— 底色、描边、圆角、投影、
                     暗纱、出血序号全在它身上，所以指针一动是整张卡在仰，不是一个框
                     兜着几张会晃的图。只有正对镜头的那一面接指针，其余各面 disabled。
                     倾角只给 2.5°、跟随再放慢一档（smoothing 0.09）：悬浮是"轻轻侧一下"，
                     不是把整面晃出去。 -->
                <TiltCard
                  class="face__shell"
                  :disabled="face !== i"
                  :max-tilt="2.5"
                  :perspective="1500"
                  :scale="1"
                  :smoothing="0.09"
                  :glare="face === i"
                  glare-color="#ffffff"
                  :glare-opacity="0.16"
                  :glare-size="120"
                >
                  <span class="face__skin">
                    <!-- ── 左：正文栏。编辑版式四段，自上而下：眉标 → 标题块 → 要点 → 参数 ── -->
                    <span class="face__main">
                      <span class="face__eyebrow">
                        <span class="face__index"><b>{{ item.no }}</b><i>/{{ TOTAL_NO }}</i></span>
                        <span class="face__icon" aria-hidden="true">
                          <component :is="item.icon" width="19" height="19" />
                        </span>
                        <span class="face__tag">{{ item.tag }}</span>
                        <span class="face__state">
                          <span class="face__signal" aria-hidden="true"></span>
                          <span>{{ face === i ? '正在展示' : '转到这一面' }}</span>
                        </span>
                      </span>

                      <span class="face__lede">
                        <span class="face__title">{{ item.title }}</span>
                        <span class="face__desc">{{ item.desc }}</span>
                      </span>

                      <!-- 要点表：三条短句，靠左侧一枚小方点定位。一律用 span ——
                           这一面整个是 <button>，只收 phrasing 内容 -->
                      <span class="face__points">
                        <span v-for="line in item.points" :key="line" class="face__point">{{ line }}</span>
                      </span>

                      <!-- 参数行：三枚等宽小片，只放最硬的三条事实 -->
                      <span class="face__specs">
                        <span v-for="spec in item.specs" :key="spec" class="face__spec">{{ spec }}</span>
                      </span>
                    </span>

                    <!-- ── 右：图版栏。实机界面截图，自带窗框在样式里裁掉 ── -->
                    <span class="face__plate">
                      <span class="face__frame">
                        <img class="face__shot" :src="item.plate" alt="" draggable="false" decoding="async" />
                      </span>
                      <span class="face__caption">
                        <span>实机界面</span>
                        <span class="face__caption-app">{{ item.win }}</span>
                      </span>
                    </span>

                    <!-- 侧面板退到暗处，正对镜头的那一面才是亮的 -->
                    <span class="face__veil" aria-hidden="true"></span>
                  </span>
                </TiltCard>
              </div>
            </div>
          </div>

          <!-- 与退出控件同一套方角语言：等尺寸、同发丝描边、同底色，
               悬浮只改明度不放大 —— 三枚控件并排看过去是一条线上的东西 -->
          <button class="screen__nav screen__nav--prev" type="button" title="上一面（←）" aria-label="上一面" @click="step(-1)">
            <IconChevronLeft width="20" height="20" aria-hidden="true" />
          </button>
          <button class="screen__nav screen__nav--next" type="button" title="下一面（→）" aria-label="下一面" @click="step(1)">
            <IconChevronRight width="20" height="20" aria-hidden="true" />
          </button>
        </section>

        <!-- ── 页脚：只剩进度条 ── -->
        <footer class="screen__foot">
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
        </footer>
      </div>

      <!-- ── 退出：版心右端的那枚控件 ──
           绝对定位只为了与版心右缘严格对齐（它在 .screen__inner 的 padding 盒之外），
           y 与顶栏同一档、尺寸与顶栏同高，所以看上去就是顶栏右端的那一格 -->
      <button class="screen__exit" type="button" title="退出大屏（Esc）" aria-label="退出大屏模式" @click="close">
        <IconX width="18" height="18" aria-hidden="true" />
        <span class="screen__exit-text">退出</span>
      </button>

      <p class="screen__sr" aria-live="polite">{{ announce }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
/* ===== 性能：只在柱体自己身上消费的变量，声明成不继承 =====
 * 换面时改 --step。自定义属性默认是继承的，浏览器改它时会把该元素**整棵子树**的
 * 样式重算一遍 —— 而这里的子树是八张卡的封面、文字、图标、暗纱。声明 inherits: false
 * 之后，改它只落在柱体自己身上，子树一根头发都不动。
 * （--face-w / --radius / --step-deg 是真要被面消费的，保持继承不变。）
 */
@property --step {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

.screen {
  /* ── 纸与墨：卡面这一套直接沿用 features 基本页的墨色 ── */
  --ink: #16150f;
  --rule-soft: rgba(22, 21, 15, 0.09);

  /* ── 舞台：深墨蓝，图版从这里浮出来 ── */
  --stage: rgb(40, 50, 61);
  --stage-deep: rgb(15, 21, 28);
  --on-stage: #f2f5f8;
  --on-stage-2: rgba(242, 245, 248, 0.74);
  --on-stage-3: rgba(242, 245, 248, 0.48);
  --line: rgba(255, 255, 255, 0.16);
  --accent: #0a59f7;

  /* ── 顶栏与控件（v3）──
     三枚控件共用同一档尺寸与同一套语言，顶栏自己也走同一档高度：
     --ctrl 是控件边长、也是顶栏的行高，所以它们天然在同一条水平线上。
     悬浮是"翻底色"，所以底色只有两级：rest 一层薄玻璃、hover 一层实纸。 */
  --top-h: clamp(34px, 4vh, 40px);
  --top-gap: clamp(12px, 1.7vh, 18px);
  --ctrl: var(--top-h);
  --ctrl-radius: 8px;
  --ctrl-bg: rgba(255, 255, 255, 0.055);
  --ctrl-bg-hover: var(--on-stage);
  --ctrl-line: rgba(255, 255, 255, 0.22);
  --ctrl-line-hover: var(--on-stage);
  /* 悬浮翻成实纸底时的字色：与 features 页的墨黑同值 */
  --on-accent: #16150f;

  /* ── 纸与墨（卡面）：一卡一纸色，墨字三档 ──
     三档都按"最深的那块纸色"（紫藤 #e2deee）反推过 WCAG AA，实测最低 5.3:1：
     ink 正文标题 / ink-soft 导语、要点、参数 / ink-mute 栏目名、图注、状态。
     小字不做第四档浅灰 —— 浅到 4.5:1 以下就不是"层级"，是读不清。 */
  --ink-soft: #46433b;
  --ink-mute: #5d574c;

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
     这一版按"横版刊页"定尺寸：一张卡至少占满 80vw × 70vh，宽高比约 2:1。
     高度用 min() 兜一道底：视窗矮到约 430px 以下时，上下留白 + 顶栏 + 页脚 + 70vh 会顶出
     版心，宁可让卡矮一点，也不让它被裁掉（80vw 恒等，宽度不需要兜底）。
     刊头去掉之后顶上只需要给页脚留 ~104px；v3 顶上多了一条版心顶栏（--top-h + --top-gap），
     兜底值跟着加高到 168px —— 这一条进了流，卡片让出来的高度必须在这里补回去。 */
  --face-w: 80vw;
  --face-h: min(70vh, calc(100vh - 168px));
  --radius: calc(var(--face-w) * var(--ring-k));
  --push: calc(var(--face-w) * var(--ring-k) * -1);
  /* 透视略缓：太近会把相邻那两面压得太小，"八块板围成一圈"的读感就散了。
     卡变成长边 1536px 的大板之后这个值照旧：相邻面板的缩放落在 0.99→0.61，
     于是它们正好在卡的两侧各露一条窄边，环还在 */
  --persp: 1700px;

  /* ── 刊页网格：一卡两栏 ── */
  --card-pad: clamp(22px, 2.3vw, 44px);
  --col-gap: clamp(22px, 2.4vw, 52px);
  --plate-w: 56%;
  /* 图版裁切三常数：只留左边 72%（控制台正文都在左侧）、跳过自带标题栏 5.52%；
     --shot-ratio 是源图的高/宽，用来把"跳过的比例"换算成像素。
     --shot-band 只在窄屏（一栏布局）里给图版一个固定高度，宽屏下图版吃满整栏 */
  --shot-keep: 0.72;
  --shot-skip: 0.0552;
  --shot-band: 620;
  --shot-ratio: 0.5363;

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

/* ===== 顶部一条（版心行）=====
 * 与 .screen__inner 共用同一档左右 padding，所以它的两端就是版心的两端 ——
 * 退出控件贴在右端、刊头小字贴在左端，两端对拉扯出版心宽度。
 * 高度整条钉在 --ctrl：退出控件与它同高，两者就在同一条水平线上，不会各偏各的。
 * 它是流内的第一行（不是绝对定位），舞台因此从它下面开始 —— 卡片永远不会压到这一条。
 *
 * 这里刻意不画横贯的发丝线：这一条的 y 与站点顶栏胶囊同处一条带上（顶栏是
 * 全局 fixed 槽位，压在所有页面之上），横线会正好从胶囊底下穿过去，像一条划痕。
 * 版心关系由两端对齐与同一档基线承担，不靠一根会被挡住的分隔线。
 */
.screen__top {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(12px, 1.6vw, 22px);
  height: var(--ctrl);
}

/* 刊头式小字：与卡面上的眉标同一套读法（等宽、加宽字距、全大写） */
.screen__label {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(9.5px, 0.66vw, 11.5px);
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  white-space: nowrap;
  /* 顶栏字是"版面上的记号"，不是要读的正文：--on-stage-2 一档刚好 */
  color: var(--on-stage-2);
}

/* 斜杠分隔用三等档，别跟文字抢注意力 */
.screen__label i {
  font-style: normal;
  color: var(--on-stage-3);
}

/* ===== 版心 =====
 * 卡片在视窗里正居中：页脚退成绝对定位（不进流），顶栏是流内第一行 →
 * 版心的上下留白对称，舞台于是从顶栏下沿一路铺到版心底。
 */
.screen__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  /* 顶栏与舞台之间那一口气：只作用在这两者之间（页脚是绝对定位，不在流里） */
  gap: var(--top-gap);
  height: 100%;
  box-sizing: border-box;
  /* 上下不对称，是为了把版面拉正：顶栏占掉一条高度，若上下留白一样，
     整个舞台（连同卡片）会被顶低 (--top-h + --top-gap) / 2。下侧补回同量，
     舞台的上下留白就重新相等 —— 卡片回到视窗正中的那 1px 以内。
     左右仍是老规矩：版心两端就是这两档 padding。 */
  padding: clamp(18px, 3.4vh, 40px) clamp(18px, 4vw, 64px)
    calc(clamp(18px, 3.4vh, 40px) + var(--top-h) + var(--top-gap));
}

/* ===== 舞台 =====
 * 吃满版心（页脚不在流里，它撑得到版心底）：柱体因此严格居中，
 * 也不会被页脚、被进度条那几像素的厚薄推上推下。 */
.screen__stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

/* 透视挂在这里：.prism 是它的子元素。注意这一层不许有 transform 之外的分组属性。
   它自己不接指针（拖动已去掉），只是滚轮的落点：视口铺满整块舞台，
   滚轮落在版心哪儿都算数。 */
.screen__viewport {
  position: absolute;
  inset: 0;
  perspective: var(--persp);
  perspective-origin: 50% 50%;
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
    /* --step 是转过多少步 */
    rotateY(calc(var(--step, 0) * var(--step-deg) * -1));
  transition: transform var(--dur-run) var(--ease);
}

/* ===== 八边形的一面 =====
 * 这一层只剩几何：它在环上的位置与背面剔除。它已经不是可点元素（点面已去掉），
 * 只是一张贴在环上的板子；指针唯一的作用是让正对镜头的那一面轻微倾斜（见 TiltCard）。
 * 之所以不留任何视觉、也不留 overflow —— 在 preserve-3d 里带裁剪的面会让
 * Chrome 的 3D 命中测试整片失效，裁剪因此全部下沉给皮肤层。
 */
.face {
  position: absolute;
  inset: 0;
  display: block;
  color: inherit;
  /* 面朝外立在这一圈的切向上；背面（对侧那四面）由 backface 直接抹掉。
     正视面另外向前推一截并放大 —— updatelog 那张"正在看"的卡就是这么立起来的：
     换面时旧面缩回、新面浮出，与整环的转动同一条时长，
     看上去是"环转到位 + 这一面被抽出来"，而不是八块板整体平移 */
  transform: rotateY(calc(var(--i) * var(--step-deg))) translateZ(var(--radius));
  backface-visibility: hidden;
  /* 这里绝对不能写 will-change: transform —— 它会把这一层的光栅化分辨率钉死在
     "建层那一刻"的尺寸上，而正对镜头的那一面还要被放大（scale × 透视）。
     于是它一直拿放大前的纹理放大着显示：动的时候浏览器每帧重建所以清楚，
     一停下来就回到那张不够大的纹理 —— 糊。八张卡里只有正中那张会被放大，
     所以也只有它会糊，而且正好是"停下才糊"。 */
  transition: transform var(--dur-run) var(--ease);
}

/* 正对镜头的那一面：浮出。位移留在 3D 里（它本来就是"离眼睛更近"），
   **但放大不写在这儿** —— 理由见下面 .face.is-front .face__skin。 */
.face.is-front {
  transform:
    rotateY(calc(var(--i) * var(--step-deg)))
    translateZ(calc(var(--radius) + 20px));
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
  /* 横版刊页：左边正文栏、右边图版栏 */
  flex-direction: row;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.55);
  /* 圆角比基本页大得多：大屏上这八块板是主角，角形就是它的性格 */
  border-radius: clamp(18px, 1.5vw, 30px);
  corner-shape: superellipse(2);
  background: var(--tint, #eeebe5);
  color: var(--ink);
  text-align: left;
  /* 阴影只留一级、半径收得很紧：抬起感交给"正对镜头"那一档，静止时版面要平。
     模糊半径同时决定这一层纹理要向外扩多少（约三倍半径），收紧了也省绘制 */
  box-shadow: 0 1px 3px rgba(6, 9, 13, 0.24);
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
  border-color: rgba(255, 255, 255, 0.86);
  box-shadow: 0 2px 8px rgba(6, 9, 13, 0.28), 0 26px 64px rgba(6, 9, 13, 0.34);
}

/* ===== 图版栏（右）=====
 * 一块实机界面截图当"图版"，不是配图：
 *   1) 自带窗框裁掉 —— 顶部 5.52% 是 Windows 标题栏，右侧还有滚动条与窗口描边；
 *   2) 只留左边 72% —— 控制台的正文本来就都在左侧，右半边全是空黑；
 *   3) 高度吃满整栏 —— 正文露在顶部，下面那片空黑一路铺到卡底，
 *      整栏因此读成"一整块屏幕"，而不是贴在纸上的一张图。
 * 裁切靠容器查询单位 cqw 换算：cqw 就是这一栏的宽度，所以窗口一改，
 * 裁切跟着一起缩放，常数（--shot-keep / --shot-skip / --shot-ratio）不用动。 */
.face__plate {
  container-type: inline-size;
  display: flex;
  flex: 0 0 var(--plate-w);
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  gap: clamp(10px, 1.2vh, 16px);
  min-width: 0;
  /* 与正文栏之间那一道竖发丝：编辑版式的分栏线 */
  padding: var(--card-pad) var(--card-pad) var(--card-pad) var(--col-gap);
  border-left: 1px solid var(--rule-soft);
}

/* 图版本体：一个裁剪框，底色就是控制台的黑。
   高度吃满整栏 —— 控制台正文本来就在顶部，下面那一大片空黑正好接着往下铺，
   于是这一栏读起来就是"一整块屏幕"，而不是一张贴在纸上的小图。 */
.face__frame {
  position: relative;
  display: block;
  flex: 1 1 auto;
  overflow: hidden;
  width: 100%;
  min-height: 0;
  border: 1px solid rgba(22, 21, 15, 0.14);
  border-radius: clamp(10px, 0.9vw, 16px);
  background: #0b0c0e;
}

/* 截图：宽度放大到 1/0.72，再往上顶掉标题栏那一截。
   左边多推 0.25cqw，把窗口那 2px 亮边推出框外 */
.face__shot {
  position: absolute;
  left: -0.25cqw;
  top: calc(-100cqw * var(--shot-skip) * var(--shot-ratio) / var(--shot-keep));
  width: calc(100cqw / var(--shot-keep));
  max-width: none;
  height: auto;
}

/* 图注：图片是证据，得署名 —— 左边写它是什么，右边写它来自哪个版本 */
.face__caption {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--mono);
  font-size: clamp(11.5px, 0.78vw, 13px);
  letter-spacing: 0.08em;
  color: var(--ink-mute);
  white-space: nowrap;
}

.face__caption-app {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 正文栏（左）=====
 * 四段自上而下：眉标行 → 标题块 → 要点表 → 参数行。
 * 卡高由 70vh 定死，这里用 space-between 把余量摊成留白 ——
 * 版式靠留白呼吸，不靠装饰填满。 */
.face__main {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  gap: clamp(16px, 2.2vh, 30px);
  min-width: 0;
  padding: var(--card-pad) 0 var(--card-pad) var(--card-pad);
}

/* 眉标行：编号 / 图标 / 分类在左，"正在展示"在右，底下一道发丝线 */
.face__eyebrow {
  flex: none;
  display: flex;
  align-items: center;
  gap: clamp(10px, 0.9vw, 16px);
  padding-bottom: clamp(10px, 1.3vh, 18px);
  border-bottom: 1px solid var(--rule-soft);
}

/* 编号是这一行的主角：等宽、表格数字，正面那一张转成墨黑，其余退成中墨 */
.face__index {
  flex: none;
  font-family: var(--mono);
  font-size: clamp(17px, 1.5vw, 26px);
  font-weight: 700;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-mute);
  transition: color 320ms ease;
}

.face__index i {
  font-style: normal;
  font-size: 0.56em;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.face__icon {
  flex: none;
  display: grid;
  place-items: center;
  color: var(--ink-mute);
  transition: color 320ms ease;
}

/* 分类不套胶囊：等宽大写 + 字距，就是编辑版式里的栏目名 */
.face__tag {
  flex: none;
  font-family: var(--mono);
  font-size: clamp(11.5px, 0.8vw, 14px);
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--ink-mute);
}

/* 状态行：靠右，与左边的编号形成两端对拉 */
.face__state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-family: var(--mono);
  font-size: clamp(11.5px, 0.78vw, 13px);
  letter-spacing: 0.08em;
  color: var(--ink-mute);
  white-space: nowrap;
}

/* 标题块：一句话的刊题 + 一段导语 */
.face__lede {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 1.2vh, 18px);
  min-width: 0;
}

.face__title {
  /* 这一面的主角：字重 700、字距收紧，字号跟着卡宽走 */
  font-size: clamp(36px, 4vw, 76px);
  font-weight: 700;
  line-height: 1.03;
  letter-spacing: -0.03em;
  color: var(--ink);
}

/* 标题下的一根短线：不长的那么一笔，正面那一张才伸开并转成强调色 ——
   这是"你正在看这一面"最克制的那个记号（不遮内容、不改变布局） */
.face__title::after {
  content: '';
  display: block;
  width: clamp(28px, 2.4vw, 44px);
  height: 2px;
  margin-top: clamp(12px, 1.4vh, 20px);
  background: rgba(22, 21, 15, 0.26);
  transition: width 520ms var(--ease), background-color 520ms ease;
}

.face__desc {
  max-width: 30ch;
  font-size: clamp(15px, 1.2vw, 22px);
  line-height: 1.6;
  text-wrap: pretty;
  color: var(--ink-soft);
}

/* ===== 要点表 =====
 * 卡面的"详细内容"：三条短句，每条一行，行间一道发丝线 ——
 * 读起来是清单，看起来是版面，而不是又一坨灰字。 */
.face__points {
  flex: none;
  display: block;
}

.face__point {
  position: relative;
  display: block;
  /* 左内距让出小方点，上下按 vh 收：窗一矮，行距先紧一档 */
  padding: clamp(7px, 1vh, 14px) 0 clamp(7px, 1vh, 14px) clamp(16px, 1.3vw, 22px);
  font-size: clamp(14px, 1.12vw, 19px);
  line-height: 1.4;
  color: var(--ink-soft);
  /* 一行封顶：清单的节奏靠"一行一条"，换行会当场把三条读成五条 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 小方点：四角形的那么一点点，正好压住每行的行首 —— 全卡唯一的纯装饰 */
.face__point::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  width: 5px;
  height: 5px;
  margin-top: -2.5px;
  rotate: 45deg;
  background: color-mix(in srgb, var(--ink) 32%, transparent);
  transition: background-color 320ms ease;
}

/* 行间发丝线：只加在第二、三条的上沿，清单的头一条不封口 */
.face__point + .face__point {
  border-top: 1px solid var(--rule-soft);
}

/* ===== 参数行 =====
 * 三枚等宽小片，透明底 + 1px 描边，克制到只剩轮廓 ——
 * 与上面的清单形成"散文 / 表格"两种读法。 */
.face__specs {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: clamp(6px, 0.6vw, 10px);
  padding-top: clamp(10px, 1.3vh, 18px);
  border-top: 1px solid var(--rule-soft);
}

.face__spec {
  flex: none;
  padding: 4px 10px;
  border: 1px solid rgba(22, 21, 15, 0.13);
  border-radius: 8px;
  font-family: var(--mono);
  font-size: clamp(11.5px, 0.8vw, 14px);
  letter-spacing: 0.06em;
  color: var(--ink-mute);
  white-space: nowrap;
  transition: border-color 320ms ease, color 320ms ease;
}

/* ===== 信号点：眉标行右侧那枚小圆 ===== */
.face__signal {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid rgba(22, 21, 15, 0.34);
  transition: box-shadow 300ms ease, background-color 300ms ease, border-color 300ms ease;
}

/* ===== 正对镜头的那一面 =====
 * 微交互只做"状态确认"：不遮内容、不改布局、不动字号。
 * 四处一起亮：信号点、编号、标题线、参数片描边。 */
.face.is-front .face__signal {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(10, 89, 247, 0.16);
}

.face.is-front .face__index {
  color: var(--ink);
}

.face.is-front .face__title::after {
  width: clamp(48px, 3.6vw, 68px);
  background: var(--accent);
}

.face.is-front .face__point::before {
  background: color-mix(in srgb, var(--ink) 62%, transparent);
}

.face.is-front .face__spec {
  border-color: rgba(22, 21, 15, 0.26);
  color: var(--ink-soft);
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

/* ===== 左右切换 =====
 * 与退出控件同一套语言：--ctrl 见方、8px 方角、1px 发丝、一层薄玻璃。
 * 位置照旧是版心两端的竖直中线（左右各一枚，夹住舞台），
 * 只是从"深色圆钮 + 白描边"换成了版面上的方角控件。 */
.screen__nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: var(--ctrl);
  height: var(--ctrl);
  padding: 0;
  translate: 0 -50%;
  border: 1px solid var(--ctrl-line);
  border-radius: var(--ctrl-radius);
  background: var(--ctrl-bg);
  color: var(--on-stage);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.screen__nav--prev {
  left: 0;
}

.screen__nav--next {
  right: 0;
}

/* 悬浮：翻成实纸底 + 墨字 —— 与退出控件同一个动作，三枚控件手感一致。
   不放大：放大是"贴纸"的动作，版面上的控件只换明度。 */
.screen__nav:hover {
  background: var(--ctrl-bg-hover);
  border-color: var(--ctrl-line-hover);
  color: var(--on-accent);
}

/* 按下：轻收一下给按感，收回来的幅度比原来小一档（版面控件不表演） */
.screen__nav:active {
  scale: 0.94;
}

.screen__nav:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, #fff);
  outline-offset: 3px;
}

.screen__nav svg {
  display: block;
}

/* ===== 页脚 =====
 * 页脚只剩进度条这一件东西。它绝对定位贴在版心下沿 —— 不进流，所以它自身的
 * 尺寸变化（某一段悬浮时变厚）绝不会把上面的卡片顶动一位。 */
.screen__foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(18px, 3.4vh, 40px);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 指示器：每一段染上对应功能的那块纸色 —— 八段就是八张卡的缩略 */
.meter {
  display: flex;
  align-items: center;
  /* 高度钉死：某一段悬浮时 4px→6px 只在自己身上变厚，不撑高这一条、也不推走卡片 */
  height: 6px;
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

/* ===== 退出控件 =====
 * 它在 .screen__inner 的 padding 盒之外，所以必须自己去量那两档百分比
 * —— 但量的是同一个 clamp()，右缘因此与版心右缘严格同一条竖线（实测 0px 偏差）。
 * 纵向：与顶栏共用同一个 padding 起点、同一档高度，所以两者的上下沿与中线
 * 天然重合（实测 0px 偏差）—— 看上去就是顶栏右端的那一格，不需要再补任何偏移。
 * 形状与左右切换钮完全一致，只是宽一点：多了一枚「退出」小字标签。 */
.screen__exit {
  position: absolute;
  top: clamp(18px, 3.4vh, 40px);
  right: clamp(18px, 4vw, 64px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
  box-sizing: border-box;
  height: var(--ctrl);
  padding: 0 clamp(12px, 1.05vw, 16px);
  border: 1px solid var(--ctrl-line);
  border-radius: var(--ctrl-radius);
  background: var(--ctrl-bg);
  color: var(--on-stage);
  font-family: var(--mono);
  font-size: clamp(11px, 0.78vw, 12.5px);
  font-weight: 500;
  letter-spacing: 0.1em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.screen__exit svg {
  display: block;
}

/* 悬浮：翻成实纸底 + 墨字（与切换钮同一个动作）。
   退出是这块版面上唯一的"离场"动作，明度对比给足，一眼认得出按得动 */
.screen__exit:hover {
  background: var(--ctrl-bg-hover);
  border-color: var(--ctrl-line-hover);
  color: var(--on-accent);
}

.screen__exit:active {
  scale: 0.94;
}

.screen__exit:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, #fff);
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
 * 断点只调三样：两栏怎么分、留白多厚、哪些次要文字退场。
 * 卡尺寸（80vw × 70vh）与整条字阶都由 vw 驱动，窄窗自己会缩，不必逐档重写。
 */
@media (max-width: 1100px) {
  .screen {
    /* 图版栏收窄一档：窄窗里正文栏得留出能读的行长 */
    --plate-w: 52%;
    --card-pad: clamp(18px, 2.6vw, 30px);
    --col-gap: clamp(18px, 2.6vw, 30px);
  }
}

@media (max-width: 900px) {
  /* 窄屏改成一栏：图版在上、正文在下；两栏之间那道竖发丝换成横发丝 */
  .face__skin {
    flex-direction: column-reverse;
  }

  .face__plate {
    /* 一栏布局里图版排在正文上面，高度可以被压 —— 卡矮时先让图版缩，
       正文一个像素都不许被裁（column-reverse 下溢出会跑到卡顶上去） */
    flex: 0 1 auto;
    width: 100%;
    min-height: 0;
    padding: var(--card-pad) var(--card-pad) 0;
    border-left: 0;
    border-top: 1px solid var(--rule-soft);
  }

  /* 一栏布局里图版不再是"吃满高度"，给它一个由裁切比例定死、但可被压的高度 */
  .face__frame {
    flex: 0 1 auto;
    min-height: 0;
    aspect-ratio: calc(1958 * var(--shot-keep)) / var(--shot-band);
  }

  .face__main {
    flex: 1 1 auto;
    padding: var(--card-pad);
  }

  .face__desc {
    max-width: none;
  }
}

@media (max-width: 767px) {
  .screen {
    /* 移动端本会话不纳入设计，这里只保证小窗不崩：
       卡高再收一档，把高度让给上下两行正文；顶栏那一条同样要还回去 */
    --face-h: min(70vh, calc(100vh - 150px));
  }

  /* 版心四边一起收窄。这里不能只写 padding: 14px 16px —— 底边那一档
     带上了顶栏高度（见 .screen__inner 的注释），写平了会把版面又顶下去 */
  .screen__inner {
    padding: 14px 16px calc(14px + var(--top-h) + var(--top-gap));
  }

  /* 页脚贴到小窗版的版心下沿 */
  .screen__foot {
    bottom: 14px;
  }

  /* 退出钮的 y 与版心的 padding 起点同一条线（与顶栏同高，自然对齐） */
  .screen__exit {
    top: 14px;
  }

  /* 小窗里一卡两行：导语按视口收一档，要点表与参数行照旧全在 ——
     详细内容是这一版的主角，先让它站住 */
  .face__desc {
    max-width: none;
    font-size: clamp(13px, 3.4vw, 17px);
  }
}

/* 再窄一档：退出控件退回纯图标（版面已经没有地方放那两个字了）。
   尺寸跟着变成正方，与切换钮一模一样；aria-label 与 title 一直都在，
   读屏与悬浮提示不受影响。 */
@media (max-width: 600px) {
  .screen__exit {
    width: var(--ctrl);
    gap: 0;
    padding: 0;
  }

  .screen__exit-text {
    display: none;
  }

  .screen__label {
    /* 小字在这里会折行、会跟退出钮挤在一起，整条收掉，发丝线留住 */
    display: none;
  }
}

/* ===== 入场 =====
 * 只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套挂在 .is-entering 下：撤掉这个类，动画连同上浮一起消失，
 * 元素回落到的静态样式就是动画终态，交接处不跳变。
 * 两个不能碰的地方：柱体的堆叠姿态由 transform 写着 —— 入场只动 rotate / scale
 * 这两个独立属性；舞台那一层才做淡入（prism 上做 opacity 会把 preserve-3d 压平）。
 * 顶栏是 v3 新加的一条：它先落位（横向发丝跟着从左侧展开），退出控件随后弹出。
 */
.screen.is-entering .screen__top {
  animation: enter-rise var(--enter-dur-top) var(--ease) both;
  animation-delay: var(--enter-top);
}

.screen.is-entering .screen__exit {
  animation: enter-pop var(--enter-dur-exit) var(--ease) both;
  animation-delay: var(--enter-exit);
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

.screen.is-entering .meter__seg {
  /* 段本身靠宽度表达"正对镜头"，入场用横向展开，不去动宽度 */
  transform-origin: center;
  animation: enter-piece var(--enter-dur-meter) var(--ease) both;
  animation-delay: calc(var(--enter-meter) + var(--m-i, 0) * var(--enter-meter-step));
}

@keyframes enter-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
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

/* 顶栏：从下方浮起半行 + 淡入，与 features 页刊头的小字同一种"落位"姿态 */
@keyframes enter-rise {
  from {
    opacity: 0;
    translate: 0 0.45em;
  }
  to {
    opacity: 1;
    translate: 0 0;
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
  .face__index,
  .face__icon,
  .face__spec,
  .face__point::before,
  .face__title::after,
  .screen__nav,
  .screen__top,
  .screen__exit,
  .meter__seg {
    transition: none;
    animation: none;
  }
}
</style>
