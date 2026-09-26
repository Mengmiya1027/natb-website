<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnimationStore } from '@/stores/animation'
import { useUpdateLog } from '@/utils/updateLog'
// 标签图标要按 kind 动态取，只能显式导入组件（模板里的 <i-xxx> 是静态解析的）
import IconSparkles from '~icons/lucide/sparkles'
import IconZap from '~icons/lucide/zap'
import IconWrench from '~icons/lucide/wrench'

/**
 * 更新记录：最新的排在最前，index 指向正在看的那版。
 * kind 决定条目图标与标签强度，文案本身保持原样。
 * 版本日志本身不在这份文件里：整份清单来自 public/json/UpdateLog.json，
 * 「项目信息」页那行版本号读的是同一份清单的第一条（最新排在最前）。
 */
const { status: logStatus, releases, error: loadError } = useUpdateLog()

const STATE_TEXT = { unread: '未读', reading: '阅读中', read: '已读' }
const STATE_SHORT = { unread: '没看过', reading: '正在看', read: '已看过' }

// 新增最亮、优化次之、修复最轻，预告沿用火花
const KIND_ICON = { new: IconSparkles, opt: IconZap, fix: IconWrench, soon: IconSparkles }

// 正文里的官网地址要能点
const URL_RE = /(https?:\/\/[^\s，。；]+)/
const withParts = (item) => ({
  ...item,
  parts: item.text
    .split(URL_RE)
    .filter(Boolean)
    .map((piece) => (URL_RE.test(piece) ? { link: piece } : { text: piece })),
})

/* 两张反色卡守着头尾：dark 标记它们，folio 是卡内底纹词。
 * 预告卡排在最前，收尾卡垫在最后，两张都不算版本。 */
const SOON = {
  version: 'Coming Soon~',
  dark: true,
  folio: 'next',
  count: '筹备中',
  items: [
    { kind: 'soon', tag: '预告', text: '下一版还在打磨，清单没定稿' },
    { kind: 'soon', tag: '计划', text: '继续加厚机型兼容性与 ROOT 成功率' },
    { kind: 'soon', tag: '待定', text: '想加什么功能，去官网留言就行' },
  ],
}

const END = {
  version: 'No More~',
  dark: true,
  end: true,
  folio: 'end',
  sub: '——我也是有底线的——',
  count: '到此为止',
  items: [],
}

/* ===== 数据三态 =====
 * ready 才有牌堆可摆：loading / error 各摆一张占位卡，页面骨架与背景照旧。
 * 拉不到数据时既不会白屏，也不会把"一份空的更新日志"当成真的显示出来。
 */
const ready = computed(() => logStatus.value === 'ready' && releases.value.length > 0)
const stateText = computed(() => {
  if (logStatus.value === 'error') return '版本数据加载失败'
  return logStatus.value === 'ready' ? '暂无更新记录' : '正在读取版本数据'
})
const stateSub = computed(() =>
  logStatus.value === 'error'
    ? `没能读到 public/json/UpdateLog.json${loadError.value ? `（${loadError.value}）` : ''}，稍后刷新页面再试`
    : '版本清单来自 public/json/UpdateLog.json',
)

// 数据到了才把两张反色卡夹上去：预告在最前、收尾垫最后，中间的版本一律按日期倒序
const CARDS = computed(() =>
  [SOON, ...releases.value, END].map((release) => ({ ...release, items: release.items.map(withParts) })),
)
const TOTAL = computed(() => CARDS.value.length)
// 两张反色卡不算版本：页眉的版本数、底部指示条都只认已发布的
const PUBLISHED = computed(() => CARDS.value.filter((card) => !card.dark))
const RELEASE_COUNT = computed(() => releases.value.length)
const METER_ITEMS = computed(() =>
  CARDS.value.map((card, i) => ({ card, i })).filter((entry) => !entry.card.dark),
)
// 页眉的横跨区间只算已发布的版本，反色卡没有日期
const NEWEST = computed(() => PUBLISHED.value[0])
const OLDEST = computed(() => PUBLISHED.value[PUBLISHED.value.length - 1])

// index 即进度：0 是预告，末尾是收尾，开局停在第一个带版本号的
// 牌堆只在 ready 时才渲染，下标 1 因此一定对得上"最新的那一版"
const index = ref(1)
// pitch 组内相邻间距，push 整组外推倍数，step 组内倍数，都由容器实测得出
const geo = ref({ pitch: 132, push: 0, step: 0.6, depth: 48 })
// 横向间距不是等距的，两级分开管（都是实测 pitch 的倍数）：
// GAP_NEAR 管"中间那张 → 第一层"，让正在看的那张周围留出呼吸；
// GAP_STEP 管"同侧相邻两层"，让已看过 / 没看过各自抱成一团。
// 整组外推另由 push 管，动这两个只影响组内。
const GAP_NEAR = 1.6
const GAP_STEP = 0.6
// 卡小的时候要留宽，否则后面几张只剩一条缝
const GAP_STEP_NARROW = 1.1
const GAP_STEP_NARROW_W = 420
// 组内间距只认卡宽，容器拉宽不再撑开它
const PITCH_K = 0.3
// 与 .log-track 的 perspective 同值：算可用宽度要按透视缩放反推
const PERSPECTIVE = 1500
// 最外侧那位离屏幕边留的空
const EDGE_GAP = 8
const stageRef = ref(null)

/* ===== 入场动效的时间表 =====
 * 与 Features 页同一套做法：阶梯只写这一份，注入成 --enter-* 交给 CSS，
 * 样式只管姿态与曲线，时间轴不会在两边各写一遍。
 * 顺序：背景照片 → 压暗层 → 巨型版本底纹 → 页眉三段 → 两张切换按钮
 * → 卡片按"离正在看那张的距离"发牌 → 页脚三段。
 */
const ENTER = {
  shot: 0, // 背景照片（顺带缓慢收一档放大）
  scrim: 60, // 压暗层
  folio: 140, // 巨型版本底纹
  kicker: 120, // NATB / CHANGELOG
  title: 200, // 更新日志
  meta: 300, // 横跨 / 共 N 版本
  navLeft: 420, // 回到更新
  navRight: 500, // 查看更早
  cards: 560, // 正在看那张先落
  cardStep: 70, // 每远一层晚这么多
  ordinal: 700, // 02 / 04
  meter: 720, // 指示条首段
  meterStep: 60,
  hint: 820, // 页脚落款
}
const ENTER_DUR = {
  shot: 1400,
  scrim: 900,
  folio: 900,
  kicker: 620,
  title: 700,
  meta: 620,
  nav: 520,
  card: 620,
  ordinal: 560,
  meter: 520,
  hint: 560,
}
// 最远那张卡是 |step| 最大的：它落定，这段入场就算走完
// 卡数要等数据到位才定，所以这两个数跟着算；定时器在真起跑时才读它们
const CARD_STEP_MAX = computed(() => Math.max(...CARDS.value.map((_, i) => Math.abs(i - index.value))))
const ENTER_END = computed(() => ENTER.cards + ENTER.cardStep * CARD_STEP_MAX.value + ENTER_DUR.card + 40)

