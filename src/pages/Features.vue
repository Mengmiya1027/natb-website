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

import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

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
    ratio: '16 / 9',
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
    ratio: '4 / 3',
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
    ratio: '16 / 9',
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
    ratio: '4 / 3',
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
    ratio: '16 / 9',
  },
  {
    key: 'magisk',
    cover: 'magisk.webp',
    shot: 'magisk.webp',
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
    ratio: '4 / 3',
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
    ratio: '16 / 9',
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
const BACKDROP = import.meta.env.BASE_URL + 'images/features/backdrop.jpg'
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

const makeTile = (item, r) => {
  const index = FEATURES.findIndex((f) => f.key === item.key)
  const cover = COVER_DIR + item.cover
  const no = String(index + 1).padStart(2, '0')
  /* 主题色按"第几项功能"取，跟轮次无关：同一张卡滚到第几轮都是同一个颜色 */
  const tint = TINTS[index % TINTS.length]
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
  if (appending) return
  const el = bodyRef.value
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
  const n = colsFor(window.innerWidth)
  if (n === cols) return
  rebuild(n)
}

onMounted(async () => {
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
const active = ref(null)
const closeBtn = ref(null)

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
  active.value = item
  pickInk(item.plate)
  nextTick(() => closeBtn.value?.focus())
}

function closeFeature() {
  active.value = null
}

function onKeydown(event) {
  if (event.key === 'Escape' && active.value) closeFeature()
}
</script>

<template>
  <div class="fp">
    <div class="fp__bg" :style="{ '--backdrop': `url(${BACKDROP})` }" aria-hidden="true"></div>

    <div class="fp__inner">
      <!-- 左栏：窄窄一条，页眉钉在左上角 -->
      <header class="fp__head">
        <h1 class="fp__title">八项能力<br />一件不少</h1>
        <p class="fp__lede">一键 ROOT、离线升级、投屏控制，都在 NATB 里。</p>
        <p class="fp__count"><b>{{ FEATURES.length }}</b><span>项能力</span></p>
        <!-- 只有这两行沉到左栏最底 -->
        <footer class="fp__foot">
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
                '--cover': `url(${item.cover})`,
                '--tint': item.tint,
              }"
              :aria-labelledby="`tile-name-${item.uid}`"
            >
              <div class="tile__stage">
                <img
                  class="tile__img"
                  :src="item.cover"
                  :alt="`${item.name} 主视觉`"
                  decoding="async"
                />
                <div class="tile__scrim" aria-hidden="true"></div>
                <div class="tile__caption">
                  <p class="tile__kicker">{{ item.kicker }}</p>
                  <h2 class="tile__headline">{{ item.headline }}</h2>
                </div>
              </div>

              <div class="tile__body">
                <!-- 封面模糊成底，再压一层随明暗切换的薄光 -->
                <div class="tile__wash" aria-hidden="true"></div>
                <div class="tile__veil" aria-hidden="true"></div>
                <p class="tile__name" :id="`tile-name-${item.uid}`">{{ item.name }}</p>
                <p class="tile__desc">{{ item.desc }}</p>
                <button class="tile__cta" type="button" @click="openFeature(item)">查看</button>
              </div>
            </article>
          </div>
        </div>
        </div>

        <!-- 顶部雾化：贴着列表起始位置往上一段，越靠上越糊，到底部完全透明 -->
        <div class="fp__fog" aria-hidden="true"></div>
      </div>
    </div>

    <!-- 详情弹窗：一张白卡片，封面在上、文字在下 -->
    <div v-if="active" class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet__veil" @click="closeFeature"></div>

      <!-- frame 只负责定位：关闭键挂在这一层，卡片内部再怎么滚它都钉在右上角 -->
      <div class="sheet__frame">
        <article class="sheet__card" :style="{ '--tint': active.tint }">
          <div class="sheet__grid">
            <div class="sheet__body">
              <!-- 三段：标题组 / 说明与要点 / 参数。三段在竖向上均分，底部不再空一块 -->
              <header class="sheet__head">
                <p class="sheet__eyebrow">
                  <span class="sheet__index"><b>{{ active.no }}</b><i>/{{ String(FEATURES.length).padStart(2, '0') }}</i></span>
                  <span class="sheet__tag">{{ active.tag }}</span>
                </p>
                <h2 id="sheet-title" class="sheet__title">{{ active.headline }}</h2>
                <p class="sheet__name">{{ active.name }}</p>
              </header>

              <div class="sheet__text">
                <p class="sheet__desc">{{ active.desc }}</p>

                <!-- 要点：三条短句，左侧一枚小方点 -->
                <ul class="sheet__points">
                  <li v-for="line in active.points" :key="line" class="sheet__point">{{ line }}</li>
                </ul>
              </div>

              <!-- 参数：三枚小片，只放最硬的三条事实 -->
              <ul class="sheet__specs">
                <li v-for="spec in active.specs" :key="spec" class="sheet__spec">{{ spec }}</li>
              </ul>
            </div>

            <!-- 右栏：实机界面，高度铺满整张卡片，不留上下白边 -->
            <figure class="sheet__plate">
              <img class="sheet__shot" :src="active.plate" :alt="`${active.name} 实机界面`" decoding="async" />
              <figcaption class="sheet__caption">实机界面</figcaption>
            </figure>
          </div>
        </article>

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
  --radius: 32px;
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
 * 整页压在一张插画上，不模糊：画面要看得清。
 * 只在最上面压一层极淡的白（8%），把过曝的天空稍压一点，
 * 文字的可读性交给左栏那层白色光晕与卡片自己的底色去解决。
 * fixed + 视口满铺：滚动的是右栏，底图不动。 */
.fp__bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-image: var(--backdrop);
  background-position: 62% 40%;
  background-size: cover;
  /* 一点高斯：把插画的锐边磨掉，人物和爆炸还认得出 */
  filter: blur(3px) saturate(0.96);
  /* 向外多铺一圈，免得模糊后边缘透出底色 */
  inset: -16px;
  pointer-events: none;
}

