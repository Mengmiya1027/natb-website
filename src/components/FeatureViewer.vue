<script setup>
/**
 * 大窗：点击卡片后"一镜到底"的展开层。
 *
 * 卡片躺在 rotate(15deg) 的车道里、还被弧区裁剪，原地放大必然被切又变形，
 * 所以这里在 body 上开一层 fixed 覆盖，把卡片"接"过来：
 * 覆盖层内所有元素都按最终尺寸自然布局，只在起手帧用 transform 搬回卡片原位，
 * 动画结束落回 transform:none 即自然布局 —— 全程零拉伸，终态是原生渲染。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FeatureDetail from '@/components/FeatureDetail.vue'
import { useViewerStore } from '@/stores/viewer'

const props = defineProps({
  item: { type: Object, required: true },
  /** 源卡在屏幕上的真实几何：中心、未旋转宽高、倾斜角，由 Features 量好传来 */
  origin: { type: Object, required: true },
  /** 卡内图标/标题/正文各自的同一份几何，逐元素 FLIP 用 */
  originParts: { type: Object, default: null },
  /** 特色功能总条数，只给卡上的 "04 / 08" 用 */
  total: { type: Number, default: 0 },
})
const emit = defineEmits(['closed', 'ready', 'release'])

const store = useViewerStore()

const scrimEl = ref(null)
const rootEl = ref(null)
const frameEl = ref(null)
const auraEl = ref(null)
const glowEl = ref(null)
const sweepEl = ref(null)
const detailEl = ref(null)
const leftEl = ref(null)
const shotEl = ref(null)
const closeEl = ref(null)

const shot = computed(() => props.item.shot)

// 一条缓动贯到底，只靠错开的微延迟分出层次，这才是一口气
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
// 展开里每一条动画都在这一刻同时收尾。只要有一条拖后腿，倒放时就会有人先到位、
// 有人还在路上，交接那一帧只能靠淡出糊过去 —— 收起看着假，根子都在这儿
const D_ALL = 660
// 圆角只跑开头这么长：它是绘制属性，动画期间卡片每帧重绘，拖满全程会顿一下
const D_CORNER = 240
// 收起比展开快一点，点到即走
const CLOSE_RATE = 1.7
const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
// 外投影层的起手透明度：非零，否则预光栅会跳过它
const AURA_MIN = 0.003

let anims = []
let closing = false

/** 元素自然矩形在视口里的中心，覆盖层是 fixed inset:0，视口坐标即它的局部坐标 */
function mid(el) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
}

function play(el, frames, opts) {
  if (!el) return null
  const anim = el.animate(frames, opts)
  anims.push(anim)
  return anim
}

/** 让出整整一帧：rAF 回调跑在绘制之前，连等两次才保证这一帧真的画过 */
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/**
 * 缓动的点对称曲线：倒放会把缓动一起倒过来，
 * 展开那根"先快后慢"的曲线倒着播就成了"先慢后快"。换成它的点对称版，
 * 反向后手感才和正放一致 —— 收起同样是先快后慢。
 */
function mirroredEasing(easing) {
  const box = /^cubic-bezier\(([^)]+)\)$/i.exec(String(easing).trim())
  if (!box) return easing
  const [x1, y1, x2, y2] = box[1].split(',').map((v) => Number(v.trim()))
  if (![x1, y1, x2, y2].every(Number.isFinite)) return easing
  const cut = (v) => Math.round(v * 1000) / 1000
  return `cubic-bezier(${cut(1 - x2)}, ${cut(1 - y2)}, ${cut(1 - x1)}, ${cut(1 - y1)})`
}