const ms = (v) => `${v}ms`
// 同一份数字交给 CSS：:style 挂在根节点上，var() 一路继承下去
const enterVars = {
  '--enter-shot': ms(ENTER.shot),
  '--enter-scrim': ms(ENTER.scrim),
  '--enter-folio': ms(ENTER.folio),
  '--enter-kicker': ms(ENTER.kicker),
  '--enter-title': ms(ENTER.title),
  '--enter-meta': ms(ENTER.meta),
  '--enter-nav-left': ms(ENTER.navLeft),
  '--enter-nav-right': ms(ENTER.navRight),
  '--enter-cards': ms(ENTER.cards),
  '--enter-card-step': ms(ENTER.cardStep),
  '--enter-ordinal': ms(ENTER.ordinal),
  '--enter-meter': ms(ENTER.meter),
  '--enter-meter-step': ms(ENTER.meterStep),
  '--enter-hint': ms(ENTER.hint),
  '--enter-dur-shot': ms(ENTER_DUR.shot),
  '--enter-dur-scrim': ms(ENTER_DUR.scrim),
  '--enter-dur-folio': ms(ENTER_DUR.folio),
  '--enter-dur-kicker': ms(ENTER_DUR.kicker),
  '--enter-dur-title': ms(ENTER_DUR.title),
  '--enter-dur-meta': ms(ENTER_DUR.meta),
  '--enter-dur-nav': ms(ENTER_DUR.nav),
  '--enter-dur-card': ms(ENTER_DUR.card),
  '--enter-dur-ordinal': ms(ENTER_DUR.ordinal),
  '--enter-dur-meter': ms(ENTER_DUR.meter),
  '--enter-dur-hint': ms(ENTER_DUR.hint),
}

/* ===== 入场的开关 =====
 * 开场还在演就先把整页按住（visibility 连底图一起藏），字一落位再从零起跑；
 * 少动效时两个都不开，元素直接停在终态。
 */
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
const anim = useAnimationStore()
const gated = ref(!reduceMotion && anim.isIntro)
const entering = ref(!reduceMotion && !anim.isIntro)
// 开场迟迟不落位也要放行：页面不能一直空着
const GATE_MAX = 5000
let enterTimer = 0
let enterGate = 0
let stopGate = null

/** 收尾：动画整批撤掉，元素回落到的静态样式就是动画终态，交接不跳 */
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
  enterTimer = window.setTimeout(finishEntrance, ENTER_END.value)
}

/** 入场没收干净就要切版：先把它收干净，切换才是终态对终态，不会叠着半透明的卡翻页 */
function ensureSettled() {
  if (entering.value) finishEntrance()
}

/* 两侧张数不等，定边界的是张数多的那一侧。这个数只由 index 决定，
 * 拿它跟上次实测的那个比一下，就知道"切过去会不会改变几何"，
 * 多数切换其实不必重量。 */
const outerOf = (i) => Math.max(i, TOTAL.value - 1 - i)
let measuredOuter = -1

// 正在看之前是已看过，之后是没看过
const stateOf = (i) => (i === index.value ? 'reading' : i < index.value ? 'read' : 'unread')
const canPrev = computed(() => index.value < TOTAL.value - 1) // 还有没看过的
const canNext = computed(() => index.value > 0) // 还有已看过的

/** 只按时间语义命名，左右落点交给模板绑：更早就 +1，更新就 -1 */
function goPrev() {
  ensureSettled()
  if (canPrev.value) index.value += 1
}
function goNext() {
  ensureSettled()
  if (canNext.value) index.value -= 1
}

/** 点堆里的卡、点页脚的指示条都走这里：直接跳到那一版，不逐版推进 */
function goTo(i) {
  if (i < 0 || i >= TOTAL.value || i === index.value) return
  ensureSettled()
  index.value = i
}

/* ===== 连击加速 =====
 * 一次切换的过渡还没走完就又切，说明用户在快速连翻。
 * 这时若仍按 620ms 起跑，每次打断都恰好落在强缓动的慢尾巴上，
 * 越点越"一卡一卡"；所以只把连击这一路缩短，单点仍是原节奏。
 */
const COMBO_GAP = 500 // 距上次切换短于这么久，就算连击
const COMBO_K = 0.5 // 连击时的时长倍数
const combo = ref(false)

let lastSwitch = -Infinity

/** 每次 index 变化记一笔：连击与否看两次切换的间隔，一步跨多张的跳转直接算快的 */
function noteSwitch(force = false) {
  const now = performance.now()
  const quick = force || now - lastSwitch < COMBO_GAP
  lastSwitch = now
  // 值没变就别赋值，免得白白多 patch 一次根节点
  if (combo.value !== quick) combo.value = quick
}

/* ===== 滚轮切换 =====
 * 下滚去更早、上滚回更新，与左右按钮同向。
 * 攒够一格就走一版、余额留到下一次：连滚几格就连切几张，不再有冷却挡着。
 */
const WHEEL_STEP = 100 // 一格鼠标滚轮≈100px，正好一版
const WHEEL_MAX_STEPS = 3 // 单段最多连切几版，猛滑一记不至于一路冲到底

let wheelAcc = 0

/** 行/页两种 deltaMode 折成像素，统一口径（一行按 40px 估，三行一格刚好过阈值） */
const wheelPx = (event) =>
  event.deltaMode === 1 ? event.deltaY * 40 : event.deltaMode === 2 ? event.deltaY * 800 : event.deltaY

/** 指针落在"正在看那张"的条目列表上、且列表还能滚时，滚轮整个归它：不抢，也不链式接管 */
function listOwnsWheel(node) {
  if (!(node instanceof Element)) return false
  const list = node.closest('.log-list')
  if (!list) return false
  // 堆里的卡现在也接指针了，但只认点击跳转：不然鼠标一偏，滚轮就再也切不动版本
  if (list.closest('.log-card')?.dataset.state !== 'reading') return false
  return list.scrollHeight > list.clientHeight + 1
}

