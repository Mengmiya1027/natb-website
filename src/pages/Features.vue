<!--
  功能页 —— Apple 风格的卡片瀑布流（无限滚动）。

  版面：左栏一条窄栏放页眉，右栏是瀑布流主体。
  右栏是一个独立的滚动容器：滚动条整条隐藏，滚到接近底部就继续补卡片，
  所以它永远没有"到底"这件事，页面本身（窗口）不参与滚动。

  卡片只有两种面孔，区别只在下方内容区的底色：
    · tint  —— 内容区延续主视觉的淡彩，整张卡是一块完整的颜色
    · plain —— 内容区回到白纸，只有图与文字
  内容区不放应用图标，介绍独占整行自由换行，"查看"钉在右下角，
  介绍写多长、卡片就长多高 —— 高度差落在瀑布流里就是错落。

  展开层（原 FeatureBigScreen）本轮不做，入口留在 openFeature() 里。
-->
<script setup>
/* 可变字重中文字体：wght 轴 100–900，按 unicode-range 分片，只下载用到的字。
 * 系统中文（微软雅黑）只有 400 / 700 两档真字形，1–1000 的刻度在它身上没有意义，
 * 所以本页单独挂一套可变字体，字重才能真正细到每一档。 */
import '@fontsource-variable/noto-sans-sc/index.css'

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/* 展开层用 vue-bits 的 CardSwap：八张卡在 3D 里叠成一摞，
 * 前后轮换、可拖拽、也可用 ← → 切换。组件源码在 @/components/vue-bits/CardSwap.vue。 */
import CardSwap from '@/components/vue-bits/CardSwap.vue'

/* 数据即版面：每张卡的主视觉、标签、标题、介绍与底色都写在下面这一处。
 * tint 是给"淡彩面孔"用的底色，与封面图的主色调同族，低饱和、压深色文字够用。 */
const FEATURES = [
  {
    key: 'root',
    cover: 'root.webp',
    shot: 'root.webp',
    tag: 'ROOT',
    kicker: '主打推荐',
    headline: '解锁，只要一次点击',
    name: '一键 ROOT',
    desc: 'Z2 到 Z11 全系列一键拿下，BOOT 实时修补。',
    points: ['覆盖 Z2–Z11 全系列机型', '实时修补 BOOT，开机即生效', '一键全自动，不必手敲命令'],
    specs: ['Z2–Z11', 'BOOT 修补', '全自动'],
    ratio: '2048 / 1152',
  },
  {
    key: 'ota',
    cover: 'ota.webp',
    shot: 'ota.webp',
    tag: 'OTA',
    kicker: '必备精选',
    headline: '没有网络，也能升级',
    name: '离线 OTA 升级',
    desc: '升级包放进口袋，没有网络也能照常升级；验证异常的机型同样适用，不必先折腾一遍线刷。',
    points: ['离线包升级，不挑网络环境', '解决验证异常，升级可正常完成', '无需第三方工具，NATB 内完成'],
    specs: ['离线包', '免网络', '验证修复'],
    ratio: '2048 / 1152',
  },
  {
    key: 'rtos',
    cover: 'rtos.webp',
    shot: 'rtos.webp',
    tag: 'RTOS',
    kicker: '轻系统适配',
    headline: '轻系统，也有好工具',
    name: 'RTOS 支持',
    desc: 'Z7 Pro、Z9a 等 RTOS 系统手表，工具链一样完整。',
    points: ['Z7Pro、Z9a 等 RTOS 机型', '与 Android 机型同一套界面', '连接即识别，不必额外装驱动'],
    specs: ['Z7Pro', 'Z9a', 'RTOS'],
    ratio: '2048 / 1152',
  },
  {
    key: 'appmanager',
    cover: 'appmanager.webp',
    shot: 'appmanager.webp',
    tag: 'APP',
    kicker: '主打推荐',
    headline: '装应用，有无数种姿势',
    name: '应用管理',
    desc: 'install、data、第三方安装器、install-create 四条通道任选，都在同一处完成。',
    points: ['install / data 两条直装通道', '第三方安装器与 install-create', '列表内直接卸载与清理'],
    specs: ['install', 'data', 'install-create'],
    ratio: '640 / 640',
  },
  {
    key: '9008',
    cover: '9008.webp',
    shot: '9008.webp',
    tag: 'EDL',
    kicker: '进阶玩法',
    headline: '一步到底的底层救援',
    name: '9008 刷机',
    desc: '进入 9008 模式刷入 Recovery / TWRP，救砖不用拆机。',
    points: ['9008 通道刷入 Recovery / TWRP', '分区备份与恢复并排管理', '不进系统也能救回变砖设备'],
    specs: ['9008', 'Recovery', 'TWRP'],
    ratio: '1920 / 1080',
  },
  {
    key: 'magisk',
    cover: 'magisk.webp',
    shot: 'magisk.webp',
    /* 这张是 2496×992 的横幅：4:3 的窗口只塞得下「整行标题」或「狐狸」，
     * 保标题，窗口推到 85% */
    pos: '85% center',
    /* 封面是绿色横幅，按序号排到的玫瑰色会和它打架：暗部压成灰绿、
     * 纸面却是粉色。这里直接把这卡的主题色换成它自己的绿。 */
    tint: '#e3e9dc',
    /* 画面里已经印着「Magisk Delta」，功能名再说一遍只会和它贴成一团 */
    hideName: true,
    tag: 'MODULE',
    kicker: '扩展生态',
    headline: '模块的乐趣，一键就好',
    name: 'Magisk 模块',
    desc: '模块装、卸、列表管理，来源与冲突一目了然。',
    points: ['本地模块一键安装与卸载', '模块清单随时查看与开关', '不必反复重刷，玩得更安心'],
    specs: ['安装', '卸载', '列表管理'],
    ratio: '2496 / 992',
  },
  {
    key: 'filemanager',
    cover: 'filemanager.webp',
    shot: 'filemanager.webp',
    tag: 'FILES',
    kicker: '主力工具',
    headline: '不用 ADB，也能翻箱倒柜',
    name: '文件管理',
    desc: '内置文件管理器直接读写手表存储，传文件都在 NATB 里完成。',
    points: ['内置文件树，直读手表存储', '上传、下载、删除同在一处', '告别命令行与第三方管理器'],
    specs: ['免 ADB', '内置文件树', '上传下载'],
    ratio: '2388 / 1338',
  },
  {
    key: 'scrcpy',
    cover: 'scrcpy.webp',
    shot: 'scrcpy.webp',
    tag: 'MIRROR',
    kicker: '投屏神器',
    headline: '手表屏幕，投到桌面',
    name: '投屏控制',
    desc: '基于 scrcpy 的实时投屏与键鼠控制，演示、调试一次到位。',
    points: ['scrcpy 实时投屏，画面即时同步', '电脑端鼠标直接操作手表', '连线即可用，不必额外配置'],
    specs: ['scrcpy', '实时投屏', '鼠标接管'],
    ratio: '2048 / 1152',
  },
]

/* 主题色：与展开层（FeatureBigScreen）同一套纸感八色，一处定义、两边共用。
 * 八块都按"墨黑压在上面"验过对比度（最低 13:1），所以卡面文字一律深墨，
 * 不再靠封面亮度来回切深浅 —— 颜色由功能本身决定，每张卡都有自己的底色。 */
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

/* 封面走 public，不经打包器：同一张图只产出一份，剩下交给浏览器缓存。 */
const COVER_DIR = import.meta.env.BASE_URL + 'images/features/cover/'

/* 底图：每次进这一页随机挑一张。
 * 两张图的明暗与色温差得远（一张暖褐、一张冷白），固定用哪一张都会让左栏
 * 那块玻璃在某一类屏上失去层次；轮着来反而两边都耐看。
 * 随机在 setup 时定一次，之后整个会话不变 —— 每次重渲染都换会让底图闪。 */
const BACKDROPS = [
  import.meta.env.BASE_URL + 'images/features/backdrop.jpg',
  import.meta.env.BASE_URL + 'images/features/backdrop-2.webp'
]
const BACKDROP = BACKDROPS[Math.floor(Math.random() * BACKDROPS.length)]

// 实机界面截图：只出现在详情弹窗里
const SHOT_DIR = import.meta.env.BASE_URL + 'images/features/screenshot/'

/* ===== 瀑布流分列 =====
 * 不用 CSS 多列：多列在追加内容时会重新平衡列高，已看过的卡片会整体跳位。
 * 这里改成"三列各自堆叠"，新卡片只落到某一列的末尾，其它列纹丝不动。
 * 列数由窗口宽度决定，同时写进 --cols 交给 CSS，两边不会对不上。 */
