<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TiltCard from '../components/3dcard.vue'
import GlowCard from '../components/glowcard.vue'
import InkSplatterCursor from '../components/Ink-Splatter-Cursor.vue'
import { useUpdateLog } from '@/utils/updateLog'

/**
 * 项目信息：内容逐字取自 natb.top「项目信息」页，一项不多、一项不少。
 * 编号（01–05）与分栏只是本页的排版手段：把五项摆成一份可扫读的信息清单，
 * 排版与视觉全部按项目既有基调来（暗色、等宽小字眉标、发丝线、克制的强调色）。
 */

// 项目全名取自截图的标签页标题「NATB - New Android Tool Box」，不算新增内容
const PROJECT = 'New Android Tool Box'

// label / value / badge 都来自截图；copy 表示可复制的原文，href 表示原文本身就是可去的地址
// latest: true 的那一行版本号不写死——由 public/json/UpdateLog.json 动态读入（见下方「最新版本」）
const BASE_ROWS = [
  { no: '01', label: '官网开发', value: '神 & 愿Wish' },
  { no: '02', label: 'NATB Cli版本', value: '', badge: 'stable', data: true, latest: true },
  { no: '03', label: 'QQ交流群', value: '496522811', copy: '496522811', data: true },
  {
    no: '04',
    label: '邮箱',
    value: 'taa2231486624@163.com',
    copy: 'taa2231486624@163.com',
    href: 'mailto:taa2231486624@163.com',
    data: true,
  },
  { no: '05', label: '官网', value: 'natb.top', href: 'https://natb.top', out: true, data: true },
]

/* ===== 最新版本（动态） =====
 * 版本号来自 public/json/UpdateLog.json 里 releases 的第一条（清单最新在前），
 * 与「更新日志」页同一份真源：换版本只改那个 JSON，这里一行代码都不用动。
 * 标签与 stable 徽标仍是本页自己的排版决定；
 * 三态各有说法（加载中 / 失败 / 就绪），五行结构一概不动，也不会为它换一套版式。
 */
const { status: logStatus, latest } = useUpdateLog()

// 本页惯例是首字母大写的 V（更新日志卡片那边是小写 v）：数据只存一份小写的，显示时在这里归一
const latestText = computed(() => {
  if (latest.value?.version) return latest.value.version.replace(/^v/i, 'V')
  if (logStatus.value === 'error') return '加载失败'
  return logStatus.value === 'ready' ? '—' : '加载中…'
})

const ROWS = computed(() => BASE_ROWS.map((row) => (row.latest ? { ...row, value: latestText.value } : row)))

// 这一行的文案会在三态之间换，字宽一变矮屏的自适应就得按新高度重量一次
watch(latestText, () => nextTick(scheduleFit))

const DISCLAIMER =
  '本工具仅供学习交流使用，ROOT有风险，操作需谨慎。使用本工具导致的任何后果由使用者自行承担，严禁用于非法用途。'
const TRADEMARK = 'imoo/小天才产品商标归广东小天才科技有限公司所有'

/* ===== 背景视频 =====
 * 雨打窗玻璃的实拍片段（Pexels 免费授权），已重压成 15.6s 无缝循环：
 * 1080p 给桌面、720p 给窄屏、一张海报兜住未就绪与少动效两种情况。
 * 走 base，子路径部署也取得到 public 下的片子。
 */
const POSTER = import.meta.env.BASE_URL + 'videos/rain-glass-poster.webp'
const VIDEO_LG = import.meta.env.BASE_URL + 'videos/rain-glass-1920.mp4'
const VIDEO_SM = import.meta.env.BASE_URL + 'videos/rain-glass-1280.mp4'

/* 视频只是锦上添花：少动效或开了省流量就只留海报，文字可读性从不依赖它 */
const allowVideo = ref(false)
const videoReady = ref(false)
const videoRef = ref(null)
let readyTimer = 0

/** 视频露面：事件与兜底定时器都走这里，撤掉定时器免得重复 */
function markVideoReady() {
  if (readyTimer) {
    clearTimeout(readyTimer)
    readyTimer = 0
  }
  videoReady.value = true
}

/** 标签页藏起来就暂停：背景视频没必要在后台烧电 */
function onVisibility() {
  const el = videoRef.value
  if (!el) return
  if (document.hidden) el.pause()
  else el.play?.().catch(() => {})
}

/* ===== 滚动锁 =====
 * 本页要"整页不可滚动"：锁挂在 html 上，但只在挂载期间存在，
 * 离开这个页面立刻摘掉——别的页面不与它共享这份约束。
 */
const SCROLL_LOCK = 'is-info-locked'

/* ===== 高度自适应 =====
 * 页面不可滚动，矮屏就只剩两条路：裁掉一块，或者自己让位。这里选让位：
 * 量出版心加卡片的自然高度与可用高度，按比例收一个 --fit，
 * 纵向尺寸（字号、行距、内外边距）统统吃这个系数，几趟就收敛到一屏装下。
 * 屏幕够高时 --fit 一直是 1，等于什么都没做。
 */
const rootRef = ref(null)
const FIT_MIN = 0.58 // 再小就看不清了：到这一步宁可裁切，也不把字缩成蚂蚁
let fitRaf = 0

function applyFit() {
  fitRaf = 0
  const el = rootRef.value
  if (!el) return
  const avail = window.innerHeight
  let fit = 1
  el.style.setProperty('--fit', '1')
  // 尺寸是线性吃系数的，高度也近似线性；留 1px 余量，吃掉亚像素舍入的尾巴
  for (let i = 0; i < 5; i += 1) {
    const natural = el.scrollHeight
    if (!natural || natural <= avail) break
    fit = Math.max(FIT_MIN, fit * ((avail - 1) / natural))
    el.style.setProperty('--fit', fit.toFixed(4))
    if (fit <= FIT_MIN) break
  }
}

function scheduleFit() {
  if (fitRaf) return
  fitRaf = requestAnimationFrame(applyFit)
}