function onWheel(event) {
  // 滚轮一动就算接管：先把入场收干净，再照下面的规矩分流
  ensureSettled()
  const dy = wheelPx(event)
  if (!dy) return
  if (listOwnsWheel(event.target)) {
    wheelAcc = 0
    return
  }
  // 到头了就不拦：让页面照常滚，滚轮不会"卡死"
  const older = dy > 0
  if (older ? !canPrev.value : !canNext.value) {
    wheelAcc = 0
    return
  }
  event.preventDefault()
  // 中途反向算新的一段，免得抖一下跑两版
  if (wheelAcc && Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0
  wheelAcc += dy
  const dir = wheelAcc > 0 ? 1 : -1
  const steps = Math.min(Math.floor(Math.abs(wheelAcc) / WHEEL_STEP), WHEEL_MAX_STEPS)
  if (steps <= 0) return
  wheelAcc -= dir * steps * WHEEL_STEP // 余额结转，下一格接着算
  for (let n = 0; n < steps; n++) {
    if (dir > 0) {
      if (!canPrev.value) break
      goPrev()
    } else {
      if (!canNext.value) break
      goNext()
    }
  }
}

/** 第 step 层的组内倍数：紧邻中间那张按 GAP_NEAR 让开，同侧其余按 unit 逐层累加 */
const spreadOf = (step, unit) => (step === 0 ? 0 : Math.sign(step) * (GAP_NEAR + (Math.abs(step) - 1) * unit))

/** 位移与层级走内联样式，三个状态匹配器只管倾斜、缩放、纸面 */
function cardStyle(i) {
  const step = i - index.value
  const depth = Math.abs(step)
  // 组内位置叠上整组外推，同侧一起挪，间距不变
  const spread = spreadOf(step, geo.value.step) + Math.sign(step) * geo.value.push
  return {
    translate: `${spread * geo.value.pitch}px 0 ${-depth * geo.value.depth}px`,
    zIndex: String(200 - depth),
  }
}

/** 读倾角与放大倍数：只认 CSS 变量，算完的 rotate/scale 在切版过渡中是中间值 */
function tiltedGeom(stage) {
  const el = stage.querySelector(".log-card[data-state='unread'], .log-card[data-state='read']")
  if (!el) return { deg: 0, scale: 1 }
  const cs = getComputedStyle(el)
  // --tilt 形如 calc(-120deg * 0.55)，两个因子相乘才是真实倾角
  const f = (cs.getPropertyValue('--tilt').match(/-?\d*\.?\d+/g) || []).map(Number)
  return {
    deg: Math.abs(f.length >= 2 ? f[0] * f[1] : f[0] || 0),
    scale: parseFloat(cs.getPropertyValue('--card-scale')) || 1,
  }
}

/** 按容器实测算间距：最外侧那张始终顶在屏幕边，组内怎么收都不把整组带回来 */
function measure() {
  const stage = stageRef.value
  if (!stage) return
  const card = stage.querySelector('.log-card')
  const cardW = card?.offsetWidth || 360
  // 卡小的时候堆叠留宽，免得后面几张只剩一条缝
  const unit = cardW < GAP_STEP_NARROW_W ? GAP_STEP_NARROW : GAP_STEP
  // 横版卡很宽，直接按卡宽推深度会退得太夸张，封顶到竖版的量级
  const depth = Math.round(Math.min(cardW * 0.16, 80))
  const outer = outerOf(index.value)
  const tilt = tiltedGeom(stage)
  const rad = (tilt.deg * Math.PI) / 180
  const half = (cardW / 2) * tilt.scale
  // 斜边近端被透视放大、远端缩小，位移上限从放大后的边缘反解
  const k = PERSPECTIVE / (PERSPECTIVE + outer * depth - half * Math.abs(Math.sin(rad)))
  const room = Math.max(0, (window.innerWidth / 2 - EDGE_GAP) / k - half * Math.abs(Math.cos(rad)))
  // 最外侧那位的组内倍数，不含外推
  const outerBase = GAP_NEAR + Math.max(0, outer - 1) * unit
  const cap = room / Math.max(1, TOTAL.value - 1)
  const pitch = Math.max(1, Math.round(Math.min(cardW * PITCH_K, Math.max(cardW * 0.18, cap))))
  geo.value = {
    pitch,
    // 组内收紧省下的宽度全归外推，最外侧那位继续贴着屏幕边
    push: Math.max(0, room / pitch - outerBase),
    step: unit,
    depth,
  }
  measuredOuter = outer
}

let frame = 0
/** 尺寸变化密集，按帧合并一次测量 */
function scheduleMeasure() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

/* index 一变，必须在"写 translate 的那次渲染之前"把几何定稿。
 * 走 scheduleMeasure 会拖到下一帧，等于过渡已经起跑才改目标值：
 * CSS 只能从当前中间值重新插值一整段，看着就是一顿。
 * 所以这里同步量，且只在几何真会变时量——多数切换 outer 没动，直接跳过。 */
watch(
  index,
  (to, from) => {
    // 一步跨多张就是直接跳转，按连击的节奏走，别让长位移慢悠悠地爬
    noteSwitch(Math.abs(to - from) > 1)
    if (outerOf(to) !== measuredOuter) measure()
  },
  { flush: 'sync' },
)

const stamp = (d) => (d ?? '').replace(/-/g, '.')
const zhStamp = (d) => {
  const [y, m, day] = d.split('-')
  return `${y}年${Number(m)}月${Number(day)}日`
}

const announce = computed(() => {
  const card = CARDS.value[index.value]
  // 数据还没到（loading / error）时没有牌堆可播报，占位文案自己带 role="status"
  if (!card) return ''
  const when = card.date ? zhStamp(card.date) : '没有日期'
  const what = card.count ?? `${card.items.length} 项更新`
  return `正在看 ${card.version}，${when}，${what}；已看过 ${index.value} 版，没看过 ${TOTAL.value - 1 - index.value} 版`
})

// 底纹显示的就是当前版本的号（1.0.0 这种），跟着 index 走
const folio = computed(() => {
  // 数据没到位时没有"当前版本"可言：这时牌堆没渲染，底纹也别漏出装饰卡的占位词
  if (!ready.value) return ''
  const card = CARDS.value[index.value]
  if (!card) return ''
  // 反色卡没有版本号，底纹用它自己的占位词
  return card.folio ?? card.version.slice(1)
})

/* 底纹的墨迹重心补偿：
 * 等宽栈里各数字的右留白并不一样（"0" 最宽、右留白最小），负字距又只在字与字之间生效、
 * 末字之后照扣，于是「1.0.0」天生比「1.0.2」更靠右（实测 0.0392em vs 0.0235em）。
 * 一个固定值喂不饱四版，所以每换一版就照当前字符串实测算一次，写进 --folio-nudge。
 */
const folioRef = ref(null)
const folioNudge = ref(0.024) // 量不出来时的兜底（≈ 字距绝对值的一半）

/* 每换一版都要量一次底纹的墨迹重心，但画布不必跟着重建：
 * 建 canvas 再取 2d 上下文是这几步里最贵的一环，缓存下来就只剩一次 measureText。
 * 同一个版本号回头再看时结果完全一样，再按"字体 + 字距 + 字符串"缓存一层。 */
let folioCtx
let folioCtxProbed = false
const folioNudgeCache = new Map()

function folioContext() {
  if (folioCtxProbed) return folioCtx
  folioCtxProbed = true
  if (typeof document === 'undefined') return (folioCtx = null)
  const ctx = document.createElement('canvas').getContext('2d')
  // 老引擎没有 canvas letterSpacing，量不了就退回兜底值
  folioCtx = ctx && typeof ctx.letterSpacing === 'string' ? ctx : null
  return folioCtx
}

function measureFolio() {
  const el = folioRef.value
  const ctx = folioContext()
  if (!el || !ctx) return
  const cs = getComputedStyle(el)
  const px = parseFloat(cs.fontSize)
  if (!px) return
  // 字体与字距都从元素自身读，样式改了这里自动跟上（注意字号要带单位，否则整条 font 作废）
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const spacing = cs.letterSpacing
  const text = folio.value
  const key = `${font}|${spacing}|${text}`
  const hit = folioNudgeCache.get(key)
  if (hit !== undefined) {
    folioNudge.value = hit
    return
  }
  ctx.font = font
  ctx.letterSpacing = spacing
  const m = ctx.measureText(text)
  const inkCenter = (-m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 2
  const nudge = (inkCenter - m.width / 2) / px
  folioNudgeCache.set(key, nudge)
  folioNudge.value = nudge
}

watch(folio, measureFolio)

function onKeydown(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
  // 方向键与左右按钮同向：左边是更新，右边是更早
  if (event.key === 'ArrowLeft') {
    if (!canNext.value) return
    event.preventDefault()
    goNext()
  } else if (event.key === 'ArrowRight') {
    if (!canPrev.value) return
    event.preventDefault()
    goPrev()
  }
}

/* ===== 舞台的绑定与解绑 =====
 * 牌堆要等数据到位才渲染出来（v-if 挂在 ready 上），所以滚轮与尺寸观测不能只在挂载那一下绑死：
 * 元素一出现就接上，元素一撤就摘干净，两处都走下面这两个函数。
 */
let observer = null
let stager = null

/** 接上舞台：滚轮监听、尺寸观测、首帧测量三件事绑在同一个元素上 */
function bindStage() {
  const stage = stageRef.value
  if (!stage || stage === stager) return
  unbindStage()
  stager = stage
  // 非被动才能在切换时拦掉页面滚动；滚轮只在卡片区接管
  stage.addEventListener('wheel', onWheel, { passive: false })
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure)
    observer.observe(stage)
  }
  // 刚进 DOM 的卡还没量过：几何与底纹墨迹补偿都按真卡宽先量一次
  scheduleMeasure()
  measureFolio()
}

