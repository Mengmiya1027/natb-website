<script setup>
/**
 * 大卡：大窗左半边那块"编辑栏"。
 *
 * 旧版是"小海报放大"——玻璃渐变、品牌色水印、超大序号、超椭圆圆角，
 * 五层装饰一起长大，落进大窗就成了一块过度设计的贴片。
 * 这一版把它当杂志的图文页做：编号、图标、标题、一道短线、正文，仅此而已；
 * 底色与图片墙用同一种墨色，主次全靠字阶与留白分。
 *
 * 尺寸仍按 --card-h 折算，与墙里那套公式同源：展开时壳要非等比压回原格，
 * 两边比例尺对不上，贴回去的那一帧就会跳。
 * 暴露的 ref 名字一个没改 —— FeatureViewer 的逐元素 FLIP 认的就是它们。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  /** 特色功能总条数，只给底部的 "04 / 08" 用 */
  total: { type: Number, default: 0 },
})

// 页码式计数：编辑版式里"第几篇 / 共几篇"是常规记号
const counter = computed(() =>
  props.total ? `${props.item.no} / ${String(props.total).padStart(2, '0')}` : props.item.no,
)

const shell = ref(null)
const edge = ref(null)
const top = ref(null)
const icon = ref(null)
const title = ref(null)
const rule = ref(null)
const desc = ref(null)

// 交给大窗编排动画：壳与非等比、元素各自等比，两边算法不同
defineExpose({ shell, edge, top, icon, title, rule, desc })
</script>

<template>
  <article class="detail">
    <!-- 壳在动画期间只当裁剪框：底色挪进 .detail-skin 这层独立的合成层。
         圆角要补间，而圆角是绘制属性，内容留在壳里就得每帧整块重画一次；
         拆出去以后每帧只改裁剪，壳自己不上色，等于零代价 -->
    <div ref="shell" class="detail-shell" aria-hidden="true">
      <span class="detail-skin"></span>
    </div>

    <!-- 边与影单独一层：贴回原位的路上顶着原格的边影，落位后淡掉。
         放在壳外是因为壳要裁剪，留在壳里阴影会被一起裁掉 -->
    <span ref="edge" class="detail-edge" aria-hidden="true">
      <span class="detail-cast"></span>
    </span>

    <div class="detail-body">
      <header ref="top" class="detail-top">
        <span class="detail-eyebrow">FEATURES</span>
        <span class="detail-counter">{{ counter }}</span>
      </header>

      <div class="detail-main">
        <span ref="icon" class="detail-icon">
          <component :is="item.icon" width="26" height="26" />
        </span>
        <h2 ref="title" class="detail-title">{{ item.title }}</h2>
        <span ref="rule" class="detail-rule" aria-hidden="true"></span>
        <p ref="desc" class="detail-desc">{{ item.desc }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* 卡宽、字号、内距全按 --card-h 折算，与墙里那套比例尺同源 */
.detail {
  position: relative;
  width: var(--card-w, calc(var(--card-h) * 0.85));
  height: var(--card-h);
  isolation: isolate;
}

/* ===== 壳 ===== */
.detail-shell {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* 与墙里的格子同一条公式：2px。贴回原位的那一帧两边圆角必须一模一样 */
  border-radius: 2px;
  will-change: transform;
}

/* 壳的底色：跟着被点开那一格的色板走 —— 展开是"这张卡长大了"，
   颜色不能在半路断掉，否则看着就是"跳出来另一个窗口" */
.detail-skin {
  position: absolute;
  inset: 0;
  will-change: transform;
  background: var(--tint, #f8f6f2);
}

/* 大卡落位后不留边框与阴影，边影只在这条路上顶着。
   放在壳外才不会被壳的 overflow 裁掉 */
.detail-edge {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(22, 21, 15, 0.1);
  border-radius: 2px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  pointer-events: none;
}

/* 外投影只留两段、且都很浅：过渡期间顶住原格的边影，落位后整体淡掉 */
.detail-cast {
  position: absolute;
  inset: 0;
  border-radius: 2px;
  will-change: transform;
  box-shadow:
    0 2px 6px rgba(22, 21, 15, 0.16),
    0 16px 40px rgba(22, 21, 15, 0.18);
}

/* ===== 内容层：壳的兄弟，不跟着壳缩放，每个元素自己飞 ===== */
.detail-body {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: calc(var(--card-h) * 0.02);
  /* 左右内距与墙里的格子同值：正文列宽不变，断行位置才一致 */
  padding: calc(var(--card-h) * 0.05) calc(var(--card-h) * 0.062) calc(var(--card-h) * 0.068);
}

.detail-top,
.detail-main {
  position: relative;
  z-index: 1; /* 压住页码 */
}

.detail-top {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8em;
}

.detail-eyebrow,
.detail-counter {
  font-family: var(--font-latin, ui-sans-serif, system-ui, sans-serif);
  font-size: calc(var(--card-h) * 0.026);
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  /* 实测：0.5 只有 3.46:1，小字不够 AA。这是"第几篇 / 共几篇"的信息，不是花纹 */
  color: rgba(22, 21, 15, 0.66);
  white-space: nowrap;
}

.detail-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  /* 贴底对齐：与墙里格子的图注同一套读法，视线落点不必重新找 */
  justify-content: flex-end;
  gap: calc(var(--card-h) * 0.016);
  min-height: 0;
  /* 这里不能裁：FLIP 期间元素是被 transform 到原格位置去的，那位置在本盒之外，
     裁了就会出现"收起时空壳在缩、文字先没了"。壳自己有 overflow，裁得也才跟着走 */
}

.detail-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: calc(var(--card-h) * 0.1);
  height: calc(var(--card-h) * 0.1);
  /* 单色线图标：编辑版式里图标是标点，不是徽章 */
  color: rgba(22, 21, 15, 0.5);
}

.detail-icon svg {
  display: block;
  width: calc(var(--card-h) * 0.062);
  height: calc(var(--card-h) * 0.062);
}

.detail-title {
  flex: none;
  /* 收缩到文字宽：中心对位才准，缩放比也才认得出字号 */
  align-self: flex-start;
  margin: 0;
  font-size: calc(var(--card-h) * 0.105);
  font-weight: 700;
  letter-spacing: -0.005em;
  line-height: 1.08;
  color: #16150f;
}

.detail-rule {
  flex: none;
  display: block;
  width: calc(var(--card-h) * 0.16);
  height: 1px;
  margin: calc(var(--card-h) * 0.006) 0;
  background: rgba(22, 21, 15, 0.22);
}

.detail-desc {
  /* 允许被压：真溢出了由 main 裁掉，不外淌 */
  flex: 0 1 auto;
  margin: 0;
  overflow: hidden;
  font-size: max(13px, calc(var(--card-h) * 0.046));
  line-height: 1.72;
  text-wrap: pretty;
  overflow-wrap: break-word;
  color: rgba(22, 21, 15, 0.68);
}
</style>