.fp__bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.2);
}

/* 左边给导航坞让路：胶囊占 16 + 56 ≈ 72px，再留 24px 空隙 */
.fp__inner {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: clamp(152px, 11.5vw, 184px) minmax(0, 1fr);
  column-gap: 48px;
  align-items: stretch;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  /* 上下不留内边距：滚动区一直铺到屏幕边缘，卡片才不会被一条看不见的带子挡住。
   * 首屏的 96px 让位改由左栏与滚动容器各自的 padding-top 承担，
   * 所以标题和第一张卡的起始位置一点没动。 */
  padding: 0 40px 0 max(96px, calc(var(--dock-gutter, 0px) + 80px));
}

/* ===== 左栏 ===== */
.fp__head {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  height: 100%;
  /* 上 96 让开顶栏，下 32 不贴着视口底；标题的 y 与之前完全一致 */
  padding: 96px 0 40px;
}

/* 磨砂玻璃底板：底图深一块浅一块，纯文字压上去必然有一处读不清。
 * 玻璃只铺左栏，右栏的插画照旧看得见；左右各外扩 24px，文字位置一点没动。 */
.fp__head::before {
  content: '';
  position: absolute;
  inset: 72px -24px 16px;
  z-index: -1;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

/* Heading 3：36 / 40，两行手工断句，右缘对齐不孤字 */
.fp__title {
  margin: 0;
  font-size: 36px;
  font-weight: var(--w-hero);
  line-height: 40px;
  letter-spacing: -0.02em;
  color: var(--ink);
}

/* Body 3：16 / 24 */
.fp__lede {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: var(--w-body);
  color: var(--ink-2);
  text-wrap: pretty;
}

/* Caption 4 + Title 1 */
.fp__count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--hair-soft);
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-muted);
  color: var(--ink-3);
}

.fp__count b {
  font-size: 20px;
  line-height: 28px;
  font-weight: var(--w-num);
  letter-spacing: -0.01em;
  color: var(--ink);
}

.fp__foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 左栏是 flex column + 满高，auto 把这两行顶到最底，其余内容留在标题下面 */
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--hair-soft);
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-foot);
  color: var(--ink-2);
}