onMounted(() => {
  document.documentElement.classList.add(SCROLL_LOCK)
  applyFit()
  window.addEventListener('resize', scheduleFit)
  // 字体晚一步到齐会改写高度，落定后再量一次
  document.fonts?.ready?.then(scheduleFit, () => {})
  // 提示与视频无关（少动效、省流量也照常）：放在下面那两处提前返回之前
  startHint()

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  const saveData = navigator.connection?.saveData === true
  if (reduce || saveData) return
  allowVideo.value = true
  document.addEventListener('visibilitychange', onVisibility)
  nextTick(() => {
    // 自动播放被拦（muted 一般放行，拦了就退回海报，页面不留空）
    videoRef.value?.play?.().catch(() => (allowVideo.value = false))
  })
  // 缓存命中或事件丢失时的兜底：不能一直停在 0 透明度
  readyTimer = window.setTimeout(markVideoReady, 2600)
})

/* ===== 复制 =====
 * QQ 群号与邮箱是要拿去粘贴的，给一个"点了就知道成没成"的动作：
 * 按钮就地变成"已复制"，同时往 aria-live 里播报一句，键盘用户也听得到。
 */
const copied = ref('') // 存刚复制成功的那条原文，按钮靠它切状态
const notice = ref('') // 给读屏的播报，与视觉提示同源
let copyTimer = 0

/** 无剪贴板权限时退回 execCommand：老浏览器与 http 环境下也能复制 */
function legacyCopy(text) {
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.appendChild(box)
  box.select()
  try {
    document.execCommand('copy')
  } catch {
    /* 连 execCommand 都不认就只播报失败，不打断页面 */
  }
  box.remove()
}

async function copy(row) {
  try {
    await navigator.clipboard.writeText(row.copy)
  } catch {
    legacyCopy(row.copy)
  }
  copied.value = row.copy
  notice.value = `${row.label} ${row.value} 已复制`
  clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => {
    copied.value = ''
  }, 1800)
}

/* ===== 鼠标提示 =====
 * 桌面端独有的一句邀请："滑动鼠标，感受烟花与引力交织"。
 * 判定口径与背景倾斜、指针烟花完全一致（同一条媒体查询）：触摸设备上那两样效果本来就不启动，
 * 这句提示也就不该出现——所以既不在屏幕上报到，也不挂监听。
 * 用户第一次连续滑动横跨 80vw（或竖跨 80vh）就渐隐收工：该试的都试到了，提示不必继续占版面。
 */
const HINT_SWIPE_X = 0.8 // 横向 80vw：按视口宽度折算，与 CSS 里的 vw 同口径
const HINT_SWIPE_Y = 0.7 // 纵向 80vh：同理，与 vh 同口径
const HINT_PAUSE = 1000 // 停手超过 1s 就算这一段滑动断了，跨度重算

const hintGone = ref(false)
/* 量的是"这一段滑动横跨/竖跨了多宽"，而不是把每一步的微小位移累加起来。
 * 累加路程看着更灵敏，实际会在桌面上随手一晃时瞬间攒过阈值——
 * 用户还没看清这行字，它就先退场了。跨度只认真划出去的那一下。 */
let hintLive = false // 这一段滑动是否已经开始记跨度
let hintMinX = 0
let hintMaxX = 0
let hintMinY = 0
let hintMaxY = 0
let hintLast = 0 // 上一次采样时刻，用来判断这一段断没断

function onHintMove(event) {
  const now = performance.now()
  // 停手一段时间：上一段滑动已经结束，四个边界一起清零，下一次从头记
  if (now - hintLast > HINT_PAUSE) hintLive = false
  hintLast = now

  const x = event.clientX
  const y = event.clientY
  if (!hintLive) {
    hintLive = true
    hintMinX = x
    hintMaxX = x
    hintMinY = y
    hintMaxY = y
    return
  }
  if (x < hintMinX) hintMinX = x
  if (x > hintMaxX) hintMaxX = x
  if (y < hintMinY) hintMinY = y
  if (y > hintMaxY) hintMaxY = y

  // 横向够 80vw 或纵向够 80vh：任意一头达标就渐隐收工，
  // 监听立刻摘掉——"首次"之后不再回来
  const swungX = hintMaxX - hintMinX > window.innerWidth * HINT_SWIPE_X
  const swungY = hintMaxY - hintMinY > window.innerHeight * HINT_SWIPE_Y
  if (swungX || swungY) {
    hintGone.value = true
    window.removeEventListener('pointermove', onHintMove)
    // 这行字退场后左栏变矮，矮屏的自适应要按新高度重量一次
    nextTick(scheduleFit)
  }
}

/** 挂监听：只在真的有指针、真的会出烟花与引力的设备上挂 */
function startHint() {
  if (hintGone.value) return
  if (window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches) return
  window.addEventListener('pointermove', onHintMove, { passive: true })
}

/* ===== 入场 =====
 * 与 Features / UpdateLog 同一套做法：时间表只写这一份，注入成 --enter-*，
 * 样式只管姿态与曲线。少动效时压根不加这个类，元素直接停在终态。
 *
 * 这一页排的是一条"镜头推开雨窗"的连续动线，而不是把元素一个个淡进来：
 *   0ms    实拍层浮起并收一档放大（像镜头落定）＋ 一道光自左向右扫过雨窗＋ 左上辉光起势
 *   100ms  眉标一边拉开字距一边落位
 *   200ms  标题按字显影：每字 68ms 阶梯，字面从下被光"推"出来，笔画带一瞬冷光，字距同步收拢
 *   520ms  副题那道线画开，项目全名跟上
 *   640ms  鼠标提示
 *   700ms  清单自上下笔：每行 75ms 依次落位，行上沿一道光随行从左跑到右，序号先到、数值随后
 *   1100ms 两张声明卡同拍显影
 */
const TITLE_CHARS = '项目信息'.split('') // 标题按字显影：逐字一个 span，错开登场