onMounted(async () => {
  await nextTick()
  const frame = frameEl.value
  const detail = detailEl.value
  const image = shotEl.value
  if (!frame || !detail || !image) return

  const o = props.origin
  const parts = props.originParts || {}
  const fonts = parts.fonts || {}
  const f = mid(frame)
  const shell = mid(detail.shell)
  const s = mid(image)
  // 水印在壳里面：壳的动画一建，它的 rect 立刻就被那层变换带走了，
  // 所以布局位置必须赶在起动画之前量
  const noBox = detail.no ? mid(detail.no) : null

  // 先让整块玻璃按最终尺寸光栅化一帧再起动画：这块面板的首次光栅化要几十毫秒，
  // 落在动画最吃重的前两帧上就是一次明显的顿挫。这里把整层压到千分之一（等于看不见，
  // 但照样会绘制），等它光栅完再起手，动画第一帧就是满血
  if (!reduce && rootEl.value) {
    rootEl.value.style.opacity = '0.001'
    // 这两帧里别接管指针，鼠标还压在源卡上，它就不会提前开始回落
    rootEl.value.style.pointerEvents = 'none'
    await nextPaint()
    // 预光栅这两帧里用户可能已经按了 Esc，组件没了就别再起动画
    if (!rootEl.value?.isConnected) return
    rootEl.value.style.opacity = ''
    rootEl.value.style.pointerEvents = ''
  }

  // 源卡到这一刻才交班：预光栅期间它还留在原位，中间不会出现"两边都没有"的空白
  emit('ready')
  const base = { easing: EASE, fill: 'both', duration: reduce ? 1 : D_ALL }
  const at = (delay) => (reduce ? 0 : delay)

  // 大玻璃：非等比压到卡片矩形上。里面只有渐变，压扁看不出来。
  // 圆角与阴影都写死在样式里：动画里只留 transform 与 opacity，
  // 这两个走合成，改圆角/阴影会把这最大的一块每帧重绘一遍。
  // 代价是起手那几帧圆角比例不对，用透明度起手压住，肉眼看不到。
  // translateZ(0) 把这几层钉在 3D 合成路径上：非等比的 scale 会触发
  // 光栅化倍率重算，一次几百毫秒，提上去就不重算了
  const sx = o.w / f.w
  const sy = o.h / f.h
  play(frame, [
    {
      transform: `translateZ(0) translate(${o.cx - f.x}px, ${o.cy - f.y}px) rotate(${o.rot}deg) scale(${sx}, ${sy})`,
      opacity: 0,
    },
    {
      transform: 'translateZ(0) translate(0px, 0px) rotate(0deg) scale(1, 1)',
      opacity: 1,
    },
  ], base)

  // 卡壳：非等比压到卡片矩形上。壳里只有渐变与光斑，尺寸全按同一比例尺折算，
  // 压扁后正好落回源卡上对应的位置
  const shellSx = o.w / shell.w
  const shellSy = o.h / shell.h
  play(detail.shell, [
    {
      transform: `translateZ(0) translate(${o.cx - shell.x}px, ${o.cy - shell.y}px) rotate(${o.rot}deg) scale(${shellSx}, ${shellSy})`,
    },
    { transform: 'translateZ(0) translate(0px, 0px) rotate(0deg) scale(1, 1)' },
  ], base)

  // 圆角另起一条：压回源卡那一档时得反向放大，起手帧才和原卡一样圆。
  // 这里要认卡壳自己的比例（sx/sy 是玻璃的，用错会把圆角拉成长椭圆）；
  // 横竖分开给是因为非等比压出来的转角是椭圆，而超椭圆形状本身能被还原
  const rBig = parseFloat(getComputedStyle(detail.shell).borderRadius) || 0
  const rSrc = props.origin.radius || rBig * shellSx
  const corner = [
    { borderRadius: `${(rSrc / shellSx).toFixed(2)}px / ${(rSrc / shellSy).toFixed(2)}px` },
    { borderRadius: `${rBig}px` },
  ]
  // 圆角是绘制属性，跟着 transform 同一条动画会把它一起踢出合成层，所以分开两条
  const cornerOpt = { ...base, duration: reduce ? 1 : D_CORNER }
  play(detail.shell, corner, cornerOpt)

  // 水印得飞：它压在原卡右上角、还出血到卡外，只有搬回原卡那一处才对得上。
  // 它在壳里面，所以自身要抵掉壳这一层：位移先把目标偏移转回未旋转坐标再除壳的缩放，
  // 缩放按字号比除壳的缩放；旋转两边都是 15°，正好抵消，自身不必转
  if (detail.no && parts.no && noBox) {
    const kn = fonts.no
      ? fonts.no / parseFloat(getComputedStyle(detail.no).fontSize)
      : parts.no.w / noBox.w
    const rad = (o.rot * Math.PI) / 180
    const dxs = parts.no.cx - o.cx
    const dys = parts.no.cy - o.cy
    const ux = dxs * Math.cos(rad) + dys * Math.sin(rad)
    const uy = -dxs * Math.sin(rad) + dys * Math.cos(rad)
    play(detail.no, [
      {
        transform: `translateZ(0) translate(${(shell.x + ux / shellSx - noBox.x).toFixed(2)}px, ${(shell.y + uy / shellSy - noBox.y).toFixed(2)}px) scale(${(kn / shellSx).toFixed(4)}, ${(kn / shellSy).toFixed(4)})`,
      },
      { transform: 'translateZ(0)' },
    ], base)
  }

  // 边与影跟着壳走同一组变换，顶上原卡那一圈；贴回原位后自己淡掉，
  // 大卡停在那时已经是不留边框阴影的样子。
  // 淡出与主体同长：倒放时它在贴回源卡之前就回到不透明，交接处边影不缺
  if (detail.edge) {
    const edge = mid(detail.edge)
    play(detail.edge, [
      {
        transform: `translateZ(0) translate(${o.cx - edge.x}px, ${o.cy - edge.y}px) rotate(${o.rot}deg) scale(${o.w / edge.w}, ${o.h / edge.h})`,
      },
      { transform: 'translateZ(0) translate(0px, 0px) rotate(0deg) scale(1, 1)' },
    ], base)
    play(detail.edge, corner, cornerOpt)
    play(detail.edge, [
      { opacity: 1 },
      { opacity: 1, offset: 0.82 },
      { opacity: 0 },
    ], { ...base, easing: 'linear' })
  }

  // 卡内元素：各按自己的比例等比缩放。大卡是重排版，位置与字号都与小卡不同，
  // 所以缩放比得认字号：元素框未必等于文字宽，按框宽算会把标题压扁，终点再跳一下
  const fly = (el, src, delay, srcFont) => {
    if (!el || !src) return
    const box = mid(el)
    const k = srcFont ? srcFont / parseFloat(getComputedStyle(el).fontSize) : src.w / box.w
    play(el, [
      {
        transform: `translateZ(0) translate(${src.cx - box.x}px, ${src.cy - box.y}px) rotate(${src.rot}deg) scale(${k})`,
      },
      { transform: 'translateZ(0) translate(0px, 0px) rotate(0deg) scale(1)' },
    ], { ...base, duration: reduce ? 1 : D_ALL - delay, delay: at(delay) })
  }
  fly(detail.title, parts.title, 30, fonts.title)
  fly(detail.icon, parts.icon, 40)
  fly(detail.desc, parts.desc, 60, fonts.desc)

  // 大卡独有的块：小卡上没对应物，只能原地淡入。等壳飞过大半再亮，
  // 且必须与主体同时收尾 —— 主体落位后还在动，看着就是"结束了又变一下"
  const rise = (el, delay) => play(el, [
    { opacity: 0, transform: 'translateZ(0) translateY(0.6vh)' },
    { opacity: 1, transform: 'translateZ(0) translateY(0px)' },
  ], { ...base, duration: reduce ? 1 : 340, delay: at(delay) })
  rise(detail.top, 260)
  rise(detail.rule, 290)

  // 大图：从卡片中心长出来，层次压在内容层之下，像从卡里抽出来
  play(image, [
    {
      transform: `translateZ(0) translate(${o.cx - s.x}px, ${o.cy - s.y}px) rotate(${o.rot}deg) scale(0.26)`,
      opacity: 0,
    },
    { transform: 'translateZ(0) translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1 },
  ], { ...base, duration: reduce ? 1 : D_ALL - 90, delay: at(90) })

  play(scrimEl.value, [{ opacity: 0 }, { opacity: 1 }], {
    ...base,
    duration: reduce ? 1 : 520,
    // 写成贝塞尔而不是 ease-out，收起时才能取到它的点对称版本
    easing: 'cubic-bezier(0, 0, 0.58, 1)',
  })
  // 外投影静止不动，所以只能靠透明度出场：等玻璃长得差不多了再亮，
  // 免得那块为大卡量身定的光斑早早挂在还只有卡片大的玻璃外面。
  // 收尾与其余各条对齐，倒放时它先退场，交接那一帧也不会多出一圈光
  play(auraEl.value, [{ opacity: AURA_MIN }, { opacity: 1 }], {
    ...base,
    duration: reduce ? 1 : 300,
    delay: at(D_ALL - 300),
  })
  play(glowEl.value, [{ opacity: 0 }, { opacity: 1 }], {
    ...base,
    duration: reduce ? 1 : D_ALL - 120,
    delay: at(120),
  })
  play(sweepEl.value, [
    { transform: 'translateX(-140%)', opacity: 0 },
    { transform: 'translateX(40%)', opacity: 0.9, offset: 0.34 },
    { transform: 'translateX(320%)', opacity: 0 },
  ], {
    ...base,
    duration: reduce ? 1 : D_ALL - 240,
    delay: at(240),
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  })
  play(closeEl.value, [
    { transform: 'scale(0.7)', opacity: 0 },
    { transform: 'scale(1)', opacity: 1 },
  ], { ...base, duration: reduce ? 1 : 320, delay: at(340) })

  closeEl.value?.focus?.({ preventScroll: true })
})

/** 倒放：同一组关键帧反向播，落点就是卡片原位，不必另写一套收起的帧 */
function runClose() {
  if (closing) return
  closing = true
  const pending = anims.map((anim) => {
    const effect = anim.effect
    // 只有已经落位的动画能换缓动：半路换会让进度当场跳一下，那就照旧倒放
    if (effect?.updateTiming && anim.playState === 'finished') {
      effect.updateTiming({ easing: mirroredEasing(effect.getTiming().easing) })
    }
    anim.reverse()
    try {
      anim.updatePlaybackRate(-CLOSE_RATE)
    } catch {
      // 个别实现不认负速率，退化成原速倒放
    }
    return anim.finished.catch(() => {})
  })

  // 展开的每条动画都在 D_ALL 同时收尾，倒放也就一起到位：卡片贴回源卡那一刻，
  // 边影已回到不透明、新增块已淡尽、水印与图标都落在原卡的对应元素上。
  // 先把真卡放出来（它压在覆盖层底下，看不见），卸载时就没有交接空档
  emit('release')

  Promise.all(pending).then(() => {
    // 位置、尺寸、内容都对上了，唯独底色对不齐：壳要贴住原卡就得非等比压扁，
    // 而原卡近方、大卡竖长，那几层渐变压过之后形状就变了。这一下没法靠几何消掉，
    // 只能等它整个到位以后再用极短的交叉淡化交出去 —— 边缩边淡会显得假，这样不会
    const hand = leftEl.value?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: reduce ? 1 : 110, easing: 'linear', fill: 'both' },
    )
    return hand?.finished.catch(() => {})
  }).then(() => {
    anims.forEach((anim) => anim.cancel())
    anims = []
    emit('closed')
  })
}