function unbindStage() {
  stager?.removeEventListener('wheel', onWheel)
  stager = null
  observer?.disconnect()
  observer = null
}

// 数据一到位牌堆才挂上去，绑定与首测都跟着这一刻走
watch(ready, (on) => {
  if (!on) {
    unbindStage()
    return
  }
  nextTick(() => {
    bindStage()
    // 张数也是这一刻才定下的：入场还有多久收尾，得按真实卡数重排一次定时器
    if (entering.value) {
      clearTimeout(enterTimer)
      enterTimer = window.setTimeout(finishEntrance, ENTER_END.value)
    }
  })
})

onMounted(() => {
  measure()
  measureFolio()
  // 字体到位后卡宽可能变，底纹的墨迹补偿也要按真字体重算
  document.fonts?.ready?.then(() => {
    scheduleMeasure()
    // 真字体到位后墨迹重心会变，之前按回退字体量出来的结果全部作废
    folioNudgeCache.clear()
    measureFolio()
  })
  bindStage()
  window.addEventListener('resize', scheduleMeasure)
  window.addEventListener('keydown', onKeydown)

  /* ===== 入场 =====
   * 首屏渲染时类就挂上了，动画此刻已在跑，这里只负责按时间表收尾；
   * 若开场还在演，则先等它落位（最多 GATE_MAX），门一开再从 0% 起跑。
   */
  if (entering.value) {
    enterTimer = window.setTimeout(finishEntrance, ENTER_END.value)
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

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  unbindStage()
  // 入场的两个句柄与那条等待分支一起收干净
  if (enterTimer) clearTimeout(enterTimer)
  if (enterGate) clearTimeout(enterGate)
  stopGate?.()
  window.removeEventListener('resize', scheduleMeasure)
  window.removeEventListener('keydown', onKeydown)
})

const backdrop = import.meta.env.BASE_URL + 'images/update-log-bg.webp'
</script>

<template>
  <!-- --dur-k 是连击时的时长倍数：单点 1，连着翻 0.5，卡片只认 --dur-run -->
  <!-- 入场开关挂在根上：整套动画只认 .is-entering，收尾时撤掉它即回到终态 -->
  <div
    class="log-page"
    :class="{ 'is-entering': entering, 'is-gated': gated }"
    :style="[enterVars, { '--dur-k': combo ? COMBO_K : 1 }]"
  >
    <!-- 背景：public 里的图 + 压暗层 + 巨型版本底纹 -->
    <div class="log-backdrop" aria-hidden="true">
      <div class="log-backdrop__img" :style="{ backgroundImage: `url(${backdrop})` }"></div>
      <div class="log-backdrop__scrim"></div>
      <p
        ref="folioRef"
        class="log-folio"
        :style="{ '--folio-nudge': folioNudge.toFixed(4) + 'em' }"
      >{{ folio }}</p>
    </div>

    <div class="log-inner">
      <header class="log-head">
        <div>
          <p class="log-kicker">NATB / CHANGELOG</p>
          <h1 class="log-title">更新日志</h1>
        </div>
        <!-- 数量与区间都由数据算出来，数据没到位时整块不出现，免得先亮两个空数字 -->
        <dl v-if="ready" class="log-head__meta">
          <div>
            <dt>横跨</dt>
            <dd>{{ stamp(OLDEST?.date) }} — {{ stamp(NEWEST?.date) }}</dd>
          </div>
          <div>
            <dt>共</dt>
            <dd>{{ RELEASE_COUNT }}<small>版本</small></dd>
          </div>
        </dl>
      </header>

      <section v-if="ready" ref="stageRef" class="log-stage" aria-label="版本更新记录">
        <div class="log-track">
          <article
            v-for="(card, i) in CARDS"
            :key="card.version"
            class="log-card"
            :class="{ 'log-card--dark': card.dark, 'log-card--end': card.end }"
            :data-state="stateOf(i)"
            :style="[cardStyle(i), { '--enter-i': Math.abs(i - index) }]"
            :aria-current="i === index ? 'true' : undefined"
            @click="goTo(i)"
          >
            <p class="log-card__mark" aria-hidden="true">{{ card.folio ?? card.version }}</p>

            <header class="log-card__head">
              <!-- 日期与条数做 eyebrow，先把元信息压到背景里 -->
              <p class="log-card__meta">
                <time class="log-card__date" :datetime="card.date">{{ stamp(card.date) }}</time>
                <span class="log-card__count">{{ card.count ?? `${card.items.length} 项更新` }}</span>
              </p>
              <h2 class="log-card__version">{{ card.version }}</h2>
            </header>

            <p class="log-card__state">
              <span class="log-card__signal"></span>
              <span>{{ STATE_TEXT[stateOf(i)] }}</span>
            </p>

            <ul class="log-list">
              <li v-for="(item, k) in card.items" :key="k" class="log-item">
                <span class="log-item__tag" :data-kind="item.kind">
                  <component
                    :is="KIND_ICON[item.kind] ?? KIND_ICON.new"
                    class="log-item__glyph"
                    width="13"
                    height="13"
                    aria-hidden="true"
                  />
                  {{ item.tag }}
                </span>
                <span class="log-item__text">
                  <template v-for="(piece, p) in item.parts" :key="p">
                    <a
                      v-if="piece.link"
                      class="log-link"
                      :href="piece.link"
                      :tabindex="stateOf(i) === 'reading' ? undefined : -1"
                      target="_blank"
                      rel="noopener noreferrer"
                    >{{ piece.link }}</a>
                    <template v-else>{{ piece.text }}</template>
                  </template>
                </span>
              </li>
            </ul>

            <!-- 收尾卡的两句台词，其余区由 .log-card--end 让位 -->
            <p v-if="card.end" class="log-card__end-title">{{ card.version }}</p>
            <p v-if="card.end" class="log-card__end-sub">{{ card.sub }}</p>
          </article>
        </div>

        <!-- 左键管“更新”：更早的版本堆在右侧，更新的从左边滑回来 -->
        <button
          class="log-nav log-nav--left"
          type="button"
          :disabled="!canNext"
          aria-label="回到更新的版本"
          @click="goNext"
        >
          <i-lucide-chevron-left width="32" height="32" aria-hidden="true" />
        </button>
        <!-- 右键管“更早”：没看过的朝右排，顺着这个方向推进 -->
        <button
          class="log-nav log-nav--right"
          type="button"
          :disabled="!canPrev"
          aria-label="查看更早的版本"
          @click="goPrev"
        >
          <i-lucide-chevron-right width="32" height="32" aria-hidden="true" />
        </button>
      </section>

      <div v-else class="log-state" role="status">
        <!-- 数据还没到、或压根没读到：牌堆位置换一张占位卡。
             页面骨架、背景与底纹照旧，只有"该有牌堆的地方"换成一句话。
             这一块自己带 role="status"，读屏用户同样听得到当前处于哪一态。 -->
        <p class="log-state__mark" aria-hidden="true">{{ logStatus === 'error' ? '!' : '···' }}</p>
        <p class="log-state__text">{{ stateText }}</p>
        <p class="log-state__sub">{{ stateSub }}</p>
      </div>

      <footer v-if="ready" class="log-foot">
        <p class="log-ordinal">
          <b>{{ String(index).padStart(2, '0') }}</b> / {{ String(RELEASE_COUNT).padStart(2, '0') }}
        </p>
        <!-- 每一段都能点：点了直接跳到那一版 -->
        <ul class="log-meter" aria-label="版本导航">
          <li v-for="({ card, i }, k) in METER_ITEMS" :key="card.version" :style="{ '--m-i': k }">
            <button
              type="button"
              class="log-meter__piece"
              :data-state="stateOf(i)"
              :aria-current="i === index ? 'true' : undefined"
              :aria-label="`查看 ${card.version}`"
              @click="goTo(i)"
            ></button>
          </li>
        </ul>
        <p class="log-hint">MADE BY NATB DEVELOPER GROUP</p>
      </footer>

      <p class="log-sr" aria-live="polite">{{ announce }}</p>
    </div>
  </div>
</template>

<style scoped>
.log-page {
  /* 三色令牌：纸、墨、一个强调色 */
  --paper: #fcfcfd;
  --paper-2: #eeeff2;
  --ink: #0b0c0e;
  --ink-2: rgba(11, 12, 14, 0.7);
  --ink-3: rgba(11, 12, 14, 0.62);
  --line: rgba(11, 12, 14, 0.13);
  /* 条目之间的发丝线，比 --line 更轻 */
  --line-soft: rgba(11, 12, 14, 0.07);
  --accent: #0a59f7;
  /* 优化标签压在淡蓝底上，用深一档的蓝保住对比度 */
  --accent-deep: #0a47c8;
  /* 页眉页脚压在照片上，用玻璃面保证对比度 */
  --glass: rgba(10, 12, 16, 0.62);
  --on-glass: #f7f8fa;
  --on-glass-2: rgba(247, 248, 250, 0.78);
  --mono: ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace;

  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur: 620ms;
  /* 连击时按这个倍数缩短。单点仍是 --dur 原节奏，
     真正生效的时长统一走 --dur-run，卡片只认它。 */
  --dur-k: 1;
  --dur-run: calc(var(--dur) * var(--dur-k));
  --card-w: clamp(232px, 32vw, 460px);
  --card-h: clamp(300px, 46vh, 480px);

  position: relative;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: clip;
  color: var(--on-glass);
}

/* ===== 背景：图 + 压暗 + 版本底纹 ===== */
.log-backdrop {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.log-backdrop__img {
  position: absolute;
  inset: 0;
  background-color: #14161a; /* 图没到位时的兜底 */
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}

.log-backdrop__scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(118% 88% at 50% 42%, rgba(6, 8, 12, 0.18), rgba(6, 8, 12, 0.74) 78%),
    linear-gradient(180deg, rgba(6, 8, 12, 0.68), rgba(6, 8, 12, 0.24) 38%, rgba(6, 8, 12, 0.72));
}

/* 巨型版本号当底纹，只提供质感，不参与阅读 */
/* 手机：水平居中，纵向比原先略往上抬一点，字号略放大 */
.log-folio {
  /* 回补墨迹重心偏心：具体数值由脚本按当前版本的字符串实测后写在元素上，
     这里只是脚本就绪前的兜底（≈ 字距绝对值的一半，也是「1.0.2」那类的实测值） */
  --folio-nudge: 0.024em;
  position: absolute;
  left: 50%;
  bottom: 2vh;
  translate: calc(-50% - var(--folio-nudge)) 0;
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(112px, 24vw, 300px);
  font-weight: 700;
  line-height: 0.78;
  letter-spacing: -0.05em;
  color: rgba(255, 255, 255, 0.1);
  transition: opacity 300ms ease;
}

.log-inner {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: clamp(10px, 2.2vh, 26px);
  min-height: 100dvh;
  padding: clamp(18px, 4vh, 44px) clamp(16px, 4vw, 64px) clamp(14px, 3vh, 30px);
}

/* ===== 页眉 ===== */
.log-head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 32px;
  padding-bottom: clamp(10px, 1.6vh, 18px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}

.log-kicker {
  margin: 0 0 8px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--on-glass-2);
}