const ENTER = {
  media: 0, // 实拍层：浮起 + 收放大
  sweep: 60, // 横扫过雨窗的那道白光
  bloom: 0, // 左上角冷调辉光起势
  grid: 140, // 杂志栏格自中间铺开
  kicker: 100,
  title: 200,
  titleStep: 68, // 每个字的阶梯
  sub: 520,
  hint: 640,
  rows: 700,
  rowStep: 75,
  note: 1100, // 两张声明卡同拍落地（不分先后）
}
const DUR = {
  media: 1500,
  sweep: 1500,
  bloom: 1500,
  grid: 1300,
  kicker: 620,
  title: 900,
  rule: 620,
  sub: 620,
  hint: 620,
  row: 680,
  note: 620,
}
// 谁最后落定，入场就到谁为止：撤掉 .is-entering 的那一刻，全场已经是终态
const ENTER_END =
  Math.max(
    ENTER.title + ENTER.titleStep * (TITLE_CHARS.length - 1) + DUR.title,
    ENTER.rows + ENTER.rowStep * (ROWS.value.length - 1) + DUR.row,
    ENTER.note + DUR.note,
  ) + 60

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
// 帧首就挂上，动画当帧起跑；这里只管按时间表收尾
const entering = ref(!reduceMotion)

let enterTimer = 0
if (entering.value) enterTimer = window.setTimeout(() => (entering.value = false), ENTER_END)

