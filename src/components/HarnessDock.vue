<script>
/**
 * 标签注册表（本文件唯一的"数据源"）
 *
 * 放在普通 <script> 块里并以命名导出交给宿主 App.vue：背景层整屏渲染哪一页由
 * App.vue 决定，而"项目里到底有哪些页面"只在 HarnessDock.vue 这一处定义。
 *
 * 注意：页面的挂载点是 App.vue 的 <component :is>，本组件只画左侧那枚玻璃胶囊 ——
 * 页面绝不出现在本组件的 DOM 里。
 */
import HomePage from '@/pages/HomePage.vue'
import Features from '@/pages/Features.vue'
import UpdateLog from '@/pages/UpdateLog.vue'
import ProjectInfo from '@/pages/ProjectInfo.vue'
import Issues from '@/pages/Issues.vue'

/* 图标走 unplugin-icons 构建期按需编译：不联网请求，也不把整套图标集打进包。
 * 统一用 solar 的 bold —— 描边约 2px，比线性图标粗一倍，小尺寸下仍然清楚。
 * 组件对象放进注册表，模板里用 <component :is> 渲染，加一个标签只改这一处。 */
import IconHome from '~icons/solar/home-2-bold'
import IconFeatures from '~icons/solar/widget-4-bold'
import IconUpdateLog from '~icons/solar/document-text-bold'
import IconProjectInfo from '~icons/solar/info-circle-bold'
import IconIssue from '~icons/solar/chat-round-dots-bold'

export const DOCK_TABS = [
  { id: 'home', short: '首页', file: 'HomePage.vue', desc: '粒子汇聚 / 标题起飞', comp: HomePage, icon: IconHome },
  { id: 'features', short: '功能', file: 'Features.vue', desc: '卡片网格 / 大屏模式', comp: Features, icon: IconFeatures },
  { id: 'updatelog', short: '更新', file: 'UpdateLog.vue', desc: '3D 卡片轴', comp: UpdateLog, icon: IconUpdateLog },
  /* dockless: 这一页是独立全屏页，从左下角导航坞里隐藏，只留顶栏入口 */
  { id: 'issue', short: 'Issue', file: 'Issues.vue', desc: '问题反馈 / 讨论', comp: Issues, icon: IconIssue, dockless: true },
  { id: 'projectinfo', short: '关于', file: 'ProjectInfo.vue', desc: '项目说明 / 二维码', comp: ProjectInfo, icon: IconProjectInfo },
]

/** 默认标签（启动即展示的那一页）。首页不显示顶栏开关，故这里也要用到 */
export const DOCK_HOME = DOCK_TABS[0].id
</script>

<script setup>
/**
 * 左侧导航坞：一枚竖向玻璃胶囊 = 圆形图标按钮组 + QQ 群入口。
 *
 * 视觉取自 BewlyCat 的右侧 dock（玻璃 + 圆角胶囊 + 圆形图标按钮 + 选中态光晕），
 * 材质沿用 BewlyCat 深色模式那一套 token，与本站 NavBar 是同一族的。
 *
 * 它不渲染任何页面，只对外表达一件事：
 *   v-model  当前该展示哪一页 → 宿主 App.vue 的背景层
 *
 * ── 怎么删掉它（两处、零残留）───────────────────────────────────────
 *   1. 删除本文件；
 *   2. 删除 App.vue 里带 [HARNESS-DOCK] 的行（import / activeId / navOpen / <HarnessDock />）。
 * 页面本体一行都不用动。
 */
import { onBeforeUnmount, ref } from 'vue'
import GlassSurface from './vue-bits/GlassSurface.vue'
import DockBurst from './DockBurst.vue'
import IconQQ from '~icons/simple-icons/qq'

const QQ_URL = 'https://qm.qq.com/q/Cb2vLZtsZ4'

/** 当前选中的标签 id：宿主说了算（v-model 双向绑定 App.vue 的 activeId） */
const activeId = defineModel({ type: String, default: DOCK_HOME })


// 模板只能引用 <script setup> 的绑定，这里把注册表接进来
/* dockless 的页面只是注册在表里供 App.vue 渲染，不进导航坞 */
const TABS = DOCK_TABS.filter((tab) => !tab.dockless)

/* 点击回响：每次按下都把 { id, seq } 换成新对象，seq 进 :key，
 * 于是 DockBurst 被整个重建一次 —— CSS 动画天然从头播，不需要手动 reset。
 * 动画最长的 qq 是 900ms + 5×65ms ≈ 1.2s，留 1.4s 再摘掉节点：
 * 播完的层是 opacity: 0 的幽灵节点，留在 DOM 里只会白占合成层。 */
const FX_LIFETIME = 1400
const fx = ref({ id: '', seq: 0 })
let seq = 0
let fxTimer = 0

function fire(id) {
  window.clearTimeout(fxTimer)
  fx.value = { id, seq: ++seq }
  fxTimer = window.setTimeout(() => {
    fx.value = { id: '', seq: 0 }
  }, FX_LIFETIME)
}