const colsFor = (w) => (w >= 1180 ? 3 : w >= 620 ? 2 : 1)

const bodyRef = ref(null)
const columns = ref([])
// 三列的真实高度：追加时按最矮的那列放，列与列才不会越滚越不齐
const colEls = ref([])
const setColEl = (el, i) => {
  colEls.value[i] = el || null
}

/* 估算一张卡的高度：图高按卡片比例算，文字按每行多少个字算行数。
 * 只在列还没挂上 DOM 时用作兜底；挂上之后直接量真实高度。 */
const ratioOf = (r) => {
  const [a, b] = String(r).split('/').map((v) => Number(v.trim()))
  return a && b ? a / b : 16 / 9
}
function estimate(item, w) {
  const lines = Math.max(1, Math.ceil((item.desc.length * 14) / Math.max(140, w - 32)))
  return w / ratioOf(item.ratio) + 16 + 20 + 8 + lines * 20 + 48
}
let cols = 3
// 已补过多少轮：resize 重建列时需要按同样轮数重放
let round = 0
// 同一帧里连续触发 scroll 只补一次
let appending = false
// 顶部雾化是否已经淡入（滚动后才有意义，见 maybeAppend）
const topFog = ref(false)

const makeTile = (item, r) => {
  const index = FEATURES.findIndex((f) => f.key === item.key)
  const cover = COVER_DIR + item.cover
  const no = String(index + 1).padStart(2, '0')
  /* 主题色按"第几项功能"取，跟轮次无关：同一张卡滚到第几轮都是同一个颜色。
   * 单张也可以在数据里写 tint 覆盖 —— 封面本身的色相和序号排到的颜色
   * 对不上时（比如绿色横幅排在玫瑰色位上），纸面与暗部会互相打架。 */
  const tint = item.tint || TINTS[index % TINTS.length]
  return { ...item, no, cover, plate: SHOT_DIR + item.shot, tint, uid: `${item.key}-${r}` }
}

/* 补一轮：FEATURES 只有八条，靠轮次错开起点；
 * 分配时避开"本列上一张就是同一张卡"，否则接缝处会连着两张一模一样的卡。 */
function appendRound() {
  const n = cols
  const offset = (round * 3) % FEATURES.length
  const bucket =
    columns.value.length === n ? columns.value.map((col) => col.slice()) : Array.from({ length: n }, () => [])
  const tails = bucket.map((col) => (col.length ? col[col.length - 1].key : ''))
  const queue = [...FEATURES.slice(offset), ...FEATURES.slice(0, offset)]

  // 列宽三列一致，量一次就够；没挂上 DOM 时退回按内容估算
  const w = colEls.value[0]?.clientWidth || 280
  const heights = bucket.map((col, i) => {
    const el = colEls.value[i]
    if (el) return el.getBoundingClientRect().height
    return col.reduce((sum, tile) => sum + estimate(tile, w), 0)
  })

  for (const item of queue) {
    // 最矮的列先放：列高差被摊平，滚到底不会出现某一列空一大截
    let ci = 0
    for (let j = 1; j < n; j += 1) if (heights[j] < heights[ci]) ci = j
    // 与本列最后一张撞卡时退到次矮的列，避免接缝处并排两张一样的卡
    if (tails[ci] === item.key) {
      let alt = -1
      for (let j = 0; j < n; j += 1) {
        if (j === ci || tails[j] === item.key) continue
        if (alt < 0 || heights[j] < heights[alt]) alt = j
      }
      if (alt >= 0) ci = alt
    }
    heights[ci] += estimate(item, w)
    tails[ci] = item.key
    bucket[ci].push(makeTile(item, round))
  }

  round += 1
  columns.value = bucket
}

/* 首屏与 resize：先摆一屏，再补齐到能滚动为止（页面很长时由滚动继续补） */
function reset(n) {
  cols = n
  round = 0
  columns.value = Array.from({ length: n }, () => [])
  appendRound()
}

function rebuild(n) {
  const loaded = round
  cols = n
  round = 0
  columns.value = Array.from({ length: n }, () => [])
  for (let r = 0; r < loaded; r += 1) appendRound()
}

/* 首屏内容撑不满容器时补不动，会一直补到出现滚动余量为止（上限防死循环）。
 * 每补一轮都要等 DOM 落地再量，否则同步读到的还是旧的 scrollHeight。 */
async function fillViewport() {
  for (let i = 0; i < 12; i += 1) {
    await nextTick()
    const el = bodyRef.value
    if (!el || el.scrollHeight > el.clientHeight + 8) return
    appendRound()
  }
}

function maybeAppend() {
  const el = bodyRef.value
  /* 顶部雾化的开关：只有真的滚动了才淡入。
   * 首屏第一排卡的顶边就在雾区高度之内，常驻的雾会把它自己头顶糊掉；
   * 而一旦开始滚，滚上去的那一段必须糊 —— 否则卡片文字会顶着顶栏胶囊露出来。 */
  if (el && (el.scrollTop > 6) !== topFog.value) topFog.value = el.scrollTop > 6

  if (appending) return
  // 宽屏是容器自己在滚，窄屏（容器不限高）退回窗口滚动
  const target = el && el.scrollHeight > el.clientHeight + 8 ? el : document.scrollingElement
  if (!target) return
  if (target.scrollTop + target.clientHeight < target.scrollHeight - 800) return
  appending = true
  requestAnimationFrame(() => {
    appendRound()
    requestAnimationFrame(() => {
      appending = false
    })
  })
}

function onResize() {
  measureSheet()
  const n = colsFor(window.innerWidth)
  if (n === cols) return
  rebuild(n)
}

onMounted(async () => {
  measureSheet()
  reset(colsFor(window.innerWidth))
  await fillViewport()
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('scroll', maybeAppend, { passive: true })
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', maybeAppend)
  window.removeEventListener('keydown', onKeydown)
})

/* ===== 详情弹窗 =====
 * 点"查看"开一张白卡片：封面 + 标题 + 说明，右下角一个关闭键。
 * 三处出口：右上角按钮、遮罩、Esc。不做焦点陷阱与多层动效，够用就好。 */
/* ===== 展开层状态 =====
 * 弹窗里是一整摞卡：当前这张在最前，其余按原顺序依次排在后面，
 * 由 CardSwap 负责轮换、拖拽与键盘切换。这里只提供"以谁开头"。 */
const activeIndex = ref(-1)
const closeBtn = ref(null)

const sheetSize = ref({
  w: 960,
  h: 380,
  cardW: 960,
  cardH: 380,
  scale: 1,
  closeX: 0,
  closeY: 0,
  cardBottom: 380
})
const SHOT_RATIO = 1.702

/* ===== 舞台尺寸 =====
 * CardSwap 内部先按"卡片 + 堆叠错位 + 内边距"算出一个包围盒，再用 fit()
 * 把整个舞台缩放进容器。所以容器（.sheet__stage）必须按包围盒给尺寸，
 * 给它卡片尺寸的话它会自己缩一刀 —— 大屏上那一刀缩掉两成，卡片四周空一圈，
 * 钉在容器角上的关闭键也跟着飘到卡片外面去。
 *
 * 下面这几个常量与模板里传给 CardSwap 的 props 一一对应，改一处要改两处。
 * persp / pad 照抄组件内部常量 PERSPECTIVE = 900、PAD = 32。 */
const STACK = {
  cd: 36, //  :card-distance
  vd: 32, //  :vertical-distance
  depth: 12, //  :depth
  visible: 4, //  :visible-cards
  hover: 0.18, //  :hover-spread
  persp: 900,
  pad: 32
}