const ms = (v) => `${v}ms`
const enterVars = {
  '--enter-media': ms(ENTER.media),
  '--enter-sweep': ms(ENTER.sweep),
  '--enter-bloom': ms(ENTER.bloom),
  '--enter-grid': ms(ENTER.grid),
  '--enter-kicker': ms(ENTER.kicker),
  '--enter-title': ms(ENTER.title),
  '--enter-title-step': ms(ENTER.titleStep),
  '--enter-sub': ms(ENTER.sub),
  '--enter-hint': ms(ENTER.hint),
  '--enter-rows': ms(ENTER.rows),
  '--enter-row-step': ms(ENTER.rowStep),
  '--enter-note': ms(ENTER.note),
  '--enter-dur-media': ms(DUR.media),
  '--enter-dur-sweep': ms(DUR.sweep),
  '--enter-dur-bloom': ms(DUR.bloom),
  '--enter-dur-grid': ms(DUR.grid),
  '--enter-dur-kicker': ms(DUR.kicker),
  '--enter-dur-title': ms(DUR.title),
  '--enter-dur-rule': ms(DUR.rule),
  '--enter-dur-sub': ms(DUR.sub),
  '--enter-dur-hint': ms(DUR.hint),
  '--enter-dur-row': ms(DUR.row),
  '--enter-dur-note': ms(DUR.note),
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove(SCROLL_LOCK)
  window.removeEventListener('resize', scheduleFit)
  window.removeEventListener('pointermove', onHintMove)
  if (fitRaf) cancelAnimationFrame(fitRaf)
  clearTimeout(copyTimer)
  if (enterTimer) clearTimeout(enterTimer)
  if (readyTimer) clearTimeout(readyTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <main ref="rootRef" class="info" :class="{ 'is-entering': entering }" :style="enterVars">
    <!-- 背景：雨打窗玻璃的实拍视频 → 冷调辉光 → 压暗层 → 杂志栏格 → 胶片颗粒。
         整块交给 TiltCard：指针在页面上移动时背景轻轻转一点，像隔一层厚玻璃看窗外；
         倾斜只发生在这个壳里，文字、清单、声明卡一动不动。
         壳会写 transform，所以"钉在视口上"由外层 .info-bg-tilt 负责，壳内一律用 absolute。 -->
    <div class="info-bg-tilt" aria-hidden="true">
      <TiltCard
        class="info-bg-tilt__card"
        track="window"
        :max-tilt="15"
        :perspective="1600"
        :scale="1"
        :smoothing="0.1"
        :glare="false"
      >
        <div class="info-bg">
          <div class="info-bg__media">
            <!-- 海报垫在视频底下：未就绪、少动效、省流量三种情况下都是它在撑画面 -->
            <img class="info-bg__poster" :src="POSTER" alt="" />
            <video
              v-if="allowVideo"
              ref="videoRef"
              class="info-bg__video"
              :class="{ 'is-ready': videoReady }"
              autoplay
              muted
              loop
              playsinline
              preload="auto"
              disablepictureinpicture
              tabindex="-1"
              @loadeddata="markVideoReady"
            >
              <source :src="VIDEO_SM" media="(max-width: 820px)" type="video/mp4" />
              <source :src="VIDEO_LG" type="video/mp4" />
            </video>
          </div>
          <!-- 光斑压在实拍层之上、却压在压暗层之下：雨要看得见，最小的那行字也要站得住 -->
          <GlowCard
            class="info-bg__glow"
            track="window"
            glow-color="#ffffff"
            :glow-size="380"
            :intensity="0.4"
            :falloff="70"
          />
          <span class="info-bg__bloom"></span>
          <span class="info-bg__scrim"></span>
          <span class="info-bg__grid"></span>
          <span class="info-bg__grain"></span>
          <!-- 开场那道光：自左向右横扫过雨窗，只在入场那一下出现（静态就停在透明） -->
          <span class="info-bg__sweep"></span>
        </div>
      </TiltCard>
    </div>

    <div class="info-sheet">
      <!-- 左栏：眉标、标题、项目全名。桌面端跟着滚动吸住，像杂志的页眉块 -->
      <header class="info-head">
        <p class="info-kicker">NATB / PROJECT INFO</p>
        <!-- 标题按字显影：一个字一个 span，各自从下被光推出来。
             可读性走 h1 的 aria-label，逐字 span 对读屏隐藏，别念成四个孤立字。 -->
        <h1 class="info-title" aria-label="项目信息">
          <span
            v-for="(ch, i) in TITLE_CHARS"
            :key="i"
            class="info-title__ch"
            :style="{ '--ch-i': i }"
            aria-hidden="true"
          >{{ ch }}</span>
        </h1>
        <div class="info-sub">
          <span class="info-sub__rule" aria-hidden="true"></span>
          <p class="info-sub__text">{{ PROJECT }}</p>
        </div>

        <!-- 桌面端的邀请：一枚"手左右滑动"的图标 + 一行呼吸的字。
             第一次横跨 80vw（或竖跨 80vh）就渐隐退场（撤销后整行折起，不留空档），逻辑见脚本「鼠标提示」。 -->
        <p
          class="info-hint"
          :class="{ 'is-gone': hintGone }"
          :aria-hidden="hintGone ? 'true' : undefined"
        >
          <i-ph-hand-swipe-right-bold class="info-hint__icon" width="19" height="19" aria-hidden="true" />
          <span class="info-hint__text">滑动鼠标，感受烟花与引力交织</span>
        </p>
      </header>

      <!-- 右栏：五项信息。用 dl 表结构，读屏里"标签—值"成对读出 -->
      <section class="info-main" aria-labelledby="info-list-label">
        <h2 id="info-list-label" class="info-sr">项目信息明细</h2>

        <dl class="info-list">
          <div
            v-for="(row, i) in ROWS"
            :key="row.no"
            class="info-row"
            :style="{ '--row-i': i }"
          >
            <span class="info-row__no" aria-hidden="true">{{ row.no }}</span>
            <dt class="info-row__label">{{ row.label }}</dt>
            <dd class="info-row__value">
              <span class="info-row__text" :class="{ 'is-data': row.data }">{{ row.value }}</span>
              <span v-if="row.badge" class="info-badge">
                <span class="info-badge__dot" aria-hidden="true"></span>{{ row.badge }}
              </span>
            </dd>

            <div class="info-row__act">
              <button
                v-if="row.copy"
                type="button"
                class="info-btn"
                :class="{ 'is-done': copied === row.copy }"
                :aria-label="`复制${row.label} ${row.value}`"
                @click="copy(row)"
              >
                <i-lucide-check v-if="copied === row.copy" width="14" height="14" aria-hidden="true" />
                <i-lucide-copy v-else width="14" height="14" aria-hidden="true" />
                <span class="info-btn__text">{{ copied === row.copy ? '已复制' : '复制' }}</span>
              </button>

              <a
                v-if="row.href"
                class="info-btn info-btn--link"
                :href="row.href"
                :target="row.out ? '_blank' : undefined"
                :rel="row.out ? 'noopener noreferrer' : undefined"
              >
                <span class="info-btn__text">{{ row.out ? '前往' : '写信' }}</span>
                <i-lucide-arrow-up-right v-if="row.out" width="14" height="14" aria-hidden="true" />
                <i-lucide-mail v-else width="14" height="14" aria-hidden="true" />
              </a>
            </div>
          </div>
        </dl>
      </section>
    </div>

    <!-- 两段原文各成一张卡，并排铺成一行跟在清单后面（正文一字不改，只是换个排法） -->
    <footer class="info-foot">
      <div class="info-note">
        <p class="info-note__label">
          <i-solar-shield-warning-bold width="20" height="20" aria-hidden="true" />
          <span class="info-note__title">免责声明</span>
        </p>
        <p class="info-note__text">{{ DISCLAIMER }}</p>
      </div>

      <div class="info-note info-note--mark">
        <p class="info-note__label">
          <i-solar-copyright-bold width="20" height="20" aria-hidden="true" />
          <span class="info-note__title">商标声明</span>
        </p>
        <p class="info-note__text">{{ TRADEMARK }}</p>
      </div>
    </footer>

    <p class="info-sr" role="status" aria-live="polite">{{ notice }}</p>

    <!-- 指针烟花：白 / 蓝两色墨点。光标图标取首页主按钮那颗深蓝，大小回到最初那版 -->
    <InkSplatterCursor
      :colors="['#ffffff', '#7aa7ff']"
      dot-color="#0A59F7"
      :dot-size="8"
      :z-index="80"
    />
  </main>
</template>

<style scoped>
.info {
  /* 三色令牌：墨面、墨字、一个强调色。数值都按 WCAG AA 的对比度配过 */
  /* 背景整体提亮一档：墨底、媒体层、压暗层一起抬，只抬一处会把画面分成两层 */
  --paper: #101319;
  --paper-2: #14181f;
  --ink: #f5f7fa;
  --ink-2: rgba(245, 247, 250, 0.76); /* 正文：对墨面 ≈ 9:1 */
  /* 小字眉标：视频背景最亮的一帧也得过 AA，所以留足余量（静态墨底 ≈ 7:1） */
  --ink-3: rgba(245, 247, 250, 0.64);
  --line: rgba(255, 255, 255, 0.13);
  --line-soft: rgba(255, 255, 255, 0.07);
  --accent: #7aa7ff;
  --accent-deep: #a9c6ff;
  --accent-veil: rgba(122, 167, 255, 0.1);
  --mono: ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace;

  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  /* 纵向尺度统一吃 --fit：自适应只写这一个系数，JS 按可用高度调它 */
  --fit: 1;
  --row-pad: calc(clamp(18px, 2.5vh, 30px) * var(--fit));

  position: relative;
  box-sizing: border-box;
  /* 一列到底：版心吃内容高度，底部两张声明卡靠 margin-top:auto 贴住页面下沿，
   * 卡片下面因此不再空出一条带。（页面不可滚动仍由根元素那把锁负责。） */
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100svh;
  padding: calc(clamp(72px, 12vh, 148px) * var(--fit)) clamp(20px, 5vw, 72px)
    calc(clamp(24px, 3.4vh, 40px) * var(--fit));
  background: var(--paper);
  color: var(--ink);
}

/* 锁只落在根元素上：根元素本来就是滚动容器，锁它不会改动任何 sticky 的参照系。
 * body 一律不碰——给它 overflow 会多出新的滚动容器，页眉位置随之漂移。 */
:global(html.is-info-locked) {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
}

/* ===== 背景 =====
 * 两层分工：外层 .info-bg-tilt 钉在视口上（fixed），内层 .info-bg 随壳倾斜（absolute）。
 * 之所以要分家：TiltCard 会往自己身上写 transform，而带 transform 的祖先会成为
 * fixed 后代的包含块——fixed 留在壳里就会以壳为参照，尺寸直接塌成 0。
 */
.info-bg-tilt {
  position: fixed;
  /* 四周各放大 12%：14° 倾斜叠上透视后，远端会往里缩一截，余量不够四边就会露缝 */
  inset: -12%;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.info-bg-tilt__card {
  width: 100%;
  height: 100%;
}

/* 触屏上没有鼠标可跟：倾斜、光斑、烟花在组件内部就已整体不启动，
 * 这里顺带把"为倾斜预留的放大余量"收掉，背景回到满屏、不放大。
 * （鼠标提示的隐藏写在它自己那组样式后面——同权重的规则压不住后面的基础声明。） */
@media (hover: none), (pointer: coarse) {
  .info-bg-tilt {
    inset: 0;
  }
}

.info-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 跟随指针的光斑：压在实拍层之上、压暗层之下，所以它只"点亮雨窗"，不会洗白文字。
 * 双类是为了压过组件自己的 .glow{position:relative}——这里要的是绝对定位那一层。 */
.info-bg .info-bg__glow {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* 实拍层：海报垫底，视频就绪后再淡淡浮上来 */
.info-bg__media {
  position: absolute;
  inset: 0;
  background: var(--paper);
}

.info-bg__poster,
.info-bg__video {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 50%;
  /* 背景提亮：实拍画面自己抬一档，压暗层再退一档，雨丝看得更清楚 */
  filter: brightness(1.06) saturate(1.03);
}

/* 露面时顺带收一档缩放：像玻璃上那层雾慢慢退掉，不是硬切上来 */
.info-bg__video {
  opacity: 0;
  scale: 1.035;
  transition:
    opacity 1.1s ease,
    scale 2.6s var(--ease);
}

.info-bg__video.is-ready {
  opacity: 1;
  scale: 1;
}

/* 压暗层：实底只留薄薄一层（片子本身在压制时已经压暗过），
 * 暗角最亮的一点放在内容区，左栏小字与页脚声明处再各自加深——
 * 雨要看得见，最小的那行字也得站得住。 */
.info-bg__scrim {
  position: absolute;
  inset: 0;
  background: rgba(10, 12, 18, 0.26);
}

.info-bg__scrim::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      120% 90% at 68% 36%,
      rgba(10, 12, 18, 0),
      rgba(10, 12, 18, 0.18) 60%,
      rgba(10, 12, 18, 0.38) 100%
    ),
    linear-gradient(180deg, rgba(10, 12, 18, 0.4), rgba(10, 12, 18, 0.03) 42%, rgba(10, 12, 18, 0.38));
}

/* 杂志栏格：三列等分竖线，压在视频之上才不会被压暗层吃掉 */
.info-bg__grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 25% 100%;
  background-position: -1px 0;
  mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
}

/* 左上角一层冷调辉光，把标题从画面里托出来 */
.info-bg__bloom {
  position: absolute;
  top: -32vh;
  left: -12vw;
  width: 78vw;
  height: 78vh;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(122, 167, 255, 0.12), transparent 62%);
}