.log-title {
  margin: 0;
  font-size: clamp(30px, 3.4vw, 48px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

/* 小字标签 + 大字数值：两组各自是一段行内短语，整体压在页眉右侧 */
.log-head__meta {
  display: flex;
  align-items: baseline;
  gap: clamp(18px, 3vw, 44px);
  margin: 0;
}

.log-head__meta > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.log-head__meta dt {
  /* 小字：横跨 / 共。这里是汉字，等宽字体会掉进宋体回退 */
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--on-glass-2);
}

.log-head__meta dd {
  margin: 0;
  /* 大字数值：数字仍要等宽对齐 */
  font-size: clamp(25px, 2.15vw, 38px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--on-glass);
}

/* 「版本」两字跟着数量走，回到小字 */
.log-head__meta dd small {
  margin-left: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--on-glass-2);
}

/* ===== 舞台：透视挂在卡片父级 ===== */
.log-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: clamp(280px, 42vh, 520px);
}

.log-track {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--card-w);
  height: var(--card-h);
  transform: translate(-50%, -50%);
  perspective: 1500px;
  perspective-origin: 50% 50%;
}

/* ===== 卡片基座：状态差异全部读状态令牌 ===== */
.log-card {
  --tilt: 0deg;
  --card-scale: 1;
  --card-surface: var(--paper);
  --card-ink: var(--ink);

  position: absolute;
  inset: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(18px, 1.7vw, 26px);
  /* 超椭圆角形：40px 是安全区里已经看得出效果的值；
     再大就会啃到内容框的角（内边距只有 ~27px，切入点在 93px 附近） */
  border-radius: 40px;
  corner-shape: superellipse(2);
  border: 1px solid rgba(255, 255, 255, 0.7);
  /* 底纹要出血，所以裁在卡内 */
  overflow: hidden;
  background: var(--card-surface);
  color: var(--card-ink);
  box-shadow: var(--card-shadow);
  /* 位移由脚本写 translate，这里只负责姿态 */
  rotate: y var(--tilt);
  scale: var(--card-scale);
  /* 悬浮 / 按下的缩放另走 transform，跟三态的 scale 分开：
     挤在同一个属性里的话，两者只能共享同一条过渡时长，
     悬浮反馈会被切换的 620ms 拖成"飘"过去的。 */
  transform: scale(var(--card-hover, 1));
  will-change: translate, rotate, scale, transform;
  /* 带角形的层，每帧重画阴影的代价最大：box-shadow 故意不进过渡列表，
     换状态时阴影直接切换（位移动效遮得住），省掉的是每帧一次的路径+模糊重算 */
  transition:
    translate var(--dur-run) var(--ease),
    rotate var(--dur-run) var(--ease),
    scale var(--dur-run) var(--ease),
    /* 悬浮与按下是自己的一档快节奏，不跟着切换时长走 */
    transform 160ms var(--ease),
    background-color 420ms ease;
}