/* 回响先行、换页后退两帧。
 * 页面首次挂载实测要 70–120ms（features 92 / home 118），全部压在点击那一帧上 ——
 * 这就是"点下去卡一下"的来源，且与回响无关（去掉回响仍是 71ms）。
 * 先把回响交出去，它只动 transform / opacity，由合成线程播放，主线程随后被页面
 * 挂载占住也不影响它继续跑；用户看到的是"立刻有反馈，页面随后换"。
 * pending 令牌保证连点多个按钮时只有最后一次落地。 */
/** 鼠标刚移上按钮就把目标页交给宿主预热，真正按下时那一页已经是"热"的 */
function warm(id) {
  window.dispatchEvent(new CustomEvent('natb:warm', { detail: id }))
}

let pending = 0
function select(id) {
  fire(id)
  if (id === activeId.value) return
  const token = ++pending
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (token === pending) activeId.value = id
    }),
  )
}

onBeforeUnmount(() => window.clearTimeout(fxTimer))
</script>

<template>
  <!-- 两层：底下是一块液态玻璃（边缘用 SVG 位移贴图折射背景、中间清透），
       上面照旧是那组圆形图标按钮。玻璃只做背景，不参与任何按钮样式。 -->
  <div class="hd" :class="{ 'is-on-light': activeId === 'features' }">
    <GlassSurface
      class="hd__glass"
      width="100%"
      height="100%"
      :border-radius="50"
      :border-width="0.07"
      :displace="3"
      :distortion-scale="-180"
      :background-opacity="0.1"
      :saturation="1"
      :blur="7"
      :brightness="50"
    />

    <nav class="hd__inner" aria-label="页面与组件切换">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="hd__btn"
        :class="{ 'is-active': tab.id === activeId }"
        type="button"
        :aria-current="tab.id === activeId ? 'page' : undefined"
        :aria-label="tab.short"
        :title="`${tab.short} · ${tab.file} · ${tab.desc}`"
        @click="select(tab.id)"
        @pointerenter="warm(tab.id)"
      >
        <component :is="tab.icon" class="hd__icon" aria-hidden="true" />
        <DockBurst :kind="tab.id" :seq="fx.id === tab.id ? fx.seq : 0" />
      </button>

      <span
        class="hd__split"
        :class="{ 'is-on-light': activeId === 'features' }"
        aria-hidden="true"
      ></span>

      <a
        class="hd__btn hd__btn--link"
        :href="QQ_URL"
        target="_blank"
        rel="noopener"
        aria-label="加入 QQ 交流群"
        title="加入 QQ 交流群"
        @click="fire('qq')"
      >
        <IconQQ class="hd__icon" aria-hidden="true" />
        <DockBurst kind="qq" :seq="fx.id === 'qq' ? fx.seq : 0" />
      </a>
    </nav>
  </div>
</template>

<style scoped>
/* ─────────────────────────────────────────────────────────────────────
 * 忠诚移植 BewlyCat 的 dock（src/components/Dock/Dock.vue + styles/variables.scss）
 * 只取它的深色模式这一套 token，不掺本站配色：
 *   .dock-content-inner → .hd       （p-2 m-2 gap-2 rounded-full + edge-glow + glass）
 *   .dock-item          → .hd__btn  （w-45px aspect-square rounded-full fill + 缩放动效）
 *   .divider            → .hd__split（my-1 mx-3 h-2px）
 * 下面的自定义属性是 variables.scss 深色段（:388-467）的原值，一处未改。
 * ───────────────────────────────────────────────────────────────────── */
/* 定位层：只负责把这条钉在左侧，材质全部交给 GlassSurface */
.hd {
  position: fixed;
  /* .dock-content.left = left-2(8px) + inner 的 m-2(8px) */
  left: 16px;
  top: 50%;
  translate: 0 -50%;
  z-index: 2147483000; /* 高于站内一切 */
  /* 未选中的图标就是纯白：按钮是 color: inherit，这里不给颜色它们会继承正文色 */
  color: var(--bew-text-1);
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
  user-select: none;

  /* 下面这组是按钮的色彩来源，取自 BewlyCat 深色模式（variables.scss:388-467）的原值 */
  /* BewlyCat 原值 10% / 20% / 40% 是叠在它自己 0.68 的实玻璃上的；
   * 这里的背景是全透明的液态玻璃，10% 会薄到看不出圆底，所以整体加厚一档。
   * 图标仍是纯白（--bew-text-1），不做任何变色。 */
  --bew-fill-1: rgb(131 131 145 / 38%);
  --bew-fill-2: rgb(131 131 145 / 50%);
  --bew-fill-4: rgb(131 131 145 / 62%);
  --bew-fill-alt: var(--bew-fill-1);
  --bew-text-1: hsl(220 13% 95%);
  /* 分割线（.hd__split）的颜色。原移植里漏了这个 token，
   * background: var(--bew-border-color) 解析成无效值 → 分割线整条消失。
   * 深色玻璃上一档 16% 白，与站内其它发丝线同量级。 */
  --bew-border-color: rgb(255 255 255 / 16%);
  --bew-shadow-1: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06);
  --bew-shadow-2: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.08);
  --bew-shadow-edge-glow-1:
    inset 1px 1px 1px -0.5px rgba(255, 255, 255, 0.06), inset -1px -1px 1px -0.5px rgba(255, 255, 255, 0.03),
    inset 0 0 10px rgba(255, 255, 255, 0.02);
  --bew-ease-emphasized: cubic-bezier(0.34, 1.3, 0.64, 1);

  /* 点击回响的墨色（rgb 三元组）。白胶囊上是白；选中态那枚是纯白底，白粒子会整片
   * 消失，所以 is-active 换墨色。不用 mix-blend-mode：那会让整层失去合成缓存，
   * 实测每次点击多付 60ms 以上的重绘。 */
  --fx-ink: 255 255 255;
}