/* 极淡的胶片颗粒：把实拍画面与界面糊成同一张纸，也压掉视频的块效应 */
.info-bg__grain {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}

/* 开场那道光：一条斜向的柔光带，横扫过雨窗。
 * 尺寸就是背景框本身，靠 translate 从画面外扫到画面外；静态停在看不见。 */
.info-bg__sweep {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(
    104deg,
    transparent 42%,
    rgba(226, 238, 255, 0.08) 47%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(226, 238, 255, 0.08) 53%,
    transparent 58%
  );
  pointer-events: none;
}

/* ===== 版心 ===== */
.info-sheet {
  position: relative;
  z-index: 1;
  display: grid;
  gap: calc(clamp(34px, 5vw, 84px) * var(--fit));
  width: 100%;
  max-width: 1180px;
  /* 下边距是与底部卡片之间的最小呼吸；卡片贴住下沿靠的是页脚那记 margin-top:auto */
  margin: 0 auto calc(clamp(24px, 3.6vh, 44px) * var(--fit));
}

/* ===== 页眉块 ===== */
.info-head {
  align-self: start;
}

.info-kicker {
  margin: 0 0 calc(clamp(18px, 2.6vh, 30px) * var(--fit));
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.info-title {
  margin: 0;
  font-size: calc(clamp(42px, 8.4vw, 96px) * var(--fit));
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: -0.035em;
}

/* 标题按字显影用的字箱：inline-block 才能各自吃 transform 与 clip-path，
 * 排在一起仍然读作一整行（字距由 .info-title 的 letter-spacing 管）。 */
.info-title__ch {
  display: inline-block;
}

/* 项目全名：一道短横线把标题与英文名连起来，像杂志的副题 */
.info-sub {
  margin: calc(clamp(20px, 3vh, 34px) * var(--fit)) 0 0;
}

.info-sub__rule {
  display: block;
  width: clamp(40px, 5vw, 72px);
  height: 1px;
  background: var(--accent);
  transform-origin: left center;
}

.info-sub__text {
  margin: calc(14px * var(--fit)) 0 0;
  font-size: calc(clamp(13px, 1.3vw, 15px) * var(--fit));
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--ink-2);
}

/* ===== 鼠标提示 =====
 * 标题块最后一行：一枚"手左右滑动"的图标 + 一句呼吸的字。
 * 它是"邀请"不是"内容"，所以比正文再轻一档；退场只有渐隐，没有任何位移或压扁。 */
.info-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: calc(clamp(18px, 2.4vh, 28px) * var(--fit)) 0 0;
  /* 汉字不进食等宽栈（会掉进宋体回退）：与副题同一档，只把字距放开一点 */
  font-size: calc(clamp(12px, 1.15vw, 13.5px) * var(--fit));
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  /* 退场：透明度先独自走完 560ms；高度与留白用 0s + 同样长的延迟，
   * 等这行字全透明了才瞬间收掉——所以看不见"滑走"，也看不见"被挤没"。 */
  max-height: 4rem;
  overflow: hidden;
  transition:
    opacity 560ms ease,
    max-height 0s linear 560ms,
    margin-top 0s linear 560ms;
}

.info-hint.is-gone {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
  pointer-events: none;
}

.info-hint__icon {
  display: block;
  flex: none;
  /* 图标不跟着呼吸：一亮一暗的是那句话，图标只是它的锚点 */
  color: var(--accent-deep);
}

/* 呼吸只动透明度、不动位置——它是提示，不该抢标题的戏。
 * 下限 0.72 是配着 --ink-2 定的：再暗就压到 AA 对比度线下了。 */