/* 与组件里的 stackBounds() 同式：四角各按透视比例缩一圈，取并集。 */
function stackBox(w, h) {
  const spread = 1 + STACK.hover
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < STACK.visible; i++) {
    const k = STACK.persp / (STACK.persp + i * STACK.depth)
    for (const u of [-w / 2, w / 2]) {
      for (const v of [-h / 2, h / 2]) {
        const x = (i * STACK.cd * spread + u) * k
        const y = (-i * STACK.vd * spread + v) * k
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return {
    width: Math.ceil(maxX - minX + STACK.pad * 2),
    height: Math.ceil(maxY - minY + STACK.pad * 2),
    originX: STACK.pad - minX,
    originY: STACK.pad - minY
  }
}

/* 舞台给的是"卡片"尺寸，剩下的交给 CardSwap 的 fit()：它拿这个尺寸去比自己
 * 算出来的包围盒，不够大就整摞按同一个比例缩进去 —— 卡片组因此自带一圈余量，
 * 整体比舞台小一号。这就是要的样子，不是 bug。
 *
 * 麻烦的是关闭键：它钉在舞台坐标里，而卡片已经被缩过、位置也不是舞台中心。
 * 所以下面几个数都是按 fit() 同一个公式换算出来的：
 *   scale  = min(1, 卡片宽 / 包围盒宽, 卡片高 / 包围盒高)
 *   包围盒被 translate(-50%,-50%) scale(s) 摆在舞台正中，
 *   于是包围盒坐标 p 落到舞台坐标就是  stageW/2 + (p - boxW/2) * s。 */
function packSheet(cardW, cardH) {
  const box = stackBox(cardW, cardH)
  const scale = Math.min(1, cardW / box.width, cardH / box.height)
  return {
    w: cardW,
    h: cardH,
    cardW,
    cardH,
    scale,
    /* 当前这张卡的右上角（包围盒坐标 originX + cardW/2, originY - cardH/2）。 */
    closeX: cardW / 2 + (box.originX + cardW / 2 - box.width / 2) * scale,
    closeY: cardH / 2 + (box.originY - cardH / 2 - box.height / 2) * scale,
    /* 当前这张卡的下边缘：卡片组下方那句提示挂在这里。
     * 不能挂舞台底边 —— 卡片被 fit() 缩过，实际下边缘比舞台底边高一截，
     * 钉舞台底边的话提示会飘到很远的地方，看着跟卡片没关系。 */
    cardBottom: cardH / 2 + (box.originY + cardH / 2 - box.height / 2) * scale
    /* 舞台不做平移：居中的是整摞卡的包围盒，不是最前面那一张。
     * 后层卡向右上错开，包围盒居中之后，最前面这张自然落在偏左下的位置 ——
     * 整个卡组的视觉重心才是稳的。只把前层卡拉到正中，右上的三层就会
     * 顶出画面一大截，看着像卡组歪了。 */
  }
}

const MIN_W = 760
const MIN_H = 460

function measureSheet() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw < 720) {
    /* 竖版卡：宽度吃满，高度按内容给一档，图在底部用 16:10 */
    const cardW = Math.max(320, vw - 48)
    const cardH = Math.round(Math.min(620, Math.max(MIN_H, vh - 160)))
    sheetSize.value = packSheet(cardW, cardH)
    return
  }
  /* 卡片往大了给：屏幕放不下时先收窄层与层之间的距离（见模板里的 card-distance），
   * 而不是缩卡片本身 —— 一摞牌挤紧一点，比整张卡变小更耐看。 */
  const h = Math.round(Math.min(680, Math.max(MIN_H, vh - 120)))
  const w = Math.round(Math.min(h * SHOT_RATIO + 400, Math.max(MIN_W, vw - 120)))
  sheetSize.value = packSheet(w, h)
}

const active = computed(() => (activeIndex.value >= 0 ? makeTile(FEATURES[activeIndex.value], 0) : null))

const stackCards = computed(() => {
  const n = FEATURES.length
  if (activeIndex.value < 0) return []
  return Array.from({ length: n }, (_, k) => makeTile(FEATURES[(activeIndex.value + k) % n], 0))
})

/* 关闭键的 × 要跟着它压着的那块图走：亮底给墨字、暗底给白字。
 * 每次开窗重新采一次 —— 八张实机界面明暗差得很远，写死哪一色都会有一半看不清。
 * 采样点只取图片右上角那一块（按钮实际压着的区域），不是整张图。 */
const closeInk = ref('#1d1d1f')

function pickInk(url) {
  if (!url) return
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const sw = Math.max(1, Math.round(img.naturalWidth * 0.2))
    const sh = Math.max(1, Math.round(img.naturalHeight * 0.2))
    ctx.drawImage(img, img.naturalWidth - sw, 0, sw, sh, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
    }
    const n = data.length / 4
    // 感知亮度（Rec. 709 权重）；玻璃还会再提亮一层，阈值压到 0.55
    const lum = (0.2126 * (r / n) + 0.7152 * (g / n) + 0.0722 * (b / n)) / 255
    closeInk.value = lum > 0.55 ? '#1d1d1f' : '#ffffff'
  }
  img.onerror = () => {
    closeInk.value = '#1d1d1f'
  }
  img.src = url
}

function openFeature(item) {
  activeIndex.value = FEATURES.findIndex((f) => f.key === item.key)
  /* 竖版卡是"文字在上、图在下"，关闭键压在文字那块纸色上，跟实机图的明暗
   * 没有关系 —— 还按图片右上角采样的话，深色截图会给出白字，× 就消失在
   * 浅底里了。所以窄屏直接给墨色。 */
  if (window.innerWidth < 720) closeInk.value = '#1d1d1f'
  else pickInk(item.plate)
  nextTick(() => closeBtn.value?.focus())
}

function closeFeature() {
  activeIndex.value = -1
}

function onKeydown(event) {
  if (event.key === 'Escape' && active.value) closeFeature()
}
</script>

