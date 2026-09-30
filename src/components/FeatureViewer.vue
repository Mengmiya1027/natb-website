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
const detailEl = ref(null)
const leftEl = ref(null)
const shotEl = ref(null)
const closeEl = ref(null)

// 大窗右侧放的是产品的真实界面截图（features/screenshot 下），
// 卡片上那张封面是另一回事 —— 两者各司其职，不是同一张图
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

/**
 * Esc 关闭：焦点进了展开层，键盘用户必须能原路退出去。
 * 监听挂在组件生命周期上 —— 本层是 v-if 渲染的，收起时监听一并撤掉，
 * 不会留给后面的页面。
 */
function onKeydown(e) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  store.requestClose()
}

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
  window.addEventListener('keydown', onKeydown)
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
  window.removeEventListener('keydown', onKeydown)
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
      <!-- 面板底色跟着被点开的那一格走（--tint）：展开时是"这张卡长大了"，
           颜色一路接得上，而不是"跳出来一个别的窗口" -->
      <div class="viewer__panel" :style="{ '--tint': item.tint }">
        <!-- 大玻璃的两道外投影：搬出玻璃自己那一层。
            它们占了玻璃大半的重绘面积，又跟着非等比缩放每帧重光栅；
            单开一层静止不动、只淡入，观感一模一样，代价却只剩一次 -->
        <span ref="auraEl" class="viewer__aura" aria-hidden="true"></span>

        <!-- 玻璃层：唯一做非等比缩放的元素。里面是空的 ——
             光扫与网格暗纹都撤了，落位后它就是一块干净的墨底 -->
        <div ref="frameEl" class="viewer__frame">
          <div class="viewer__clip"></div>
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
  /* 强调色只剩两处用途：焦点环与关闭按钮。不再按每项品牌色换肤 ——
     八种品牌色轮番出现，正是"模板感"最省事的来源 */
  --accent: #6ea8ff;

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
  --radius: 20px;
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
  /* 克制阴影：一层贴边 + 一层扩散，够把面板从背景上托起来即可。
     原来那道 88px 的品牌色外发光整块撤掉 —— 编辑版式不靠光晕造气氛 */
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.4),
    0 24px 64px rgba(0, 0, 0, 0.46);
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
  border: 1px solid rgba(22, 21, 15, 0.1);
  border-radius: var(--radius);
  /* 与墙里的格子同一种色板：大窗是从那张卡长出来的，不该在半路换一层材质 */
  background: var(--tint, #f8f6f2);
  /* 外投影在 .viewer__aura 上：它不进这一层，非等比缩放期间就不必陪着重光栅 */
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  will-change: transform;
}

/* 裁剪单独一层：玻璃层自己不裁剪，分身与大图才能飞到卡片上去 */
.viewer__clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
  contain: paint;
  border-radius: inherit;
  /* 原来这里铺了一层网格暗纹去接页面背景。编辑版式里，那层暗纹正是
     "模板味"最明显的来源之一 —— 撤掉，让墨底就是墨底 */
}

/* 光斑与光扫整块撤掉：大窗的光来自右侧那张截图，不靠自己发光 */

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

/* 卡后的品牌色灯与卡上的水印都撤掉：左列现在只有字，
   光来自右边那张图 —— 一处光源就够，两处就开始互相打架 */

/* ===== 右：大图顶满，从左往右渐显 ===== */
.viewer__right {
  position: absolute;
  left: calc(var(--pad) + var(--card-w) + var(--gap));
  /* 上右下三边直接顶到窗边，只在卡片这一侧留出渐隐的余地 */
  top: 0;
  right: 0;
  bottom: 0;
  /* 大图上下各溢出一截，多出来的部分在这里被收掉 */
  overflow: hidden;
  /* 圆角得画在这一层：截图层是 .viewer__frame 的兄弟节点，
     不在那个 border-radius: inherit 的 .viewer__clip 里，裁不到它；
     而 .viewer__shot 自己上下各溢出 3%，它的角也在框外。
     只圆右侧两角 —— 左缘是化进玻璃的渐隐边，不该有角 */
  border-radius: 0 var(--radius) var(--radius) 0;
}

.viewer__shot {
  display: block;
  box-sizing: border-box;
  position: absolute;
  left: 0;
  right: 0;
  width: 100%;
  /* 上下各溢出一小截：cover 之下纵向本来正好贴合，object-position 的纵向分量
     根本不起作用 —— 截图顶上那条系统标题栏就永远赖在画面里。留 6% 的余量、
     上移 3%，刚好把标题栏裁掉，又不至于把界面放大到失真 */
  top: -3.2%;
  height: 106%;
  object-fit: cover;
  object-position: left center;
  /* 左缘透明、右缘满显，图从卡片那侧化出来 */
  mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.5) 4%, #000 13%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgba(0, 0, 0, 0.5) 4%, #000 13%);
  /* 圆角交给 .viewer__right 裁 —— 这里自己画没用，角在容器外 */
  border-radius: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 120px;
  background: rgba(18, 19, 22, 0.76);
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background 0.2s ease, color 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 悬停直接反色到墨黑：在亮面板上最干脆的一种"我按得动" */
.viewer__close:hover {
  background: #16150f;
  border-color: #16150f;
  color: #f8f6f2;
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

  /* 两段式排版里图是浮着的，四角同样只留 4px */
  .viewer__shot {
    border-radius: var(--radius);
  }
}
</style>