.info-hint__text {
  animation: info-breathe 3.4s ease-in-out infinite;
}

@keyframes info-breathe {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.72;
  }
}

/* 触屏上没有鼠标可滑：整行不出现（脚本里的判定用同一条媒体查询）。
 * 必须落在这组基础样式之后：同权重时后写的胜出，写在前面会被 display:flex 盖掉。 */
@media (hover: none), (pointer: coarse) {
  .info-hint {
    display: none;
  }
}

/* ===== 信息清单 =====
 * 清单在可用高度里铺开：右栏高度归清单，五行均分，行距自己撑开——
 * 最后一行因此一直铺到卡片上方，版心与卡片之间不再留一段空。
 */
.info-main {
  display: flex;
  flex-direction: column;
  /* 版心那一行是 start 对齐的，右栏要单独说一声"我拉满" */
  align-self: stretch;
  min-width: 0;
}

.info-list {
  /* 高度归它、只长不缩（矮屏交给 --fit 收，不把行压扁）；
   * 五行用 grid 均分：每行严格等高，行距由这一栏自己撑开 */
  flex: 1 0 auto;
  display: grid;
  grid-auto-rows: 1fr;
  margin: 0;
  border-bottom: 1px solid var(--line-soft);
}

.info-row {
  position: relative;
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr) auto;
  grid-template-areas:
    'no label act'
    'no value act';
  align-items: center;
  column-gap: clamp(12px, 1.8vw, 26px);
  padding: var(--row-pad) clamp(10px, 1.4vw, 20px) var(--row-pad) clamp(10px, 1.4vw, 20px);
  border-top: 1px solid var(--line-soft);
  transition: background-color 260ms ease;
}

/* 入场时沿行上沿跑过的那道光（静态不存在，只在入场那一下出现）。
 * 上沿本来有一条发丝线（border-top），这道光就压在它上面滑过去，
 * 于是"清单正在被写下来"这件事有了一个方向感，而不只是五行各自淡入。 */
.info-row::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0;
  pointer-events: none;
}

/* 悬浮 / 键盘聚焦到行内控件时，行首浮起一小段强调色，行底铺一层极淡的冷调 */
.info-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 0;
  translate: 0 -50%;
  background: var(--accent);
  transition: height 300ms var(--ease);
}

.info-row:hover,
.info-row:focus-within {
  background: linear-gradient(90deg, var(--accent-veil), transparent 48%);
}

.info-row:hover::before,
.info-row:focus-within::before {
  height: 62%;
}

.info-row__no {
  grid-area: no;
  align-self: center;
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.12em;
  color: var(--ink-3);
  transition: color 260ms ease;
}

.info-row:hover .info-row__no,
.info-row:focus-within .info-row__no {
  color: var(--accent);
}

.info-row__label {
  grid-area: label;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--ink-3);
  transition: color 260ms ease;
}

.info-row:hover .info-row__label,
.info-row:focus-within .info-row__label {
  color: var(--ink-2);
}

.info-row__value {
  grid-area: value;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  /* 允许列被压窄：长邮箱宁可自己收字，也不去挤右侧的控件 */
  min-width: 0;
  margin: 6px 0 0;
}

/* 可复制的原文用等宽体：数字与地址对齐成一根柱，扫读时不会跳 */
.info-row__text {
  font-size: calc(clamp(20px, 2.3vw, 30px) * var(--fit));
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.02em;
  /* 原文可选取：想手动复制也不必非得点按钮 */
  user-select: text;
}

.info-row__text.is-data {
  font-family: var(--mono);
  font-size: calc(clamp(18px, 2vw, 27px) * var(--fit));
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  /* 地址可以断行：极窄屏放不下时的兜底，正常情况下用不到 */
  overflow-wrap: anywhere;
}

.info-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border: 1px solid rgba(122, 167, 255, 0.36);
  border-radius: 999px;
  background: var(--accent-veil);
  /* 原文就是小写的 stable：这里只调字距，不改大小写 */
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--accent-deep);
}

/* 只有这一处动的东西：一颗慢慢呼吸的点，表示"当前版本"是活的 */
.info-badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(122, 167, 255, 0.18);
  animation: info-pulse 2.8s ease-in-out infinite;
}

/* ===== 行内控件 ===== */
.info-row__act {
  grid-area: act;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 带边框的按钮统一走"白底黑字"：深色玻璃上落一枚实心白胶囊，一眼就找得到 */
.info-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  /* 触控目标：高度按 44px 的推荐下限留足 */
  padding: 5px 7px;
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 999px;
  background: #fff;
  color: #101319;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 220ms ease,
    border-color 220ms ease,
    color 220ms ease,
    scale 180ms var(--ease);
}

/* 悬浮只在白底上落一档灰：黑字不动，免得来回闪 */
.info-btn:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: #e8ecf4;
  color: #101319;
}

.info-btn:active {
  scale: 0.96;
}

/* 复制成功：仍是白底黑字，改由一道强调色边框 + 对勾图标交代"已经复制了" */
.info-btn.is-done {
  border-color: var(--accent);
  background: #fff;
  color: #101319;
}

.info-btn svg {
  display: block;
  flex: none;
}

/* 「前往 / 写信」那两枚本来就不带边框，只做文字链接，不在白底黑字之列 */
.info-btn--link {
  border-color: transparent;
  background: transparent;
  color: var(--ink-2);
}

.info-btn--link:hover {
  background: transparent;
  color: var(--accent-deep);
}

.info-btn:focus-visible,
.info-row__text:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 999px;
}

/* 外链箭头微交互：指向右上，悬浮时顺着那个方向挪一点 */
.info-btn--link:hover svg {
  translate: 1px -1px;
}

.info-btn--link svg {
  transition: translate 220ms var(--ease);
}

/* ===== 声明卡片 =====
 * 免责声明与商标声明各成一张卡，并排铺成一行，就排在清单后面。
 * 卡内是"左标签、右正文"两栏：左边图标与标题并成一行，右边正文自成一段；
 * 两张卡共用同一套内部骨架，右栏文字的起点因此落在同一条竖线上。
 * 它们不悬浮、不盖住任何东西，只是被 margin-top:auto 按在页面下沿。
 */