<template>
  <div class="fp" :class="{ 'is-modal': active }">
    <div class="fp__bg" :style="{ '--backdrop': `url(${BACKDROP})` }" aria-hidden="true"></div>

    <div class="fp__inner">
      <!-- 左栏：刊头 + 目录，两条都钉在左栏里 -->
      <header class="fp__head">
        <p class="fp__mark">NATB · 功能清单</p>
        <h1 class="fp__title">八项能力<br />一件不少</h1>
        <p class="fp__lede">一键 ROOT、离线升级、投屏控制，都在 NATB 里。</p>
        <p class="fp__count"><b>{{ FEATURES.length }}</b><span>项能力</span></p>

        <footer class="fp__foot">
          <p class="fp__foot-hint">点任意一张卡，看实机界面</p>
          <p>NATB · 小天才手表工具箱</p>
        </footer>
      </header>

      <!-- 右栏：独立滚动容器，滚动条整条隐藏，滚到底前继续补卡。
           window 只做定位锚点：顶部那块雾贴在它身上，不会跟着内容滚走。 -->
      <div class="fp__window">
        <div ref="bodyRef" class="fp__body" tabindex="0" aria-label="功能卡片列表" @scroll.passive="maybeAppend">
        <div class="fp__cols" :style="{ '--cols': columns.length }">
          <div v-for="(col, ci) in columns" :key="ci" :ref="(el) => setColEl(el, ci)" class="fp__col">
            <article
              v-for="(item, i) in col"
              :key="item.uid"
              class="tile"
              :style="{
                '--i': i,
                '--ratio': item.ratio,
                '--tint': item.tint,
              }"
              :aria-labelledby="`tile-name-${item.uid}`"
            >
              <!-- 图只做画面，不承担文字：角标是实底小签，怎么染色都读得清 -->
              <div class="tile__stage">
                <img
                  class="tile__img"
                  :src="item.cover"
                  :alt="`${item.name} 主视觉`"
                  decoding="async"
                />
                <!-- 两层染色把八张来源不一的图拉进同一套色温（见样式里的说明） -->
                <span class="tile__wash" aria-hidden="true"></span>
                <span class="tile__veil" aria-hidden="true"></span>
                <span class="tile__badge" aria-hidden="true">
                  <b>{{ item.no }}</b>
                  <i>{{ item.tag }}</i>
                </span>

                <!-- 图上压标题：功能名与主张两排直接叠进画面，
                     图与字是一块，不再被切成「图 / 白条」两段 -->
                <div class="tile__caption">
                  <p v-if="!item.hideName" class="tile__eyebrow">{{ item.name }}</p>
                  <h2 class="tile__headline" :id="`tile-name-${item.uid}`">{{ item.headline }}</h2>
                </div>
              </div>

              <!-- 纸面只剩说明与动作 -->
              <div class="tile__body">
                <p class="tile__desc">{{ item.desc }}</p>
                <p class="tile__foot" aria-hidden="true">
                  <span class="tile__kicker">{{ item.kicker }}</span>
                  <span class="tile__cta">
                    查看
                    <i-lucide-arrow-right class="tile__arrow" width="14" height="14" />
                  </span>
                </p>
              </div>

              <!-- 整张卡就是热区：视觉动作在 .tile__cta，可点面积覆盖全卡 -->
              <button
                class="tile__hit"
                type="button"
                :aria-label="`查看 ${item.name}`"
                @click="openFeature(item)"
              ></button>
            </article>
          </div>
        </div>
        </div>

        <!-- 顶部雾化：贴着列表起始位置往上一段，越靠上越糊，到底部完全透明。
             弹窗打开时整块摘掉 —— 它盖满视口宽，实时模糊会和翻卡抢同一份合成预算。 -->
        <div v-if="!active" class="fp__fog" :class="{ 'is-on': topFog }" aria-hidden="true"></div>
        <!-- 底部同款雾化（镜像）：卡片滚到视口下沿时是"化开"而不是被切一刀 -->
        <div v-if="!active" class="fp__fade" aria-hidden="true"></div>
      </div>
    </div>

    <!-- 详情弹窗：八张卡叠成一摞，当前这张在最前（vue-bits CardSwap） -->
    <div v-if="active" class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet__veil" @click="closeFeature"></div>

      <!-- stage 只负责定位与定尺，关闭键挂在这一层，卡片怎么翻都不影响它。
           尺寸是 CardSwap 的包围盒（不是卡片尺寸），关闭键的位置由脚本按
           同一个包围盒换算出来，两者不会各说各话。 -->
      <div
        class="sheet__stage"
        :style="{
          width: `${sheetSize.w}px`,
          height: `${sheetSize.h}px`,
          '--sheet-close-x': `${sheetSize.closeX}px`,
          '--sheet-close-y': `${sheetSize.closeY}px`,
          '--sheet-card-bottom': `${sheetSize.cardBottom}px`
        }"
      >
        <CardSwap
          :width="sheetSize.cardW"
          :height="sheetSize.cardH"
          :card-distance="36"
          :vertical-distance="32"
          :depth="12"
          :skew-amount="0"
          :parallax="1"
          :hover-spread="0.18"
          :visible-cards="4"
          :delay="5200"
          :speed="1.1"
          :pause-on-hover="true"
          :draggable="true"
          :card-radius="32"
        >
          <article
            v-for="(card, i) in stackCards"
            :key="card.key"
            class="sheet__card"
            :style="{ '--tint': card.tint, '--cover': `url(${card.cover})` }"
          >
            <div class="sheet__grid">
              <div class="sheet__body">
                <!-- 顶：序号与分类贴左上角 -->
                <p class="sheet__eyebrow">
                  <span class="sheet__index"><b>{{ card.no }}</b><i>/{{ String(FEATURES.length).padStart(2, '0') }}</i></span>
                  <span class="sheet__tag">{{ card.tag }}</span>
                </p>

                <!-- 中：标题、副名、介绍与要点在中间分布 -->
                <div class="sheet__text">
                  <!-- 功能名做眉标：先说"这是什么"，再给主张。
                       原来它在标题下面、还占 18px，比说明还大，两头抢戏。 -->
                  <p class="sheet__name">{{ card.name }}</p>
                  <h2 :id="i === 0 ? 'sheet-title' : undefined" class="sheet__title">{{ card.headline }}</h2>

                  <!-- 说明与下面三条要点说的是同一件事，展开层只留要点 -->
                  <ul class="sheet__points">
                    <li v-for="line in card.points" :key="line" class="sheet__point">{{ line }}</li>
                  </ul>
                </div>

                <!-- 底：参数小片贴底 -->
                <ul class="sheet__specs">
                  <li v-for="spec in card.specs" :key="spec" class="sheet__spec">{{ spec }}</li>
                </ul>
              </div>

              <!-- 右栏：实机界面，高度铺满整张卡片 -->
              <figure class="sheet__plate">
                <img
                  class="sheet__shot"
                  :src="card.plate"
                  :alt="`${card.name} 实机界面`"
                  decoding="async"
                  draggable="false"
                />
                <figcaption class="sheet__caption">实机界面</figcaption>
              </figure>
            </div>
          </article>
        </CardSwap>

        <!-- 卡片组下方的一句提示：这摞牌可以拖，但画面上没有任何线索说得出这件事。
             位置跟着"当前这张卡的下边缘"走（脚本算好的 --sheet-card-bottom）。 -->
        <p class="sheet__hint">拖动卡片试试吧</p>

        <button
          ref="closeBtn"
          class="sheet__close"
          type="button"
          aria-label="关闭"
          :style="{ color: closeInk }"
          @click="closeFeature"
        >
          <i-lucide-x width="18" height="18" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 尺寸全部落在类型尺度与间距 token 上：
 * 字号 12 / 14 / 18 / 20 / 36；间距 4 / 8 / 16 / 24 / 32 / 40 / 48 / 96；
 * 圆角 16 / full。缺省值一律 snap 到最近的 token。 */
.fp {
  /* 白纸家族：三档白、三档墨。层次只靠留白与一根发丝线 */
  --paper: #ffffff;
  --paper-2: #fbfbfd;
  --paper-3: #f5f5f7;
  --ink: #1d1d1f;
  --ink-2: #6e6e73;
  --ink-3: #86868b;
  --hair: rgba(0, 0, 0, 0.065);
  --hair-soft: rgba(0, 0, 0, 0.04);
  --cta: #1d1d1f;
  --cta-hover: #3a3a3c;
  --radius: 24px;
  --gap: 24px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);

  /* ── 字重刻度 ────────────────────────────────────────────────
   * CSS Fonts 4 允许 font-weight: 1–1000 的任意整数；本页挂的 Noto Sans SC
   * Variable 真正支持 100–900 的可变轴，所以每个数字都会渲染成不同的笔画粗细，
   * 而不是被吸附到最近的一档静态字重。
   *
   * 用法约定：一档一个语义，页面里只引用变量，不写裸数字。
   * 整条刻度整体上抬 150，压在 450–870 这一段：正文也带重量，标题逼近字体轴上限。
   * 字体轴 100–900，所以 870 是还能渲染出真实笔画的最大档；
   * 880–1000 会被钳到 900，留作以后的极粗装饰字。 */
  --w-foot: 450; /* 页脚 */
  --w-muted: 470; /* 计数单位（项能力） */
  --w-body: 530; /* 左栏说明 */
  --w-desc: 570; /* 卡片介绍 */
  --w-label: 610; /* 图上小标签 */
  --w-num: 650; /* 计数数字 */
  --w-button: 710; /* 按钮文字 */
  --w-strong: 770; /* 卡片名称 */
  --w-title: 810; /* 卡片主标题 */
  --w-hero: 870; /* 页面标题 */
  --sans: 'Noto Sans SC Variable', 'HarmonyOS Sans SC', system-ui, sans-serif;

  height: 100dvh;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
}

/* ===== 底图 =====
 * 插画留作"环境"，不是第二张画面。
 * 之前只给 3px 模糊：人物、爆炸、火光全都看得清，在卡片后面一起吵，
 * 整页像把便利贴糊在一张照片上。现在磨到只剩色块，再压一层纸色，
 * 背景退成底纹，卡片才有资格浮在前面。
 *
 * 但磨得过头就是另一样东西：18px 的模糊配 saturate(.5) 已经把颜色抽干，
 * 再叠 0.68 的米白，整页泛成一层灰雾。现在收到 11px，彩度留回来一些，
 * 纸色罩降到 0.42 —— 底纹还在，但不发白。 */
.fp__bg {
  position: fixed;
  z-index: 0;
  inset: -24px;
  background-image: var(--backdrop);
  background-position: 62% 40%;
  background-size: cover;
  filter: blur(5px) saturate(0.88) brightness(1.01);
  pointer-events: none;
}

/* 纸色罩：让底图与卡片的纸面是同一个色系，而不是隔着两种白 */
.fp__bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(247, 243, 234, 0.42);
}

/* 左边给导航坞让路：胶囊占 16 + 56 ≈ 72px，再留 24px 空隙 */
.fp__inner {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: clamp(196px, 14vw, 232px) minmax(0, 1fr);
  column-gap: 40px;
  align-items: stretch;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  /* 上下不留内边距：滚动区一直铺到屏幕边缘，卡片才不会被一条看不见的带子挡住。
   * 首屏的 96px 让位改由左栏与滚动容器各自的 padding-top 承担，
   * 所以标题和第一张卡的起始位置一点没动。 */
  padding: 0 40px 0 max(96px, calc(var(--dock-gutter, 0px) + 80px));
}

/* ===== 左栏 =====
 * 一条竖版刊头：刊头小字 → 大标题 → 一句导语 → 八行目录 → 页脚。
 * 目录是这次新加的 —— 原来这条白玻璃从上到下只有三行字，下半截全是空的，
 * 看着像没做完的侧边栏。加上目录之后它既是导航，又有内容把高度填起来。 */
.fp__head {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* 撑满整栏：玻璃底板一路推到底，与右栏卡片墙等高 */
  align-self: stretch;
  height: 100%;
  /* 玻璃顶边与右栏卡片同为 88，内容从 116 起 —— 顶 28、
   * 底 30 的内边距，四周才不是贴着玻璃边写字 */
  padding: 116px 0 30px;
}