/* 背景层：只负责玻璃材质，铺满整条胶囊，永远不吃指针 */
.hd__glass.hd__glass {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  /* 边缘那圈灰（内阴影）只留最淡的两道：有轮廓，但不压成黑圈 */
  box-shadow:
    0 0 2px 1px rgba(0, 0, 0, 0.08) inset,
    0 0 10px 4px rgba(0, 0, 0, 0.05) inset !important;
}


/* 图标按钮组：浮在玻璃之上，样式与之前完全一致 */
.hd__inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px; /* gap-2 */
  padding: 8px; /* p-2 */
}

/* .dock-item：深色下 bg-$bew-fill-1，hover 抬到 fill-4 */
.hd__btn {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 45px; /* lg:w-45px */
  height: 45px; /* lg:h-45px */
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: var(--bew-fill-2);
  color: inherit;
  cursor: pointer;
  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  transition:
    transform 300ms var(--bew-ease-emphasized),
    background 300ms ease,
    color 300ms ease,
    box-shadow 300ms ease,
    opacity 300ms ease;
}

.hd__btn:hover {
  background: var(--bew-fill-4); /* dark-hover:bg-$bew-fill-4 */
  transform: scale(1.1); /* hover:scale-110 */
  box-shadow:
    var(--bew-shadow-edge-glow-1),
    0 0 0 2px var(--bew-fill-2),
    var(--bew-shadow-2);
}

.hd__btn:active {
  transform: scale(0.9) !important; /* active:important-scale-90 */
}

/* .dock-item.active：!dark:bg-white !dark:text-black + dark:shadow-$shadow-dark */
.hd__btn.is-active {
  --fx-ink: 18 18 20;
  background: #fff;
  color: #000;
  box-shadow: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
}

.hd__btn.is-active:hover {
  background: #fff;
  color: #000;
  transform: scale(1.1);
  box-shadow: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
}

.hd__btn:focus-visible {
  outline: 2px solid var(--bew-text-1);
  outline-offset: 2px;
}

/* 原版 tab 图标是 text-xl */
.hd__icon {
  width: 22px;
  height: 22px;
  pointer-events: none;
}

/* .divider：my-1 mx-3 h-2px rounded-full（列方向下宽度由 stretch 自然得到 45-24）
 * 注意：.hd__inner 是 align-items: center，flex item 默认不再 stretch，
 * 而 span 本身没有内容 —— 不加 align-self 的话宽度是 0，整条线根本画不出来。
 * 这里显式 stretch，线宽 = 内容宽 45 - 左右 margin 24。 */
.hd__split {
  flex: none;
  align-self: stretch;
  height: 2px;
  /* 上下留 2px（原本 4px）：线离两侧按钮各近 2px，间距从 12 收到 10 */
  margin: 2px 12px;
  background: var(--bew-border-color);
  border-radius: 9999px;
}

/* 功能页的卡片墙整体偏亮：白粒子在那上面几乎看不见，整条 dock 换成墨色回响。 */
.hd.is-on-light {
  --fx-ink: 18 18 20;
}

/* 第二页（功能）的卡片墙整体偏亮，16% 白线在那里会糊掉 ——
 * 这一页直接锁死成暗线，不做逐帧采样。其余页面仍走 --bew-border-color。 */
.hd__split.is-on-light {
  background: rgb(22 21 15 / 34%);
}

/* QQ 群入口用 <a>，套同一个圆按钮外观 */
.hd__btn--link {
  text-decoration: none;
}

/* 原版 lg 以下按钮是 w-35px */
@media (max-width: 1023px) {
  .hd__btn {
    width: 35px;
    height: 35px;
  }

  .hd__icon {
    width: 18px;
    height: 18px;
  }

  .hd__split {
    margin: 2px 8px;
  }
}

/* 小屏兜底：390px 宽下竖排在垂直居中会压住首页标题（left 28）与副标题（left 30），
 * 挪到左下角避开正文；左侧与竖排都保持不动。 */
@media (max-width: 719px) {
  .hd {
    left: 12px;
    top: auto;
    bottom: 12px;
    translate: none;
  }
}
</style>