watch(() => store.closing, (value) => {
  if (value) runClose()
})

onBeforeUnmount(() => {
  anims.forEach((anim) => anim.cancel())
  anims = []
})
</script>

<template>
  <Teleport to="body">
    <div ref="rootEl" class="viewer" role="dialog" aria-modal="true" :aria-label="item.title">
      <!-- 遮罩不再关闭大卡，但要把点击吞掉，免得穿透到底下的列表。
           模糊与变暗拆成两层：模糊层透明度锁死，模糊结果才能被缓存复用；
           跟着动画淡入的只是里面那层纯渐变，它不动滤镜 -->
      <div ref="scrimEl" class="viewer__scrim" @click.stop @pointerdown.stop>
        <span ref="veilEl" class="viewer__veil" aria-hidden="true"></span>
      </div>

      <!-- 只提供最终矩形，永不参与动画、永不裁剪：里面的层各自飞各自的 -->
      <div class="viewer__panel" :style="{ '--accent': item.theme.base }">
        <!-- 大玻璃的两道外投影：搬出玻璃自己那一层。
            它们占了玻璃大半的重绘面积，又跟着非等比缩放每帧重光栅；
            单开一层静止不动、只淡入，观感一模一样，代价却只剩一次 -->
        <span ref="auraEl" class="viewer__aura" aria-hidden="true"></span>

        <!-- 玻璃层：唯一做非等比缩放的元素 -->
        <div ref="frameEl" class="viewer__frame">
          <div class="viewer__clip">
            <span ref="glowEl" class="viewer__glow" aria-hidden="true"></span>
            <span ref="sweepEl" class="viewer__sweep" aria-hidden="true"></span>
          </div>
        </div>

        <!-- 大图铺满右半边，左缘化进玻璃，右缘裁掉窗口自带的标题栏按钮 -->
        <div class="viewer__right">
          <img
            ref="shotEl"
            class="viewer__shot"
            :src="shot"
            :alt="item.title"
            width="1958"
            height="1050"
            draggable="false"
          />
        </div>

        <div ref="leftEl" class="viewer__left">
          <FeatureDetail ref="detailEl" class="viewer__detail" :item="item" :total="total" />
        </div>

        <button
          ref="closeEl"
          class="viewer__close"
          type="button"
          aria-label="关闭"
          @click="store.requestClose()"
        >
          <i-lucide-x width="20" height="20" aria-hidden="true" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  /* 压住顶栏：展开时全场只有一个焦点 */
  z-index: 200;
  user-select: none;
}