/* 底板：一层真的磨砂，不是一块死白。
 * backdrop-filter 让底图在玻璃后面留下一层色雾，左栏才像玻璃而不是贴纸；
 * 左右各外扩 20px，文字位置一点没动。 */
.fp__head::before {
  content: '';
  position: absolute;
  /* 顶边 88 与右栏第一张卡齐平；左右各外扩 26，
   * 于是文字距玻璃左缘正好 26，与圆角同一把尺子 */
  inset: 88px -26px 20px;
  z-index: -1;
  border-radius: 26px;
  corner-shape: squircle;
  background: rgba(255, 253, 250, 0.62);
  backdrop-filter: blur(26px) saturate(1.35);
  -webkit-backdrop-filter: blur(26px) saturate(1.35);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.72),
    0 24px 60px -40px rgba(29, 29, 31, 0.4);
}

/* 刊头小字：给这条竖栏一个"栏目"的身份，压在大标题上面 */
.fp__mark {
  margin: 0 0 14px;
  font-size: 11px;
  line-height: 16px;
  font-weight: 640;
  letter-spacing: 0.16em;
  color: rgba(29, 29, 31, 0.44);
}

/* Heading 3：32 / 38，两行手工断句 */
.fp__title {
  margin: 0;
  font-size: 32px;
  font-weight: var(--w-hero);
  line-height: 38px;
  letter-spacing: -0.025em;
  color: var(--ink);
}

.fp__lede {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: var(--w-body);
  color: var(--ink-2);
  text-wrap: pretty;
}

/* 目录上方那行计数：一条发丝线把导语与目录分开 */
.fp__count {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 22px 0 0;
  padding-top: 14px;
  border-top: 1px solid rgba(29, 29, 31, 0.11);
  font-size: 11px;
  line-height: 16px;
  font-weight: var(--w-muted);
  letter-spacing: 0.06em;
  color: var(--ink-3);
}