/* 压深一层，让已看过的纸面旧一点 */
.log-card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  /* corner-shape 不跟着 border-radius 一起继承：漏了这行，遮罩还是圆角矩形而卡片是超椭圆，
     角上就会漏出一条没压暗的浅边（只有"已看过"那张有遮罩，所以只在左侧卡片上看得见） */
  corner-shape: inherit;
  background: var(--card-veil, transparent);
  pointer-events: none;
}

/* ▼▼▼ 三态匹配器：卡片状态样式只由这三条决定 ▼▼▼ */
/* 没看过：左缘向前倾斜 */
.log-card[data-state='unread'] {
  /* 倾角可被版式整体缩放：横版卡很宽，同样的 18° 会被透视拉得夸张 */
  --tilt: calc(-120deg * var(--tilt-k, 1));
  --card-scale: 1.02;
  --card-surface: var(--paper);
  --card-ink: var(--ink);
  --signal: var(--ink-3);
  --signal-ring: rgba(11, 12, 14, 0.06);
  --card-shadow: 0 2px 6px rgba(6, 8, 12, 0.16), 0 18px 42px rgba(6, 8, 12, 0.24);
}

/* 正在看：立正、微放大 */
.log-card[data-state='reading'] {
  --tilt: 0deg;
  --card-scale: 1.06;
  --card-surface: var(--paper);
  --card-ink: var(--ink);
  --signal: var(--accent);
  --signal-fill: var(--accent);
  --signal-ring: rgba(10, 89, 247, 0.16);
  --card-shadow: 0 3px 10px rgba(6, 8, 12, 0.18), 0 30px 72px rgba(6, 8, 12, 0.36);
}

/* 已看过：右缘向前倾斜 */
.log-card[data-state='read'] {
  --tilt: calc(120deg * var(--tilt-k, 1));
  /* 与没看过同放大倍数：两侧不等会让一边贴边、一边收回一截 */
  --card-scale: 1.02;
  --card-surface: var(--paper-2);
  --card-ink: var(--ink);
  --signal: var(--ink-3);
  --signal-ring: rgba(11, 12, 14, 0.05);
  --card-veil: linear-gradient(0deg, rgba(11, 12, 14, 0.06), rgba(11, 12, 14, 0.06));
  --card-shadow: 0 2px 6px rgba(6, 8, 12, 0.14), 0 14px 34px rgba(6, 8, 12, 0.2);
}
/* ▲▲▲ 三态匹配器结束 ▲▲▲ */

/* 头尾两张反色卡：整张反色，半透明黑纸配白字，不跟着三态变白 */
.log-card.log-card--dark {
  --card-surface: rgba(8, 10, 14, 0.72);
  --card-ink: #f7f8fa;
  --card-veil: transparent;
  /* 卡内的墨色与分隔线整体翻过来，卡里所有 var() 跟着变 */
  --ink: #f7f8fa;
  --ink-2: rgba(247, 248, 250, 0.78);
  --ink-3: rgba(247, 248, 250, 0.6);
  --line: rgba(255, 255, 255, 0.18);
  --line-soft: rgba(255, 255, 255, 0.1);
  --accent: #7aa7ff;
  --accent-deep: #d3e2ff;
  --card-shadow: 0 3px 10px rgba(4, 6, 10, 0.42), 0 30px 72px rgba(4, 6, 10, 0.5);
  border-color: rgba(255, 255, 255, 0.16);
}

/* 标签与右下角底纹原本是黑调，反色后在这里补回来 */
.log-card--dark .log-item__tag {
  background: rgba(255, 255, 255, 0.14);
}

.log-card--dark .log-card__mark {
  color: rgba(255, 255, 255, 0.08);
}

/* 预告卡没有版本号，让 "Coming Soon~" 折成两行当主角 */
.log-card--dark .log-card__version {
  font-size: clamp(30px, 3.2vw, 60px);
  letter-spacing: -0.025em;
}

/* 收尾卡只留两句台词，其余区让位给居中的大字 */
.log-card.log-card--end {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 1.5vh, 18px);
  text-align: center;
}

.log-card--end > :not(.log-card__end-title):not(.log-card__end-sub) {
  display: none;
}

.log-card__end-title {
  margin: 0;
  font-size: clamp(34px, 4.4vw, 76px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
}

.log-card__end-sub {
  margin: 0;
  font-size: clamp(12px, 1.05vw, 16px);
  letter-spacing: 0.06em;
  color: var(--ink-2);
}

/* 堆里的卡也接指针了：悬浮会略微浮起，点一下就直接跳过去 */
.log-card {
  --card-hover: 1;
  pointer-events: auto;
}

.log-card:not([data-state='reading']) {
  cursor: pointer;
}

/* 悬浮在堆里的卡上：略微浮起一点，但别抢了正在看那张的份量 */
.log-card:not([data-state='reading']):hover {
  --card-hover: 1.032;
}

/* 按下先收一下，松手才跳 */
.log-card:not([data-state='reading']):active {
  --card-hover: 0.962;
}

/* ===== 卡内 ===== */
/* 卡底出血的版本号，补住列表下方的空当 */
.log-card__mark {
  position: absolute;
  right: 0.1em;
  bottom: 0;
  z-index: -1;
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(58px, 5.4vw, 92px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.05em;
  color: rgba(11, 12, 14, 0.06);
}

/* 头部竖排：eyebrow 一行压住元信息，版本号独占一行当主角 */
.log-card__head {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 7px;
}

.log-card__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}

.log-card__version {
  margin: 0;
  font-size: clamp(28px, 2.7vw, 42px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.035em;
}

.log-card__date {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--ink-3);
}

.log-card__count {
  /* 同样带汉字，跟着正文走，只把数字对齐成等宽 */
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}

.log-card__state {
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
  margin: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-soft);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ink-2);
}

/* 点亮时带一圈柔光，免得"正在看"只剩一个孤零零的圆点 */
.log-card__signal {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--signal);
  background: var(--signal-fill, transparent);
  box-shadow: 0 0 0 3px var(--signal-ring, transparent);
  transition: box-shadow 300ms ease;
}