/* 模糊挂在不会被动画碰到的这一层上：它一旦跟着淡入，每帧都要把整屏重糊一遍 */
.viewer__scrim {
  position: absolute;
  inset: 0;
  backdrop-filter: blur(13px) saturate(118%);
  -webkit-backdrop-filter: blur(13px) saturate(118%);
}

/* 变暗单独一层，淡入只动它 */
.viewer__veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(78% 78% at 50% 46%, rgba(6, 10, 16, 0.44), rgba(3, 5, 9, 0.76));
}

.viewer__panel {
  --panel-w: min(92vw, 1680px);
  /* 高宽挂钩：截图是横的，窗口越宽越该扁，上下才不留大片空玻璃 */
  --panel-h: min(84vh, 900px, calc(var(--panel-w) * 0.45));
  --radius: 100px;
  --pad: clamp(16px, 2.6vh, 38px);
  --gap: clamp(18px, 2.4vw, 52px);
  /* 比例尺：大卡顶满左列内高，宽按同比例跟着涨，正文列宽才跟着同一倍率走 */
  --card-h: max(190px, calc(var(--panel-h) - 2 * var(--pad)));
  --card-w: calc(var(--card-h) * 0.85);

  position: absolute;
  inset: 0;
  margin: auto;
  width: var(--panel-w);
  height: var(--panel-h);
  pointer-events: none;
}