.fp__foot p {
  margin: 0;
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
  /* fixed 让它脱离右栏，横贯整个视口（左右都贴到视口边），
   * 同时天然不随内容滚动：盖住的永远是"页面顶部那一条"。
   * 起始线仍是 116px，顶上不留清晰的火柴头。 */
  position: fixed;
  inset: 0 0 auto 0;
  height: 116px;
  z-index: 2;
  pointer-events: none;
  backdrop-filter: blur(10px) saturate(0.98);
  -webkit-backdrop-filter: blur(10px) saturate(0.98);
  mask-image: linear-gradient(to top, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 55%, #000 100%);
  -webkit-mask-image: linear-gradient(to top, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.5) 55%, #000 100%);
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
  /* 滚动容器的上让位与左栏玻璃顶边同为 72，两列顶边齐平；
   * 这段留白随内容一起滚走，第一张卡之后就能贴到屏幕顶 */
  padding-top: 72px;
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

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 超椭圆（squircle）圆角：曲率连续，四个角不再是四分之一圆 */
  border-radius: var(--radius);
  corner-shape: squircle;
  background: var(--paper);
  box-shadow: 0 0 0 1px var(--hair);
  animation: tile-in 380ms var(--ease) both;
  animation-delay: calc(var(--i) * 28ms);
}

/* 只淡入：卡片不飘、不缩、不抬起 */
@keyframes tile-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* ===== 封面 ===== */
.tile__stage {
  position: relative;
  overflow: hidden;
  aspect-ratio: var(--ratio, 16 / 9);
  background: var(--paper-3);
}

.tile__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 图偏浅、字是白的：底部一段渐变把标题托住 */
.tile__scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(9, 10, 12, 0) 44%, rgba(9, 10, 12, 0.12) 68%, rgba(9, 10, 12, 0.42) 100%),
    radial-gradient(90% 58% at 0% 100%, rgba(9, 10, 12, 0.18), rgba(9, 10, 12, 0) 74%);
}

.tile__caption {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0 16px 16px;
  color: #fff;
}

/* Caption 4：12 / 16 */
.tile__kicker {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-label);
  color: rgba(255, 255, 255, 0.84);
}

/* 卡片标题：18 / 24，最多两行 */
.tile__headline {
  margin: 0;
  font-size: 18px;
  font-weight: var(--w-title);
  line-height: 24px;
  letter-spacing: -0.012em;
  text-wrap: balance;
}

/* ===== 内容区 =====
 * 两种面孔只差这块底色：plain 白纸，tint 淡彩。
 * 没有应用图标，介绍独占整行；"查看"钉在右下角，
 * 因此介绍多长、卡片就多高，高度差落在瀑布流里正好错开。 */
/* ===== 内容区 =====
 * 底色是这张卡自己的主题色（--tint，八色之一），封面只做一层极淡的质感叠在上面。
 * 每张卡都必定有颜色：颜色来自数据，不看封面图长什么样。 */
.tile__body {
  position: relative;
  flex: 1 1 auto;
  padding: 16px 16px 48px;
  overflow: hidden;
  background: var(--tint, var(--paper-3));
  isolation: isolate;
}

.tile__wash {
  position: absolute;
  inset: -20px;
  background-image: var(--cover);
  background-position: center;
  background-size: cover;
  filter: blur(14px) saturate(1.08);
  opacity: 0.28;
  mix-blend-mode: soft-light;
  pointer-events: none;
  z-index: 0;
}

/* 一层同色的薄纱：把封面的杂色收回主题色里，颜色始终读得出来 */
.tile__veil {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--tint, var(--paper-3)) 76%, transparent);
  pointer-events: none;
  z-index: 1;
}

/* Body 4：14 / 20 */
.tile__name {
  position: relative;
  z-index: 2;
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 20px;
  font-weight: var(--w-strong);
  color: var(--ink);
}

/* Body 6：14 / 20 */
.tile__desc {
  position: relative;
  z-index: 2;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: var(--w-desc);
  color: var(--ink-2);
  text-wrap: pretty;
}

/* Button-Xsm：12 / 16，8 纵 12 横 */
.tile__cta {
  position: absolute;
  right: 16px;
  bottom: 16px;
  padding: 8px 12px;
  border: 0;
  border-radius: 9999px;
  background: var(--cta);
  color: #fff;
  font-family: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-button);
  z-index: 2;
  cursor: pointer;
  transition: background 200ms var(--ease);
}

.tile__cta:hover {
  background: var(--cta-hover);
}

.tile__cta:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