.info-foot {
  position: relative;
  z-index: 1;
  display: grid;
  /* 免责正文更长，给它多一点宽度；两张卡 align-items:stretch 自动等高 */
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: clamp(14px, 1.6vw, 22px);
  align-items: stretch;
  width: 100%;
  max-width: 1180px;
  /* 剩余高度全归这里：卡片因此贴在页面下沿，下方不再空出一条带 */
  margin: auto auto 0;
}

/* 卡壳：免责声明压在实拍画面上，做成一块磨砂玻璃：既贴住视频，又把声明这一段托干净。
 * 内部两栏——左栏的宽度由内容（图标 + 标题）自己撑开，右栏吃掉余下的宽度。 */
.info-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  /* 两栏在卡内上下居中：左栏只有一行，右栏是整段，共用同一条中轴 */
  align-items: center;
  column-gap: clamp(14px, 1.5vw, 22px);
  /* 内边距收薄：卡片本来就不该占那么多空 */
  padding: calc(clamp(12px, 1.6vh, 18px) * var(--fit)) calc(clamp(15px, 1.5vw, 20px) * var(--fit));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(9, 11, 15, 0.58);
  /* 模糊半径减半：卡面观感几乎不变，但它压在逐帧变化的视频上，
   * 每帧都要重算一次全卡模糊——半径直接决定这笔开销（实测帧率 +60% 上下） */
  backdrop-filter: blur(6px) saturate(140%);
  -webkit-backdrop-filter: blur(6px) saturate(140%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* 商标那张：同一族的玻璃，层级略低。内部骨架与左卡逐字相同——
 * 对齐规则一旦两卡分家，标题行与正文行就会错开。 */
.info-note--mark {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(9, 11, 15, 0.5);
}

/* 左栏：图标与标题并成一行。标题不折行，两卡的左栏宽度因此天然相等，
 * 右栏正文也就落在同一条竖线上；行高按正文那一档配，左栏首行与正文首行齐平。 */
.info-note__label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  /* 标题要明显压得住正文：纯白、700、比正文大一档以上，颜色强调让给图标。
   * 卡内文字不吃 --fit：矮屏宁可让间距去让位，也不把声明缩到看不清。 */
  font-size: clamp(16px, 1.35vw, 17.5px);
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.14em;
  white-space: nowrap;
  color: var(--ink);
}

.info-note__label svg {
  display: block;
  flex: none;
  color: var(--accent-deep);
}

/* 右栏：正文自成一段，与左栏首行齐平起排 */
.info-note__text {
  margin: 0;
  /* 字放大一档、行距收紧：同样的块高里，读起来更实；同样不吃 --fit */
  font-size: clamp(10px, 1.25vw, 14.5px);
  line-height: 1.68;
  color: var(--ink-2);
}

/* 商标那句：与免责正文同档字号，只是字色略弱一阶 */
.info-note--mark .info-note__text {
  color: var(--ink-2);
}