/* ===== 玻璃层 ===== */
/* 外投影：形状与玻璃一致，但它自己不动，所以只在预光栅那一帧光栅一次 */
.viewer__aura {
  position: absolute;
  inset: 0;
  border-radius: var(--radius);
  corner-shape: superellipse(3);
  box-shadow:
    0 22px 52px rgba(3, 6, 14, 0.6),
    /* 品牌色外发光原来给到 130px 半径，光栅化它一次要几十毫秒，收一半看不出差别 */
    0 44px 88px color-mix(in srgb, var(--accent) 16%, transparent);
  pointer-events: none;
  /* 不从 0 起手：透明度归零的层会被合成器判成不可见、跳过光栅，
     等它真要出场时才光栅，那一帧的卡顿就又回来了。千分之三肉眼等于没有 */
  opacity: 0.003;
  will-change: opacity;
}

.viewer__frame {
  position: absolute;
  inset: 0;
  /* 重绘范围锁在自己身上，别往外扩散 */
  contain: paint;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius);
  corner-shape: superellipse(3);
  background:
    radial-gradient(
      120% 92% at 6% -10%,
      color-mix(in srgb, var(--accent) 30%, transparent),
      transparent 58%
    ),
    radial-gradient(
      88% 72% at 104% 112%,
      color-mix(in srgb, var(--accent) 24%, transparent),
      transparent 60%
    ),
    linear-gradient(158deg, #2b313b 0%, #1d2129 52%, #14171d 100%);
  /* 外投影在 .viewer__aura 上：它不进这一层，非等比缩放期间就不必陪着重光栅 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  will-change: transform;
}

/* 裁剪单独一层：玻璃层自己不裁剪，分身与大图才能飞到卡片上去 */
.viewer__clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 网格暗纹与光晕都圈在这一层里重绘 */
  contain: paint;
  border-radius: inherit;
  corner-shape: superellipse(3);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent);
}