.log-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 2px 2px 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
  scrollbar-width: thin;
}

/* 条目之间用发丝线分，比单纯堆 gap 更像一份清单 */
.log-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: clamp(8px, 1.3vh, 11px) 0;
}

.log-item + .log-item {
  border-top: 1px solid var(--line-soft);
}

.log-item:first-child {
  padding-top: 2px;
}

.log-item:last-child {
  padding-bottom: 2px;
}

/* 标签：统一胶囊形状，按 kind 分三档强度，不再堆零碎边框 */
.log-item__tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 1px;
  padding: 3.5px 10px;
  border-radius: 999px;
  /* 标签里是汉字：等宽字体会掉到宋体回退上，改用正文字体并加重一点 */
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--ink-2);
  background: rgba(11, 12, 14, 0.05); /* 默认就是"修复"那一档 */
}

.log-item__glyph {
  display: block;
  flex: none;
}

/* 新增：全页唯一实心强调色，最亮的一档 */
.log-item__tag[data-kind='new'] {
  background: var(--accent);
  color: #fff;
}

/* 优化：同色系淡底，比新增轻一档 */
.log-item__tag[data-kind='opt'] {
  background: rgba(10, 89, 247, 0.1);
  color: var(--accent-deep);
}

.log-link:focus-visible {
  border-radius: 2px;
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.log-item__text {
  font-size: clamp(13px, 1.02vw, 15px);
  line-height: 1.65;
  color: var(--ink);
}

.log-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

/* ===== 左右切换按钮 ===== */
.log-nav {
  position: absolute;
  top: 50%;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  padding: 0;
  translate: 0 -50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  background: var(--glass);
  color: var(--on-glass);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  box-shadow: 0 8px 24px rgba(6, 8, 12, 0.32);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease, scale 0.2s var(--ease), opacity 0.2s ease;
}

/* 类名只表方位，行为由模板绑，交换按钮作用时不必跟着改名 */
.log-nav--left {
  left: 0;
}

.log-nav--right {
  right: 0;
}

.log-nav:hover:not(:disabled) {
  background: rgba(10, 12, 16, 0.82);
}

.log-nav:active:not(:disabled) {
  scale: 0.94;
}

.log-nav:disabled {
  opacity: 0.34;
  cursor: not-allowed;
}

.log-nav svg {
  display: block;
}

.log-nav:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

/* ===== 数据占位 =====
 * 牌堆还没摆上来（或没摆成）时站的这一格：等高、居中、一句话。
 * 不做卡片、不描边：这不是"一条日志"，只是把当前处于哪一态说清楚，别抢后面真卡片的戏。 */
.log-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px;
  text-align: center;
}

.log-state__mark {
  margin: 0;
  font-family: var(--mono);
  font-size: clamp(26px, 3.6vw, 40px);
  font-weight: 600;
  letter-spacing: 0.18em;
  /* 只做底纹式的存在感：这一格的主角是下面那两行字 */
  color: rgba(255, 255, 255, 0.3);
}

.log-state__text {
  margin: 0;
  font-size: clamp(14px, 1.5vw, 17px);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--on-glass);
}

.log-state__sub {
  margin: 0;
  max-width: 44ch;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.7;
  letter-spacing: 0.04em;
  color: var(--on-glass-2);
  /* 失败原因（HTTP 404 这类）可能很长，窄屏宁可自己断行 */
  overflow-wrap: anywhere;
}

/* ===== 页脚 ===== */
/* 三段等分：两侧各占掉同样多的弹性宽度，中间的指示条就严格落在屏幕中线上 */
.log-foot {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  flex: none;
  align-items: center;
  gap: 16px;
  padding-top: clamp(10px, 1.6vh, 18px);
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}

.log-ordinal {
  justify-self: start;
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--on-glass-2);
}

.log-ordinal b {
  color: var(--on-glass);
  font-weight: 600;
}

/* 渐变里的两个色标要能过渡，就必须注册成 <color>：
   background-image 本身在 CSS 里不可插值，切换时会整段跳过去；
   把色标抽成变量、交给 @property 管，颜色才真的走得动。 */
@property --meter-a {
  syntax: '<color>';
  inherits: false;
  initial-value: rgba(255, 255, 255, 0.3);
}

@property --meter-b {
  syntax: '<color>';
  inherits: false;
  initial-value: rgba(255, 255, 255, 0.3);
}

.log-meter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.log-meter > li {
  display: flex;
}

/* 进度条与卡片同一套状态：靠亮度与光圈别，不只靠颜色。
   每一段现在都是按钮，点一下直接跳到那一版。 */
.log-meter__piece {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: clamp(18px, 2.4vw, 34px);
  height: 4px;
  padding: 0;
  border: 0;
  appearance: none;
  border-radius: 999px;
  /* 两端同色时就是原来的纯色，两端不同色时才是渐变收口 */
  --meter-a: rgba(255, 255, 255, 0.3);
  --meter-b: rgba(255, 255, 255, 0.3);
  background: linear-gradient(90deg, var(--meter-a), var(--meter-b) 64%);
  cursor: pointer;
  /* 长度要滑过去、厚度要跟手、颜色也要一路淡过去 */
  transition:
    width 340ms var(--ease),
    height 180ms ease,
    --meter-a 320ms ease,
    --meter-b 320ms ease,
    box-shadow 300ms ease;
}

/* 条本身只有 4px 高，点击热区靠伪元素撑开（左右各 3px，正好不越过 6px 的缝） */
.log-meter__piece::before {
  content: '';
  position: absolute;
  inset: -11px -3px;
}

.log-meter__piece[data-state='read'] {
  --meter-a: rgba(255, 255, 255, 0.62);
  --meter-b: rgba(255, 255, 255, 0.62);
}

/* 正在看的那段：比别的长一截，并用渐变收口 */
.log-meter__piece[data-state='reading'] {
  width: clamp(28px, 3.6vw, 50px);
  --meter-a: rgba(122, 167, 255, 0.92);
  --meter-b: #fff;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
}

/* 微交互刻意不跟着卡片放大，改用"变亮 + 变厚"这套语言 */
.log-meter__piece:hover,
.log-meter__piece:focus-visible {
  height: 6px;
  --meter-a: rgba(255, 255, 255, 0.84);
  --meter-b: rgba(255, 255, 255, 0.84);
}

.log-meter__piece[data-state='reading']:hover,
.log-meter__piece[data-state='reading']:focus-visible {
  --meter-a: #aac7ff;
  --meter-b: #fff;
}

.log-meter__piece:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}

.log-hint {
  /* 页脚已改成 1fr auto 1fr 栅格：第三格默认拉伸，这里让它贴回右缘 */
  justify-self: end;
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--on-glass-2);
}