/* ===== 详情弹窗 =====
 * 遮罩压一层暗，卡片就是站里那套骨头：32 圆角、白底、一根发丝线。
 * 动效只有 320ms 的淡入与 8px 上浮，不弹跳、不缩放。 */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 2147483200;
  display: grid;
  place-items: center;
  padding: 24px;
}

.sheet__veil {
  position: absolute;
  inset: 0;
  background: rgba(12, 13, 16, 0.56);
  animation: veil-in 220ms var(--ease) both;
}

/* frame 只做定位与定尺：卡片与关闭键都挂在它身上，
 * 卡片内部滚不滚，关闭键的位置都不受影响。
 * 宽 = 图高 × 截图比例（2560×1504 ≈ 1.702）+ 左栏 380：
 * 宽屏下右栏正好是这张图的整块，图铺满高度且不裁；屏窄时才裁左右两侧。
 * 只占视口中段一小块：高不过 380，四周至少留 120。 */
.sheet__frame {
  --frame-h: min(380px, calc(100dvh - 240px));
  --shot-ratio: 1.702;

  position: relative;
  width: min(calc(var(--frame-h) * var(--shot-ratio) + 320px), calc(100vw - 240px));
  height: var(--frame-h);
}

.sheet__card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 32px;
  background: var(--paper);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.4),
    0 32px 80px -40px rgba(0, 0, 0, 0.6);
  animation: sheet-in 320ms var(--ease) both;
}

/* 两栏都锁在卡片高度里：右栏才有了"整高"这根参照线 */
.sheet__grid {
  display: grid;
  /* 左栏按卡片尺子给固定值，剩下的全给图片，右栏才能撑成一整块 */
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* 左栏底色就是这张卡的主题色：卡片是什么颜色，展开后还是那块颜色 */
.sheet__body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
  min-height: 0;
  padding: 24px 22px 20px;
  background: var(--tint, var(--paper));
  /* 文字比窗格高时自己滚，卡片与右栏图片都不动 */
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.sheet__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sheet__text {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sheet__body::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.sheet__title {
  margin: 0;
  font-size: 24px;
  line-height: 32px;
  font-weight: var(--w-hero);
  letter-spacing: -0.02em;
  color: var(--ink);
  text-wrap: balance;
}

.sheet__name {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: var(--w-strong);
  color: var(--ink);
}

.sheet__desc {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
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
  font-size: 12px;
  line-height: 16px;
  color: var(--ink-3);
}

.sheet__index b {
  font-size: 14px;
  font-weight: var(--w-strong);
  color: var(--ink);
}

.sheet__index i {
  font-style: normal;
  opacity: 0.72;
}

.sheet__tag {
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: var(--w-label);
  letter-spacing: 0.06em;
  color: var(--ink-2);
}

.sheet__kicker {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: var(--w-label);
  color: var(--ink-3);
}

/* 要点：小方点定位，行距比正文松一档 */
.sheet__points {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sheet__point {
  position: relative;
  padding-left: 16px;
  font-size: 14px;
  line-height: 20px;
  font-weight: var(--w-body);
  color: var(--ink);
}

.sheet__point::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 5px;
  height: 5px;
  border-radius: 2px;
  background: var(--ink-3);
}

/* 参数：三枚小片 */
.sheet__specs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sheet__spec {
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  line-height: 16px;
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
  padding: 2px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.84);
  font-size: 11px;
  line-height: 16px;
  font-weight: var(--w-foot);
  letter-spacing: 0.04em;
  color: var(--ink-2);
}

/* 窄屏：文字在上、图在下，图用自己的比例 */
@media (max-width: 719px) {
  .sheet__frame {
    width: 100%;
    height: auto;
    max-height: calc(100dvh - 48px);
  }

  .sheet__card {
    height: auto;
    max-height: inherit;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .sheet__card::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .sheet__grid {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .sheet__body {
    padding: 24px 24px 20px;
    /* 单列时卡片有多高就多高，三段之间不再硬撑 */
    justify-content: flex-start;
    overflow: visible;
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
.sheet__close {
  position: absolute;
  top: 14px;
  right: 14px;
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
    padding: 96px 0 0;
    margin-bottom: 32px;
  }

  .fp__foot {
    margin-top: 32px;
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