/* ===== 屏幕阅读器专用 ===== */
.info-sr {
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
/* 宽屏：标题块与清单分两栏，标题吸在左侧，滚动时一直是这一页的"刊头" */
@media (min-width: 1000px) {
  .info-sheet {
    grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
    align-items: start;
    /* 版心吃满剩余高度：右栏清单因此一直铺到卡片上方 */
    flex: 1 0 auto;
  }

  .info-head {
    position: sticky;
    top: clamp(96px, 16vh, 180px);
  }
}

/* 窄屏：两张声明卡改成一上一下——并排时窄卡只剩一格宽，右栏正文会被压到读不成句。
 * 断点取在 1080px：再窄一点，商标卡里的正文就不到 200px 了。 */
@media (max-width: 1080px) {
  .info-foot {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 更窄：卡内也从"左标签、右正文"回到上下两行，图标与标题仍并排成一行 */
@media (max-width: 620px) {
  .info-note {
    grid-template-columns: minmax(0, 1fr);
    row-gap: calc(6px * var(--fit));
  }

  .info-note__label {
    line-height: 1.2;
  }
}

/* 窄屏：序号列收窄，控件只留图标，行内仍是一行标签 + 一行值 */
@media (max-width: 640px) {
  .info-row {
    grid-template-columns: 2rem minmax(0, 1fr) auto;
    column-gap: 10px;
    padding-left: 2px;
    padding-right: 0;
  }

  .info-btn {
    padding: 0 10px;
  }

  /* 窄屏把等宽值收到一档：20 位的邮箱在一行里也让得开右侧控件 */
  .info-row__text.is-data {
    font-size: calc(clamp(15px, 4.4vw, 24px) * var(--fit));
  }

  .info-btn__text {
    display: none;
  }

  .info-bg__grid {
    background-size: 50% 100%;
  }
}

/* ===== 入场 =====
 * 一条动线四拍：镜头落定（背景）→ 刊头显影（眉标/标题/副题）→ 清单下笔（五行）→ 落款（两张卡）。
 * 规矩不变：收尾时撤掉 .is-entering，元素回落到的静态样式就是终态——
 * 所以每段 keyframes 的 to 都与静态样式逐字对齐，撤类那一刻不跳。
 * 只用 opacity / transform / scale / clip-path / 字距：都能走合成器，
 * 不碰布局属性（除了两处刻意为之的字距收拢，元素只有几个字）。
 */

/* ── 第一拍：镜头落定 ─────────────────────────────
 * 实拍层浮起并收一档放大：像镜头推近后落定，画面从"还没对上焦"变清晰。 */
.info.is-entering .info-bg__media {
  animation: info-shot var(--enter-dur-media) var(--ease) both;
  animation-delay: var(--enter-media);
}

/* 开场那道光横扫过雨窗：先亮后收，走到对面就退干净 */
.info.is-entering .info-bg__sweep {
  animation: info-sweep var(--enter-dur-sweep) cubic-bezier(0.3, 0, 0.2, 1) both;
  animation-delay: var(--enter-sweep);
}

/* 左上冷调辉光起势：先大而淡，再收到它该在的位置 */
.info.is-entering .info-bg__bloom {
  animation: info-bloom var(--enter-dur-bloom) var(--ease) both;
  animation-delay: var(--enter-bloom);
}

/* 杂志栏格自中间向两侧铺开，像版心刚刚被划好 */
.info.is-entering .info-bg__grid {
  animation: info-grid var(--enter-dur-grid) var(--ease) both;
  animation-delay: var(--enter-grid);
}

/* ── 第二拍：刊头显影 ───────────────────────────── */

/* 眉标：一边把字距拉开一边落位（等宽小字，字距就是它的表情） */
.info.is-entering .info-kicker {
  animation: info-track var(--enter-dur-kicker) var(--ease) both;
  animation-delay: var(--enter-kicker);
}

/* 标题整体收字距：出场时松、落定时紧——最见"编辑感"的一下 */
.info.is-entering .info-title {
  animation: info-track-tight var(--enter-dur-title) var(--ease) both;
  animation-delay: var(--enter-title);
}

/* 标题逐字显影：字面从下方被推出来，笔画带一瞬冷光（光是"点燃"，不是"发光"） */
.info.is-entering .info-title__ch {
  animation: info-char var(--enter-dur-title) cubic-bezier(0.16, 1.02, 0.3, 1) both;
  animation-delay: calc(var(--enter-title) + var(--ch-i) * var(--enter-title-step));
}

/* 副题：线先画开，字跟上 */
.info.is-entering .info-sub__rule {
  animation: info-draw var(--enter-dur-rule) var(--ease) both;
  animation-delay: var(--enter-sub);
}

.info.is-entering .info-sub__text {
  animation: info-rise var(--enter-dur-sub) var(--ease) both;
  animation-delay: var(--enter-sub);
}

/* 提示紧跟副题落位，比五行清单早半拍——它讲的是"这一页怎么玩" */
.info.is-entering .info-hint {
  animation: info-rise var(--enter-dur-hint) var(--ease) both;
  animation-delay: var(--enter-hint);
}

/* ── 第三拍：清单下笔 ─────────────────────────────
 * 一行一拍：行落位的同时，一道光沿它的上沿自左向右跑过去；
 * 序号比行早 70ms（带一瞬强调色，像页边刚被笔点了一下），数值晚 50ms 收到本色。 */
.info.is-entering .info-row {
  animation: info-row-in var(--enter-dur-row) var(--ease) both;
  animation-delay: calc(var(--enter-rows) + var(--row-i) * var(--enter-row-step));
}

.info.is-entering .info-row::after {
  animation: info-run var(--enter-dur-row) var(--ease) both;
  animation-delay: calc(var(--enter-rows) + var(--row-i) * var(--enter-row-step));
}

.info.is-entering .info-row__no {
  animation: info-no var(--enter-dur-row) var(--ease) both;
  animation-delay: calc(var(--enter-rows) + var(--row-i) * var(--enter-row-step) - 70ms);
}

.info.is-entering .info-row__text {
  animation: info-value var(--enter-dur-row) var(--ease) both;
  animation-delay: calc(var(--enter-rows) + var(--row-i) * var(--enter-row-step) + 50ms);
}

/* ── 第四拍：落款 ───────────────────────────────
 * 两张声明卡同拍落地：它们是一组并列的声明，没有先后之分。 */
.info.is-entering .info-note {
  animation: info-note-in var(--enter-dur-note) var(--ease) both;
  animation-delay: var(--enter-note);
}

@keyframes info-shot {
  from {
    opacity: 0;
    scale: 1.07;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes info-sweep {
  0% {
    opacity: 0;
    transform: translate3d(-100%, 0, 0);
  }
  16% {
    opacity: 1;
  }
  76% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
}

@keyframes info-bloom {
  from {
    opacity: 0;
    scale: 1.45;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes info-grid {
  from {
    opacity: 0;
    transform: scaleX(1.08);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes info-track {
  from {
    opacity: 0;
    letter-spacing: 0.46em;
  }
  to {
    opacity: 1;
    letter-spacing: 0.26em;
  }
}

@keyframes info-track-tight {
  from {
    letter-spacing: 0.08em;
  }
  to {
    letter-spacing: -0.035em;
  }
}

/* clip-path 四值闭合：从"整块压在字面下方"推到"完整露出"。
 * 上下都留了负值余量，收尾那一下不会把笔画切掉一像素。 */
@keyframes info-char {
  from {
    opacity: 0;
    clip-path: inset(115% -6% -18% -6%);
    transform: translateY(0.16em);
    text-shadow: 0 0 28px rgba(122, 167, 255, 0.55);
  }
  to {
    opacity: 1;
    clip-path: inset(-18% -6% -18% -6%);
    transform: none;
    text-shadow: 0 0 0 rgba(122, 167, 255, 0);
  }
}

@keyframes info-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes info-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes info-row-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 光带从行外左侧进来、跑出行外右侧：±100% 正好把这一行跑满 */
@keyframes info-run {
  0% {
    opacity: 0;
    transform: translateX(-100%);
  }
  24% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(100%);
  }
}

@keyframes info-no {
  from {
    opacity: 0;
    transform: translateY(-8px);
    color: var(--accent);
  }
  to {
    opacity: 1;
    transform: none;
    color: var(--ink-3);
  }
}

@keyframes info-value {
  from {
    opacity: 0;
    scale: 0.97;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes info-note-in {
  from {
    opacity: 0;
    transform: translateY(22px);
    scale: 0.99;
  }
  to {
    opacity: 1;
    transform: none;
    scale: 1;
  }
}

@keyframes info-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(122, 167, 255, 0.18);
    opacity: 1;
  }
  50% {
    box-shadow: 0 0 0 6px rgba(122, 167, 255, 0.06);
    opacity: 0.72;
  }
}

/* 用户要求少动效：入场不进、点不呼吸、悬浮位移一并关掉 */
@media (prefers-reduced-motion: reduce) {
  .info-btn,
  .info-row,
  .info-row::before,
  .info-row__no,
  .info-row__label,
  .info-hint,
  .info-btn--link svg {
    transition: none;
  }

  .info-badge__dot {
    animation: none;
  }

  /* 提示照样会退场，只是不再呼吸、也不再渐隐——直接换到终态 */
  .info-hint__text {
    animation: none;
  }
}
</style>