.fp__count b {
  font-size: 18px;
  line-height: 24px;
  font-weight: var(--w-num);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.fp__foot {
  /* auto 把页脚顶到这块玻璃的最底，中间那段留白就是"呼吸" */
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(29, 29, 31, 0.1);
  font-size: 11px;
  line-height: 16px;
  font-weight: var(--w-foot);
  color: var(--ink-3);
}

.fp__foot p {
  margin: 0;
}

.fp__foot-hint {
  color: rgba(29, 29, 31, 0.42);
}


/* ===== 顶部雾化 =====
 * 卡片滚到列表起始位置之上时不再被硬裁一刀：越往上越糊。
 * window 只做定位锚点，雾贴在它身上（不随内容滚动）；
 * mask 把模糊强度从底往顶递增，底部完全透明，所以接缝看不出来。 */
.fp__window {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* 撑满 grid 行，滚动区的高度才有确定值可依 */
  min-height: 0;
  height: 100%;
}

.fp__fog {
  /* 只盖右栏：挂在 .fp__window 上（absolute），不碰左栏刊头。
   * 原来用 fixed 横贯整个视口，滚动时会把左栏的「NATB · 功能清单」一起糊掉，
   * 所以那版只能把遮罩做得很轻 —— 结果卡片文字照样从顶栏胶囊底下透出来。
   * 收进右栏之后才敢把遮罩做实：模糊 14px + 一层纸色渐变，滚上去的内容真的消失了。
   *
   * 高度 132 盖得住一整排卡；但它默认透明，
   * 只有滚动之后才淡入（.is-on 由 maybeAppend 切换）——
   * 首屏第一排卡的顶边就在这个高度以内，常驻的雾会把它自己头顶糊掉。 */
  /* 左右各外扩 30：柔化区因此落在卡片墙之外，卡片边缘不会漏出半个字形 */
  position: absolute;
  inset: 0 -30px auto;
  height: 96px;
  z-index: 2;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms var(--ease);
  /* 消除文字靠 blur，不靠盖色块：
   * 之前既叠 mask 又用 0.9 的纸色，遮罩只剩六成，文字照样从顶栏底下透出来；
   * 反过来把纸色堆到不透明，顶部又变成一块死白的板子，跟底图差得太远。
   * 现在 blur 给到 26（文字糊成色块就够），纸色只留很薄一层压住反光，
   * 再加一点提亮 —— 看起来是"卡片化开了"，不是"上面贴了一张纸"。 */
  background: linear-gradient(
    to top,
    rgba(247, 243, 234, 0) 0%,
    rgba(247, 243, 234, 0.14) 40%,
    rgba(247, 243, 234, 0.3) 100%
  );
  backdrop-filter: blur(24px) saturate(0.92);
  -webkit-backdrop-filter: blur(24px) saturate(0.92);
  /* 四边柔化：blur 在元素的边界上是"咔嚓"断掉的，不处理会在顶部留下一块
   * 带亮边和模糊边的白色板子。左右各留 30，底部留 52 让它渐隐到没有。 */
  mask-image:
    linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%),
    linear-gradient(to top, transparent 0, #000 52px, #000 100%);
  -webkit-mask-image:
    linear-gradient(to right, transparent 0, #000 30px, #000 calc(100% - 30px), transparent 100%),
    linear-gradient(to top, transparent 0, #000 52px, #000 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

.fp__fog.is-on {
  opacity: 1;
}

/* 底部雾化：与顶部同款，方向镜像。卡片滚到下沿时是"化开"，不是被切一刀。
 * 挂在 .fp__window 上而不是 fixed —— 全宽 fixed 会把左栏页脚一起糊掉。 */
.fp__fade {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 2;
  height: 92px;
  pointer-events: none;
  backdrop-filter: blur(9px) saturate(0.98);
  -webkit-backdrop-filter: blur(9px) saturate(0.98);
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.45) 52%, #000 100%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.45) 52%, #000 100%);
}

/* 窄屏没有固定的滚动区，这层雾没有意义 */
@media (max-width: 900px) {
  .fp__fade {
    display: none;
  }
}

/* ===== 瀑布流：独立滚动容器 =====
 * 滚动条整条隐藏（Firefox 用 scrollbar-width，WebKit 用伪元素），
 * 容器自身不做页面滚动，滚到底前由 JS 继续补卡，所以永远触不到底。 */
.fp__body {
  /* 高度交给 flex 分配，padding 用 border-box 收进盒子里：
   * 之前 content-box + height:100% 会让盒子比窗口高出 168px（上 72 下 96），
   * 底部那一截连同最后一张卡的下沿被 .fp 的 overflow 裁掉 —— 就是划不动、看不到底的原因。 */
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: auto;
  /* 上让位 88：压过 84 的雾化带，首屏第一排卡不被糊；
   * 这段留白随内容一起滚走，第一张卡之后就能贴到屏幕顶 */
  padding-top: 88px;
  /* 底部留白：滚到最后一行时卡片与屏幕底之间还有一段呼吸 */
  padding-bottom: 96px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* 卡片那圈 1px 发丝线是 box-shadow，会溢出盒子，留一条缝免得被裁 */
  padding-right: 8px;
  margin-right: -8px;
  /* 容器自己不做遮罩：顶部的雾由外层 .fp__fog 负责（贴在不动的 window 上，
   * 所以它盖住的是"滚上去的那一段"，而不是内容里的某个位置）。
   * 内边距不动，所以第一张卡的起始位置与加雾之前完全一致。 */
}

.fp__body::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 容器可以拿到键盘焦点（翻页键落在它身上），焦点圈向内描，不向两侧撑出线来 */
.fp__body:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: -2px;
}

/* 列数由 JS 决定，同时写进 --cols，两边永远一致 */
.fp__cols {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
  gap: var(--gap);
  align-items: start;
}

.fp__col {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

/* ===== 卡片 =====
 * 两层结构：上面是画面，下面是纸面。
 *
 * 丑的根源不在留白与字号，在于八张封面来自八个不同的素材站 ——
 * 扁平矢量、3D 玻璃、品牌横幅、彩色渐变，各说各话。
 * 重画素材不现实，所以这里用"染色"把它们收编：
 *   ① .tile__img   先去饱和（saturate .45），把各自的艳度砍到同一个尺度；
 *   ② .tile__wash  再按卡片自己的 --tint 做 soft-light 重染，只改色相与中间调，
 *                  明暗关系留着，图还认得出是锁、是立方体、还是手表界面。
 * 两层之后八张图落进同一套色温，看起来是一册图版，而不是一堆截图。
 *
 * 文字一律不压在图上：图上只留一枚实底角标（序号 + 分类），
 * 怎么染色都读得清；主张与说明落在纸面上，用墨色。
 */
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 超椭圆（squircle）圆角：曲率连续，四个角不再是四分之一圆 */
  border-radius: var(--radius);
  corner-shape: squircle;
  /* 卡片底色就是这张卡的主题色与白纸按 58:42 调开 —— 有色纸，不是色卡 */
  background: color-mix(in oklab, var(--tint, var(--paper-3)) 68%, #ffffff);
  /* 三段阴影：发丝线定边界、近距离一层薄影、远处一层大扩散。
   * 不要中等强度的均匀阴影 —— 那正是"廉价塑料卡"的味道。 */
  box-shadow:
    0 0 0 1px rgba(29, 29, 31, 0.05),
    0 2px 4px rgba(29, 29, 31, 0.05),
    0 24px 48px -28px rgba(29, 29, 31, 0.34);
  animation: tile-in 380ms var(--ease) both;
  animation-delay: calc(var(--i) * 26ms);
  transition:
    box-shadow 260ms var(--ease),
    transform 260ms var(--ease);
  isolation: isolate;
}

/* 只抬 2px：卡片是一张纸，掀起来一点就够，不做弹跳 */
.tile:hover {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 1px rgba(29, 29, 31, 0.07),
    0 2px 4px rgba(29, 29, 31, 0.05),
    0 28px 56px -30px rgba(29, 29, 31, 0.36);
}

.tile:has(.tile__hit:focus-visible) {
  transform: translateY(-2px);
}

/* 只淡入：卡片不飘、不缩 */
@keyframes tile-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ===== 画面 ===== */
.tile__stage {
  position: relative;
  overflow: hidden;
  /* 宽度对齐卡片，高度由画面自己撑开 —— 不锁比例、不裁切。
   * 八张封面本来的比例就不一样（正方形、16:9、超宽横幅都有），
   * 让它照自己的样子长，卡与卡之间才有真正的高度差。 */
  isolation: isolate;
  background: color-mix(in oklab, var(--tint, var(--paper-3)) 70%, #b9b2a6);
}

.tile__img {
  display: block;
  width: 100%;
  /* 高度自适应：按这张图本来的宽高比撑开，不裁也不拉 */
  height: auto;
  /* ① 去饱和：八张图唯一的共同尺度就是"都别那么艳" */
  filter: saturate(0.72) contrast(1.12) brightness(0.99);
  transition:
    transform 620ms var(--ease),
    filter 620ms var(--ease);
}

/* hover 时才把颜色与尺寸放回来一点，让"看图"变成一个有回报的动作 */
.tile:hover .tile__img {
  transform: scale(1.035);
  filter: saturate(0.95) contrast(1.1) brightness(1);
}

/* ② 重染：soft-light 只动色相与中间调，明暗与构图原样保留 */
.tile__wash {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--tint, #f0dfd0);
  mix-blend-mode: soft-light;
  opacity: 0.78;
  pointer-events: none;
}

/* ③ 图片渐变成主题色 —— 染色，不是压暗。
 *
 * 整张卡只有一条明度线：图片（去饱和、被 tint 洗过色）→ 往下渐渐变成这张卡
 * 的主题色纸 → 纸面接着同一个颜色继续走。没有暗带、没有黑块、没有封条，
 * 图和纸是同一种材料的两段。
 *
 * 底部那一档与 .tile__body 的底色用的是同一个表达式（68% tint + #fdfaf5），
 * 所以交界处颜色一模一样，接缝看不出来。
 *
 * 文字因此必须是墨色 —— 底色一直是浅的，白字在这里一寸都读不出来。 */
.tile__veil {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    to top,
    /* 底部 5% 与纸面完全同色，接缝因此不存在 */
    color-mix(in oklab, var(--tint, #f0dfd0) 68%, #fdfaf5) 0%,
    color-mix(in oklab, var(--tint, #f0dfd0) 68%, #fdfaf5) 5%,
    /* 从这里开始换成"带透明度的主题色"：一边染色一边让画面透上来。
     * 标题两排字落在 6%–26% 这一段，那里的主题色还有八成多，
     * 图的内容透出两成 —— 读起来是"字压在图里"，不是"字坐在纸上"。 */
    color-mix(in srgb, var(--tint, #f0dfd0) 72%, transparent) 16%,
    color-mix(in srgb, var(--tint, #f0dfd0) 42%, transparent) 32%,
    color-mix(in srgb, var(--tint, #f0dfd0) 16%, transparent) 48%,
    color-mix(in srgb, var(--tint, #f0dfd0) 4%, transparent) 62%,
    transparent 76%
  );
}

/* 角标：实底小签，压在任何一套染色上都一样清楚 */
.tile__badge {
  position: absolute;
  top: 13px;
  left: 13px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 9px 4px 9px;
  border-radius: 8px;
  background: rgba(20, 20, 22, 0.58);
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  font-size: 10px;
  line-height: 14px;
  letter-spacing: 0.09em;
  color: rgba(255, 255, 255, 0.96);
}

.tile__badge b {
  font-weight: 620;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.tile__badge i {
  font-style: normal;
  font-weight: 660;
}

/* 标题块：压在画面底部，与角标同处一层。
 * 这里不再需要给压暗层让位 —— 底色是浅的，字是墨的，怎么叠都读得清。 */
.tile__caption {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 3;
  padding: 14px 18px 16px;
  color: var(--ink);
}

.tile__body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  /* 标题搬到图上之后这里只剩两样东西，上下各 16 就够。
   * 底色与 veil 的起手色是同一个表达式（68% tint + #fdfaf5），
   * 所以图与纸之间没有接缝 —— 不需要任何承接渐变来打补丁。 */
  padding: 16px 20px 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 46%),
    color-mix(in oklab, var(--tint, var(--paper-3)) 68%, #fdfaf5);
}

.tile__eyebrow {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  font-weight: 640;
  letter-spacing: 0.13em;
  /* 主题色的深版：带一点这张卡的色倾向，又压得住下面那层淡彩 */
  color: color-mix(in oklab, var(--tint, var(--paper-3)) 24%, #1d1d1f);
}

.tile__headline {
  margin: 4px 0 0;
  font-size: 20px;
  line-height: 26px;
  font-weight: 800;
  letter-spacing: -0.018em;
  color: #141416;
  text-wrap: balance;
}

.tile__desc {
  flex: 1 1 auto;
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 19px;
  font-weight: 520;
  color: #5c5955;
  text-wrap: pretty;
  /* 至少两行：卡片高度因此更接近，三列瀑布流不会一条腿长一条腿短 */
  min-height: 38px;
}

/* 动作行：一条发丝线把它和说明分开，推荐语在左、动作在右 */
.tile__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 0;
  padding-top: 12px;
  border-top: 1px solid rgba(29, 29, 31, 0.09);
}

.tile__kicker {
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.07em;
  color: rgba(29, 29, 31, 0.42);
}

/* 动作不再是白色小胶囊：那是表单按钮的形状。
 * 卡里只留一个"查看 →"，箭头在 hover 时右移。 */
.tile__cta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 720;
  letter-spacing: 0.02em;
  color: #141416;
}

.tile__arrow {
  transition: transform 240ms var(--ease);
}

.tile:hover .tile__arrow {
  transform: translateX(3px);
}

/* ===== 热区 =====
 * 整张卡都是按钮：视觉动作只有右下那一个"查看 →"，
 * 但可点面积覆盖全卡，点击目标远大于 44px，也不用把按钮做大。 */
.tile__hit {
  position: absolute;
  inset: 0;
  z-index: 4;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.tile__hit:focus-visible {
  outline: 2px solid #141416;
  outline-offset: -3px;
}

/* ===== 详情弹窗 =====
 * 遮罩压一层暗，卡片就是站里那套骨头：32 圆角、白底、一根发丝线。
 * 动效只有 320ms 的淡入与 8px 上浮，不弹跳、不缩放。 */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 2147483200;
  display: grid;
  /* safe center：卡片比视口大时从左上开始排，不会被居中裁掉一半。
   * clip 而不是 auto：卡片被拖出视口时只裁掉，不会在右侧/下侧冒出滚动条。 */
  place-items: safe center;
  padding: 24px;
  overflow: clip;
}

/* 弹窗打开时把背景"冻结"成一个现成的合成层：
 * 底图与卡片墙照旧看得见（被遮罩压暗一层），但不再每帧重新分层/栅格化 */
.fp.is-modal .fp__bg,
.fp.is-modal .fp__inner {
  will-change: transform;
  transform: translateZ(0);
  pointer-events: none;
}

.sheet__veil {
  position: absolute;
  inset: 0;
  /* 只压暗，不做 backdrop-filter：全屏实时模糊在卡片翻动时每帧重算，
   * 是这颗弹窗里最贵的一笔开销，去掉之后整页的合成压力立刻下来 */
  background: rgba(12, 13, 16, 0.62);
  animation: veil-in 220ms var(--ease) both;
}

/* stage 只做定位与定尺：宽高由脚本量好写进内联样式。
 * CardSwap 会自己算堆叠舞台，卡片溢出一截也无妨 —— .sheet 不裁。 */
.sheet__stage {
  position: relative;
  box-sizing: border-box;
  /* 出场：整摞卡从下方浮起。只动一个合成层（透明度 + 位移 + 微缩放），
   * 每张卡自己的 transform 由 CardSwap 单独管，两者不打架。 */
  animation: stack-in 620ms cubic-bezier(0.16, 0.84, 0.3, 1) both;
  will-change: transform, opacity;
}

@keyframes stack-in {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.972);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* CardSwap 的槽位默认自己裁圆、自带阴影；这里让位给卡片本身那套：
 * 32 圆角 + 超椭圆，阴影也由卡片自己画 */
/* 圆角与外阴影统一交给槽位：槽位自己裁圆，边缘永远干净；
 * 卡片不再自带阴影，就不会出现"外层被裁、内层阴影漏一条"的花边。 */
.sheet__stage :deep(.card-swap-slot) {
  border-radius: 32px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px rgba(29, 29, 31, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 48px 96px -48px rgba(0, 0, 0, 0.5),
    /* 光感边缘（外圈）：一张卡自身 overflow:hidden，向外的阴影会被自己裁掉，
     * 所以这层光必须画在槽位上。1.5px 的薄白光定边，外面再裹一圈暖白光晕，
     * 压在深色遮罩上就是"卡片边缘在发光"。 */
    0 0 0 1.5px rgba(255, 255, 255, 0.9),
    0 0 0 3px rgba(255, 250, 240, 0.2),
    0 0 34px -4px rgba(255, 244, 224, 0.8);
  /* trace 里每帧都出现一次 Layerize + 一批 RasterTask：
   * 卡片没有自己的合成层，gsap 每帧改 transform 就只能重新分层、重新栅格化。
   * 提成独立层后，位移/缩放走 GPU 合成，栅格化只在首次发生。 */
  will-change: transform;
  backface-visibility: hidden;
}

/* 后层卡照常显示内容，只把阴影收成发丝线，别盖住前面那张的边界 */
.sheet__stage :deep(.card-swap-slot:not([data-front])) {
  box-shadow: 0 0 0 1px rgba(29, 29, 31, 0.1);
}

.sheet__card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* 放大后这张卡片用普通圆角：尺寸一大，超椭圆的收角就显眼了 */
  border-radius: 32px;
  background: var(--paper);
  /* 阴影由外层槽位负责（见 .sheet__stage :deep(.card-swap-slot)） */

  /* 三次重算只影响这张卡：
   * CardSwap 每帧改 transform，样式重算本来会顺带扫到整棵子树；
   * contain 把 layout / style / paint 的作用域圈在卡片内部。 */
  contain: layout style paint;
}

/* ===== 光感边缘 =====
 * 分两层：卡片外面一圈光（挂在槽位上，绕开 overflow 裁剪），
 * 卡片里面一道内缘高光（顶亮底暗，有厚度）。
 *
 * 一开始试的是 1.5px 渐变描边 + mask 挖空 —— 在这张卡上没出来，
 * 换成纯 box-shadow 之后才稳：不依赖 mask 合成，也不占布局。 */
.sheet__card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    /* 一圈极淡的整边：让卡片有"包边" */
    inset 0 0 0 1px rgba(255, 255, 255, 0.8),
    /* 顶缘一道接近纯白的线：光从上方来 */
    inset 0 1px 0 #fff,
    /* 内侧柔光，往内 20px 渐隐 —— 卡片因此有厚度，不是一张贴纸 */
    inset 0 0 20px -6px rgba(255, 255, 255, 0.55),
    /* 底缘一道暗线，把光收住 */
    inset 0 -1px 0 rgba(9, 9, 11, 0.22);
}

/* ===== 左栏氛围底 =====
 * 用这张卡在小卡上的那张封面图做底：铺满左栏、糊掉、再用主题色压一层。
 * 大卡本来就是"从小卡展开来的"，左栏留着同一张图的余温，两层面板才算一张卡，
 * 而不是白纸上贴了一块彩色。
 *
 * 几个必要的处理：
 *   · inset 外扩 48px 并同量加宽 —— filter: blur() 会把边缘糊成透明，
 *     不外扩的话左栏四周会有一圈发白的硬边；
 *   · 向右渐隐的 mask —— 右栏是实机图，两块的接缝不能是一条竖直的直边；
 *   · 只铺左栏宽度（--sheet-body-w），右栏的图不能被它盖住。 */
.sheet__card::before {
  content: '';
  position: absolute;
  inset: -48px auto -48px -48px;
  width: calc(var(--sheet-body-w, 400px) + 96px);
  background-image: var(--cover, none);
  background-size: cover;
  background-position: center;
  filter: blur(8px) saturate(1.2) brightness(1.01);
  mask-image: linear-gradient(to right, #000 0 72%, transparent 98%);
  -webkit-mask-image: linear-gradient(to right, #000 0 72%, transparent 98%);
  pointer-events: none;
}

/* 两栏都锁在卡片高度里：右栏才有了"整高"这根参照线 */
.sheet__grid {
  position: relative;
  z-index: 1;
  display: grid;
  /* 左栏按卡片尺子给固定值，剩下的全给图片，右栏才能撑成一整块 */
  grid-template-columns: minmax(280px, 400px) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* 左栏底色：主题色与白纸五五调开，落在"有色纸"上而不是一块饱和色。
 * 内容自上而下依次排；参数沉底（margin-top:auto），中间那片留白是呼吸，
 * 不是被 space-between 拉开的三份东西。 */
.sheet__body {
  display: flex;
  flex-direction: column;
  /* 三段：眉标贴左上、参数贴下沿，中间的标题与正文自己分布 */
  justify-content: space-between;
  gap: 0;
  min-height: 0;
  padding: 28px;
  /* 主题色 + 白纱，两层的透明度加起来约 0.75：
   * 底下的模糊封面还读得出色块走向，正文压在上面也够清楚。
   * 全不透明就白瞎了那层图，太透则标题会陷进花纹里。 */
  /* 主题色薄薄压一层就够了：白纱几乎撤掉，只留一线，防止封面高光把标题顶没。
   * 泛白正是前一版白纱 24% 压出来的 —— 图被糊成雾，看着像蒙了层脏玻璃。 */
  background:
    linear-gradient(180deg, rgba(253, 250, 245, 0.1), rgba(253, 250, 245, 0.03)),
    color-mix(in oklab, var(--tint, var(--paper-3)) 34%, transparent);
  /* 文字比窗格高时自己滚，卡片与右栏图片都不动。
   * 滚动条只在溢出时出现，细一条，压在主题色上也读得出来；
   * gutter 预留固定宽度，出现/消失时正文不会横向跳一下。 */
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(29, 29, 31, 0.26) transparent;
  scrollbar-gutter: stable;
}

.sheet__text {
  display: flex;
  flex-direction: column;
  /* 眉标与标题靠得近（6 由标题自己的 margin 给），
   * 标题与要点之间拉开一档 22 —— 两段不同的信息 */
  gap: 22px;
  margin: auto 0;
  padding: 20px 0 8px;
}

/* 眉标与标题是一组：标题自身的 margin 负责它们之间的 6，
 * 所以这一组与下面的要点之间才是 22 */
.sheet__name {
  margin-bottom: -16px;
}

.sheet__body::-webkit-scrollbar {
  width: 6px;
}

.sheet__body::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgba(29, 29, 31, 0.26);
}

.sheet__body::-webkit-scrollbar-track {
  background: transparent;
}

/* 标题是这一栏唯一的主角：36px，与眉标之间只留 6。
 * 38 在这个栏宽下会让九字标题顶到右缘，36 才留得住那点边距 */
/* 标题是这一栏唯一的主角：38px，与眉标之间只留 6 */
.sheet__title {
  margin: 6px 0 0;
  font-size: 38px;
  line-height: 46px;
  font-weight: var(--w-title);
  letter-spacing: -0.025em;
  color: var(--ink);
  text-wrap: balance;
}

/* 眉标：13px + 宽字距，压在标题上方。带一点这张卡的主题色，
 * 但压得够深，不至于跟下面的标题抢注意力 */
.sheet__name {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 660;
  letter-spacing: 0.14em;
  color: color-mix(in oklab, var(--tint, var(--paper-3)) 26%, #1d1d1f);
}

/* 展开层不再显示说明（与下面的要点重复），样式留着备用 */
.sheet__desc {
  margin: 0;
  font-size: 15px;
  line-height: 24px;
  font-weight: var(--w-desc);
  color: var(--ink-2);
  text-wrap: pretty;
}

/* 眉标：序号 / 总项 · 标签 · 推荐语，一行三段，靠间距分开 */
.sheet__eyebrow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--ink-3);
}

.sheet__index b {
  font-size: 16px;
  font-weight: var(--w-strong);
  color: var(--ink);
}

.sheet__index i {
  font-style: normal;
  opacity: 0.72;
}

.sheet__tag {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  line-height: 18px;
  font-weight: var(--w-label);
  letter-spacing: 0.06em;
  color: var(--ink-2);
}

/* 要点：三行正文，行间用一根发丝线分开 —— 不用圆点，圆点会让它读成列表项，
 * 线让它读成同一段话的三句。 */
.sheet__points {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 要点：15px。原来 18px 配 28 行高，三条就要吃掉一百多像素，
 * 展开层最该呼吸的地方全被它占满了 */
.sheet__point {
  padding: 13px 0;
  border-top: 1px solid rgba(29, 29, 31, 0.09);
  font-size: 15px;
  line-height: 24px;
  font-weight: var(--w-body);
  color: var(--ink);
}

/* 最后一条下面不留行内 padding：正文到分隔线之间只隔中间块自己的 16 */
.sheet__point:last-child {
  padding-bottom: 0;
}

/* 参数：三枚小片，压在这一栏最底 */
.sheet__specs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 16px 0 0;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
  list-style: none;
}

.sheet__spec {
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.66);
  font-size: 12.5px;
  line-height: 18px;
  font-weight: var(--w-label);
  color: var(--ink-2);
}

/* 实机界面 */
/* 右栏：高度铺满整张窗格，上下不留白 */
.sheet__plate {
  position: relative;
  height: 100%;
  min-height: 0;
  margin: 0;
  overflow: hidden;
  background: var(--paper-3);
}

.sheet__shot {
  display: block;
  width: 100%;
  height: 100%;
  /* 图片不接管指针：不然按住图拖，动的是浏览器原生的图片拖拽，卡片纹丝不动 */
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
  /* 高度钉死 100%：图按比例放大到占满整格，多出来的宽度左右各裁一点，
   * 上下永远不会出现留白 */
  object-fit: cover;
  object-position: center;
}

/* 图注压成画面左下角的一枚小签 */
.sheet__caption {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-foot);
  letter-spacing: 0.04em;
  color: var(--ink-2);
}

/* 窄屏：卡片转成竖版，文字在上、图在下，堆叠尺寸由脚本另算 */
@media (max-width: 719px) {
  .sheet__stage :deep(.card-swap-slot),
  .sheet__card {
    border-radius: 24px;
  }

  /* 竖版是"文字在上、图在下"，氛围底要铺满整张卡的宽度 */
  .sheet__card {
    --sheet-body-w: 100%;
  }

  .sheet__grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100%;
  }

  .sheet__body {
    padding: 20px;
    overflow-y: auto;
  }

  .sheet__plate {
    height: auto;
    aspect-ratio: 16 / 10;
  }
}

/* 关闭键：通透玻璃丸，钉在窗格右上角。
 * 它挂在 frame 上而不是卡片里：卡片内容再长、再怎么滚，按钮都不会被滚走。
 * 玻璃本身几乎不挡底下的实机图：只折射 + 提亮一层，靠内圈高光定出边界，
 * 于是压在深色控制台或浅色界面上都读得出那个 ×。 */
/* 拖动提示：压在遮罩上的一句话，不用玻璃底板 —— 它只是提示，不是控件。
 * 白 66% 的墨色在 0.62 的暗遮罩上读得出来，又不会跟卡片抢注意力；
 * 拖完第一下就没用了，所以带一点延迟淡入，跟卡片组错开半拍。
 * 位置由脚本给（--sheet-card-bottom），跟着卡片下边缘走。 */
/* 卡片组整体抬一层，提示压在它下面。
 * 提示就挂在卡片下边缘外 18px，滚动或翻卡的瞬间两者会擦到边 ——
 * 抬起来之后擦到的那一下是卡片盖住提示，而不是提示浮在卡片上。 */
.sheet__stage :deep(.card-swap) {
  position: relative;
  z-index: 1;
}

.sheet__hint {
  position: absolute;
  z-index: 0;
  top: calc(var(--sheet-card-bottom, 100%) + 18px);
  left: 50%;
  margin: 0;
  padding: 6px 14px;
  border-radius: 9999px;
  transform: translateX(-50%);
  font-size: 12.5px;
  line-height: 17px;
  font-weight: var(--w-label, 560);
  letter-spacing: 0.07em;
  white-space: nowrap;
  /* 深色药丸而不是玻璃：它压着的是"遮罩 + 背景卡片"，底色明暗差得远，
   * 半透明白底在这种底上会化掉。深色衬底反而最稳，也不跟卡片抢。
   * 不加 backdrop-filter —— 它在卡片翻动时不动，没必要每帧重算一次模糊。 */
  background: rgba(20, 21, 25, 0.52);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.9);
  pointer-events: none;
  animation: hint-in 420ms var(--ease) 260ms both;
}

@keyframes hint-in {
  from {
    opacity: 0;
    transform: translate(-50%, 5px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

.sheet__close {
  position: absolute;
  /* 钉在"当前这张卡"的右上角，不是舞台右上角。
   * 舞台是包围盒，比卡片大一圈（右边是后层露出的错位、外面还有 32 的内边距），
   * 钉在舞台角上的话，大屏下按钮会飘到卡片外面一百多像素，看着像浮在遮罩上。
   * 这两个变量由 measureSheet() 按同一个包围盒算好写进来。 */
  top: calc(var(--sheet-close-y, 0px) + 14px);
  left: calc(var(--sheet-close-x, 100%) - 14px);
  transform: translateX(-100%);
  z-index: 3;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.18);
  /* 颜色由 openFeature 采完这块图的亮度后注入：亮底墨字、暗底白字 */
  color: var(--ink);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    0 1px 4px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(14px) saturate(1.5) brightness(1.32);
  -webkit-backdrop-filter: blur(14px) saturate(1.5) brightness(1.32);
  cursor: pointer;
  transition:
    background 200ms var(--ease),
    box-shadow 200ms var(--ease),
    color 200ms var(--ease);
}

.sheet__close:hover {
  background: rgba(255, 255, 255, 0.42);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 2px 8px rgba(0, 0, 0, 0.16);
}

.sheet__close:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

@keyframes veil-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet__veil,
  .sheet__card {
    animation: none;
  }

  /* 卡组的浮起对这块内容没有信息量，直接给最终态 */
  .sheet__stage {
    animation: none;
  }

  /* 提示只留最终态：淡入那 420ms 对这行字没有信息量 */
  .sheet__hint {
    animation: none;
  }
}

/* ===== 窄屏 =====
 * 900 以下退回文档流：左栏在上、卡片在下，滚动交给窗口，
 * 列数由 JS 按宽度改成 2 / 1，这里不再写死。 */
@media (max-width: 900px) {
  .fp {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .fp__inner {
    display: block;
    height: auto;
    padding: 0 24px 96px;
  }

  .fp__head {
    display: block;
    height: auto;
    padding: 104px 0 28px;
    margin-bottom: 32px;
  }

  .fp__foot {
    margin-top: 32px;
  }

  /* 玻璃底板在窄屏是「包住内容」而不是「撑满一栏」，底边不能再留 20 */
  .fp__head::before {
    inset: 88px -16px 0;
  }

  /* 提示语在窄屏是噪音：卡片一张张往下排，一眼就能点 */
  .fp__foot-hint {
    display: none;
  }

  .fp__mark {
    margin-bottom: 10px;
  }

  .fp__title {
    font-size: 34px;
    line-height: 40px;
  }

  .fp__title br {
    display: none;
  }

  .fp__count {
    margin-top: 16px;
    padding-top: 12px;
  }

  .fp__window {
    display: block;
    height: auto;
  }

  .fp__fog {
    display: none;
  }

  .fp__body {
    flex: none;
    height: auto;
    overflow: visible;
    padding-top: 0;
    padding-right: 0;
    margin-right: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tile {
    animation: none;
  }

  .tile__cta {
    transition: none;
  }
}
</style>