.log-sr {
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

/* ===== 响应式 ===== */
/* PC 横版：左栏放基本信息（日期/版本/状态），右栏放条目列表 */
@media (min-width: 1000px) {
  .log-page {
    /* 尺寸按内容定：横版卡再大也只是把空白撑开，不解决问题 */
    --card-w: min(680px, 50vw);
    --card-h: clamp(270px, 34vh, 315px);
    /* 横版卡很宽，倾角收一半，透视才不会把两侧拉开 */
    --tilt-k: 0.55;
  }

  /* 电脑：底纹摆到屏幕正中，并放到最大 */
  .log-folio {
    left: 50%;
    top: 50%;
    bottom: auto;
    /* 同样回补墨迹偏心，--folio-nudge 在基态规则里已定 */
    translate: calc(-50% - var(--folio-nudge)) -50%;
    font-size: clamp(240px, 40vw, 600px);
  }

  .log-card {
    display: grid;
    grid-template-columns: minmax(0, 30%) minmax(0, 1fr);
    /* 左栏三段各占一行：元信息在顶、标题居中、状态在底 */
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      'head  list'
      'title list'
      'state list';
    column-gap: clamp(18px, 2.2vw, 36px);
    row-gap: 0;
    padding: clamp(20px, 1.7vw, 28px);
  }

  /* 拆掉 head 这层盒，让元信息与标题各自成为栅格项，标题才能被单独居中 */
  .log-card__head {
    display: contents;
  }

  .log-card__meta {
    grid-area: head;
  }

  /* 只把标题上下居中：上头留元信息，下头留给状态行 */
  .log-card__version {
    grid-area: title;
    align-self: center;
    font-size: clamp(36px, 5.6vw, 78px);
  }

  /* 状态行紧跟版本号：日期 / 版本 / 状态 顺着读下来 */
  .log-card__state {
    grid-area: state;
    padding: 14px 0 0;
    border-top: 1px solid var(--line-soft);
    border-bottom: none;
  }

  /* 右栏：条目列表，一条竖发丝线与左栏分开 */
  .log-list {
    grid-area: list;
    padding: 2px 4px 0 clamp(16px, 1.6vw, 26px);
    border-left: 1px solid var(--line-soft);
  }

  .log-item__text {
    font-size: clamp(14px, 1vw, 16px);
  }
}

@media (max-width: 900px) {
  .log-head__meta {
    display: none;
  }
}

@media (max-width: 760px) {
  .log-page {
    --card-w: min(72vw, 300px);
    --card-h: clamp(296px, 48vh, 420px);
    --dur: 520ms;
  }

  .log-head {
    align-items: flex-start;
  }

  .log-nav {
    width: 44px;
    height: 44px;
  }

  .log-hint {
    display: none;
  }
}

@media (max-width: 420px) {
  .log-kicker {
    letter-spacing: 0.16em;
  }

  .log-foot {
    gap: 12px;
  }
}

/* 用户要求少动效时，状态直接切 */
@media (prefers-reduced-motion: reduce) {
  .log-card,
  .log-nav,
  .log-meter__piece,
  .log-folio {
    transition: none;
  }
}

/* ===== 入场动效 =====
 * 只管姿态与曲线，起跑点与时长全部来自脚本注入的 --enter-*。
 * 整套挂在 .is-entering 下：撤掉这个类，动画连同上浮一起消失，
 * 元素回落到的静态样式就是动画终态，交接处不跳变。
 * 少动效时脚本根本不会加这个类，此处无须再挡一层。
 * 两个不能碰的地方：卡片的"堆叠位置"由内联 translate / rotate / scale 写着，
 * 切换按钮的定位由 translate 写着 —— 入场只动 opacity 与 transform（底纹另用 scale），
 * 所以卡片的入场位移是叠在堆叠姿态之外的一层，翻版时不会互相打架。
 */
.log-page.is-gated {
  /* 开场还没落位：整页先按住。visibility 连底图一起藏，不会漏出底色 */
  visibility: hidden;
}

/* ── 背景：照片慢慢收一档放大，压暗层随后跟上 ── */
.log-page.is-entering .log-backdrop__img {
  animation: enter-shot var(--enter-dur-shot) ease-out both;
  animation-delay: var(--enter-shot);
}

.log-page.is-entering .log-backdrop__scrim {
  animation: enter-fade var(--enter-dur-scrim) ease both;
  animation-delay: var(--enter-scrim);
}

/* 巨型版本底纹：从略小、略淡涨上来，先把整页的质感垫住 */
.log-page.is-entering .log-folio {
  animation: enter-folio var(--enter-dur-folio) var(--ease) both;
  animation-delay: var(--enter-folio);
}

/* ── 页眉三段：小字先立，标题跟上，数字最后到位 ── */
.log-page.is-entering .log-kicker {
  animation: enter-rise var(--enter-dur-kicker) var(--ease) both;
  animation-delay: var(--enter-kicker);
}

.log-page.is-entering .log-title {
  animation: enter-rise var(--enter-dur-title) var(--ease) both;
  animation-delay: var(--enter-title);
}

.log-page.is-entering .log-head__meta {
  animation: enter-rise var(--enter-dur-meta) var(--ease) both;
  animation-delay: var(--enter-meta);
}

/* ── 两张切换按钮：各自从自己那一侧滑进来 ── */
.log-page.is-entering .log-nav--left {
  animation: enter-nav-left var(--enter-dur-nav) var(--ease) both;
  animation-delay: var(--enter-nav-left);
}

.log-page.is-entering .log-nav--right {
  animation: enter-nav-right var(--enter-dur-nav) var(--ease) both;
  animation-delay: var(--enter-nav-right);
}

/* ── 卡片：从"正在看那张"往两侧依次发牌，越远的越晚落 ──
   终态写上 scale(var(--card-hover))，和静态样式逐字相同：
   入场期间悬停浮起照样跟手，收尾那一刻也不会因为换了属性而弹一下 */
.log-page.is-entering .log-card {
  animation: enter-card var(--enter-dur-card) var(--ease) both;
  animation-delay: calc(var(--enter-cards) + var(--enter-i, 0) * var(--enter-card-step));
}

/* ── 占位卡：数据没到位时站在牌堆那一格，跟着页眉一道淡入，不抢戏 ── */
.log-page.is-entering .log-state {
  animation: enter-rise var(--enter-dur-meta) var(--ease) both;
  animation-delay: var(--enter-meta);
}

/* ── 页脚三段：序号、指示条（逐段展开）、落款 ── */
.log-page.is-entering .log-ordinal {
  animation: enter-rise var(--enter-dur-ordinal) var(--ease) both;
  animation-delay: var(--enter-ordinal);
}

.log-page.is-entering .log-meter__piece {
  /* 条本身靠宽度表达"正在看"，入场用横向展开，不去动宽度 */
  transform-origin: center;
  animation: enter-piece var(--enter-dur-meter) var(--ease) both;
  animation-delay: calc(var(--enter-meter) + var(--m-i, 0) * var(--enter-meter-step));
}

.log-page.is-entering .log-hint {
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

@keyframes enter-shot {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes enter-folio {
  from {
    opacity: 0;
    scale: 0.97;
  }
  to {
    opacity: 1;
    scale: 1;
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

/* 从下、从远处浮上来：透视里退 70px 就是"更小更远"，落定即归位 */
@keyframes enter-card {
  from {
    opacity: 0;
    transform: translateY(26px) translateZ(-70px) scale(var(--card-hover, 1));
  }
  to {
    opacity: 1;
    transform: translateY(0) translateZ(0) scale(var(--card-hover, 1));
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
</style>