/* 左半边的细网格接上页面背景，右边有截图台，不必再铺 */
.viewer__clip::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: clamp(30px, 4.2vh, 52px) clamp(30px, 4.2vh, 52px);
  mask-image: radial-gradient(96% 100% at 0% 50%, #000 4%, transparent 62%);
  -webkit-mask-image: radial-gradient(96% 100% at 0% 50%, #000 4%, transparent 62%);
  opacity: 0.62;
}

.viewer__glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      46% 62% at 16% 26%,
      color-mix(in srgb, var(--accent) 26%, transparent),
      transparent 68%
    ),
    radial-gradient(60% 50% at 88% 82%, rgba(255, 255, 255, 0.07), transparent 66%);
}

/* 一道斜向光扫，擦过整块玻璃，只在留白处看得见 */
.viewer__sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -30%;
  width: 50%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.16), transparent);
}

/* ===== 左：大卡，按编辑式重排 ===== */
.viewer__left {
  position: absolute;
  left: var(--pad);
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  width: var(--card-w);
}

/* 卡后的品牌色灯：卡片从玻璃上浮起来，不再贴在深底上 */
.viewer__left::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--card-w) * 1.9);
  height: calc(var(--card-w) * 1.9);
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 30%, transparent), transparent 66%);
  opacity: 0.55;
  pointer-events: none;
}

/* 大窗里的卡壳不再补边光与外投影：落位后它是一块干净的深底，
   只有过渡期间那圈边影还顶着原卡 */
.viewer__detail :deep(.detail-halo) {
  opacity: 0.42;
}

/* ===== 右：大图顶满，从左往右渐显 ===== */
.viewer__right {
  position: absolute;
  left: calc(var(--pad) + var(--card-w) + var(--gap));
  /* 上右下三边直接顶到窗边，只在卡片这一侧留出渐隐的余地 */
  top: 0;
  right: 0;
  bottom: 0;
}

.viewer__shot {
  display: block;
  box-sizing: border-box;
  position: relative; /* 只求压住玻璃层那层背景，不能再抬 z-index：它得留在卡片分身底下 */
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 宽了裁右边（顺手裁掉窗口自带的标题栏按钮），矮了裁下边，标题栏永远留住 */
  object-position: left top;
  /* 左缘透明、右缘满显，图从卡片那侧化出来 */
  mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.5) 4%, #000 13%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.5) 4%, #000 13%);
  /* 右侧两角跟着窗的圆角走，顶满也不出框 */
  border-radius: 0 var(--radius) var(--radius) 0;
  corner-shape: superellipse(3);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  will-change: transform, opacity;
}

/* ===== 关闭 ===== */
.viewer__close {
  position: absolute;
  z-index: 3; /* 始终压在截图之上 */
  top: calc(var(--pad) + clamp(4px, 0.8vh, 10px));
  right: calc(var(--pad) + clamp(4px, 0.8vh, 10px));
  display: grid;
  place-items: center;
  width: clamp(44px, 4.4vh, 52px);
  height: clamp(44px, 4.4vh, 52px);
  padding: 0;
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: rgba(18, 22, 28, 0.72);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background 0.2s ease, color 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.viewer__close:hover {
  background: color-mix(in srgb, var(--accent) 40%, rgba(18, 22, 28, 0.9));
  color: #fff;
}

.viewer__close:active {
  scale: 0.92;
}

.viewer__close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, #fff);
  outline-offset: 3px;
}

.viewer__close svg {
  display: block;
}

/* 窄屏改成上下两段：几何全部现场量，任何版式都能起飞 */
@media (max-width: 900px) {
  .viewer__panel {
    /* 两段式排版：高度不再跟着宽度压 */
    --panel-h: min(84vh, 900px);
    /* 上段要容下卡里新加的栏目行与短线，比原来给得高一些 */
    --card-h: min(36vh, 58vw);
    --pad: clamp(14px, 2vh, 22px);
  }

  .viewer__left {
    left: 0;
    right: 0;
    bottom: auto;
    width: auto;
    height: 46%;
    justify-content: center;
  }

  .viewer__right {
    left: var(--pad);
    right: var(--pad);
    top: 49%;
    bottom: var(--pad);
  }

  /* 两段式排版里图是浮着的，四角都要圆 */
  .viewer__shot {
    border-radius: clamp(10px, 1.4vh, 18px);
  }
}
</style>
