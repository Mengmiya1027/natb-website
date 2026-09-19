<script setup>
/**
 * 大卡：大窗左半边那张卡。
 * 与小卡分开写，FeatureCard 一行不改，小卡样式就不受牵连。
 * 版式改编辑式，但卡宽与正文列宽仍照小卡公式折算，
 * 展开时逐元素等比 FLIP 才不会把文字拉变形。
 */
import { ref } from 'vue'

const props = defineProps({
  item: { type: Object, required: true },
  /** 特色功能总条数，只给底部的 "04 / 08" 用 */
  total: { type: Number, default: 0 },
})

const shell = ref(null)
const edge = ref(null)
const no = ref(null)
const top = ref(null)
const icon = ref(null)
const title = ref(null)
const rule = ref(null)
const desc = ref(null)

// 交给大窗编排动画：壳与非等比、元素各自等比，两边算法不同
defineExpose({ shell, edge, no, top, icon, title, rule, desc })
</script>

<template>
  <article class="detail" :style="{ '--accent': item.theme.base, '--logo': item.src }">
    <!-- 壳在动画期间只当裁剪框：底色与底纹线都挪进 .detail-skin 这层独立的合成层。
        圆角要补间，而圆角是绘制属性，内容留在壳里就得每帧整块重画一次；
        拆出去以后每帧只改裁剪，壳自己不上色，等于零代价 -->
    <div ref="shell" class="detail-shell" aria-hidden="true">
      <!-- 光斑与底纹线一起放进底纹层：三者叠放次序与小卡一字不变，
           又都不必跟着圆角补间重画 -->
      <span class="detail-skin">
        <span class="detail-halo"></span>
      </span>
      <!-- 水印留在壳里才跟着一起缩、一起被裁；位置靠脚本的补偿变换搬回原卡 -->
      <span ref="no" class="detail-no">{{ item.no }}</span>
    </div>

    <!-- 边与影单独一层：贴回原位的路上顶着原卡的边影，落位后淡掉。
        放在壳外是因为壳要裁光斑，留在壳里阴影会被一起裁掉 -->
    <span ref="edge" class="detail-edge" aria-hidden="true">
      <!-- 外投影再单提一层：三个大模糊跟着圆角补间重画的代价太高，
          而阴影本身糊得看不出圆角的一点点出入，固定形状就够 -->
      <span class="detail-cast"></span>
    </span>

    <div class="detail-body">
      <header ref="top" class="detail-top">
        <span class="detail-eyebrow">FEATURES</span>
      </header>

      <div class="detail-main">
        <span ref="icon" class="detail-icon">
          <component :is="item.icon" width="40" height="40" />
        </span>
        <h2 ref="title" class="detail-title">{{ item.title }}</h2>
        <span ref="rule" class="detail-rule" aria-hidden="true"></span>
        <p ref="desc" class="detail-desc">{{ item.desc }}</p>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* 卡宽、字号、内距、圆角全按 --card-h 折算，与大卡外层给的比例尺同源 */
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
  /* 与小卡逐字同一条公式：半径 0.66H、超椭圆转角，两边的圆角才是一回事 */
  border-radius: calc(var(--card-h) * 0.66);
  corner-shape: superellipse(3.25);
  /* 自己一点颜色都不上：底色全在 .detail-skin 里 */
  will-change: transform;
}

/* 壳的底色：与小卡同一套，展开时才是"同一张卡长大"。
   提成独立合成层，圆角补间期间壳整块重画也波及不到它 */
.detail-skin {
  position: absolute;
  inset: 0;
  will-change: transform;
  background:
    radial-gradient(
      122% 96% at 88% 114%,
      color-mix(in srgb, var(--accent) 24%, transparent) 0%,
      transparent 64%
    ),
    radial-gradient(90% 70% at 8% -14%, rgba(255, 255, 255, 0.11) 0%, transparent 62%),
    linear-gradient(158deg, #363c47 0%, #22262e 48%, #181b22 100%);
}

/* 大卡落位后是不留边框与阴影的，所以边影借这一层顶着，只动 opacity 走合成；
   放在壳外才不会被壳的 overflow 裁掉投影 */
.detail-edge {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: calc(var(--card-h) * 0.66);
  corner-shape: superellipse(3.25);
  /* 大的外投影交给 .detail-cast，这里只剩发丝线与两道内高光，重画很便宜 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  pointer-events: none;
}

/* 外投影：形状固定（圆角取大卡那一档），只跟着边的 transform 与 opacity 走 */
.detail-cast {
  position: absolute;
  inset: 0;
  border-radius: calc(var(--card-h) * 0.66);
  corner-shape: superellipse(3.25);
  will-change: transform;
  box-shadow:
    0 2px 4px rgba(8, 12, 24, 0.28),
    0 14px 28px rgba(8, 12, 24, 0.26),
    0 30px 58px rgba(8, 12, 24, 0.22);
}

/* 品牌色雾：位置尺寸同小卡，压回源卡时正好落在同一处 */
.detail-halo {
  position: absolute;
  right: calc(var(--card-h) * -0.03);
  bottom: calc(var(--card-h) * -0.06);
  width: calc(var(--card-h) * 0.72);
  height: calc(var(--card-h) * 0.72);
  background-image: var(--logo);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  mask-image: radial-gradient(circle at 72% 72%, #000 30%, rgba(0, 0, 0, 0.45) 62%, transparent 92%);
  -webkit-mask-image: radial-gradient(
    circle at 72% 72%,
    #000 30%,
    rgba(0, 0, 0, 0.45) 62%,
    transparent 92%
  );
  /* 大卡上再透一档，别糊住正文 */
  opacity: 0.4;
  /* 模糊烘在图标里：壳每帧都在缩放，挂实时滤镜就得每换一个尺寸重光栅一次 */
  /* 提成独立层：圆角动画期间壳要整块重画，这张大图不必跟着重画 */
  will-change: transform;
  pointer-events: none;
}

/* 水印留在壳内：这样它跟着一起缩、也被壳裁着，不会在收起时甩到卡片外面。
   纵向抄小卡的 -0.12H，跟着一起出血；位置上的误差由脚本那条补偿变换抹平 */
.detail-no {
  position: absolute;
  top: calc(var(--card-h) * -0.04);
  right: 2%;
  font-family: Arial, system-ui;
  font-size: calc(var(--card-h) * 0.44);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  /* 大卡上退成纯底纹，别跟标题抢重量 */
  color: color-mix(in srgb, var(--accent) 22%, transparent);
  pointer-events: none;
}

/* 小卡底部那道渐隐强调线，抄同一套折算，位置才跟着壳一起回到原卡。
   画在底纹层上：壳不再上色，它跟着壳的映射走，形状也永远对齐壳的内沿 */
.detail-skin::after {
  content: '';
  position: absolute;
  left: calc(var(--card-h) * 0.064);
  right: calc(var(--card-h) * 0.22);
  bottom: calc(var(--card-h) * 0.06);
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 92%, transparent),
    color-mix(in srgb, var(--accent) 0%, transparent)
  );
}

/* ===== 内容层：壳的兄弟，不跟着壳缩放，每个元素自己飞 ===== */
.detail-body {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: calc(var(--card-h) * 0.016);
  /* 左右内距必须与小卡同值：正文列宽不变，换行点才不变 */
  padding: calc(var(--card-h) * 0.034) calc(var(--card-h) * 0.064) calc(var(--card-h) * 0.045);
}

.detail-top,
.detail-main {
  position: relative;
  z-index: 1; /* 压住水印 */
}

.detail-top {
  flex: none;
}

.detail-eyebrow {
  font-family: Arial, system-ui;
  font-size: calc(var(--card-h) * 0.03);
  font-weight: 700;
  letter-spacing: 0.3em;
  color: rgba(148, 174, 214, 0.62);
}

.detail-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  /* 顶到 main 上沿，不随正文长短上下浮动：内容少的卡图标也不会往下沉 */
  justify-content: flex-start;
  gap: calc(var(--card-h) * 0.016);
  min-height: 0;
  /* 这里不能裁：FLIP 期间元素是被 transform 到原卡位置去的，那位置在本盒之外，
     裁了就会出现"收起时空壳在缩、文字先没了"。壳自己有 overflow，裁得也才跟着走 */
}

.detail-icon {
  flex: none;
  display: grid;
  place-items: center;
  /* 往卡片上边靠一点：原来上方留白偏多，整组看着往下坠 */
  margin-top: calc(var(--card-h) * 0.02);
  width: calc(var(--card-h) * 0.13);
  height: calc(var(--card-h) * 0.13);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: calc(var(--card-h) * 0.046);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--accent) 34%, transparent),
    color-mix(in srgb, var(--accent) 9%, transparent)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 calc(var(--card-h) * 0.1) color-mix(in srgb, var(--accent) 24%, transparent);
  color: color-mix(in srgb, var(--accent) 76%, #ffffff);
}

.detail-icon svg {
  display: block;
  width: calc(var(--card-h) * 0.07);
  height: calc(var(--card-h) * 0.07);
}

.detail-title {
  flex: none;
  /* 收缩到文字宽：中心对位才准，缩放比也才认得出字号 */
  align-self: flex-start;
  /* 图标与标题是一组，比其余间隙再松一点 */
  margin: calc(var(--card-h) * 0.01) 0 0;
  font-size: calc(var(--card-h) * 0.09);
  font-weight: 700;
  letter-spacing: 0.01em;
  /* 与小卡同值：等比缩放时宽高比才对得上 */
  line-height: 1.2;
  color: #f5f8fc;
  /* 品牌色柔光，深底上把标题托起来 */
  text-shadow: 0 0 calc(var(--card-h) * 0.09) color-mix(in srgb, var(--accent) 30%, transparent);
}

.detail-rule {
  flex: none;
  display: block;
  width: calc(var(--card-h) * 0.2);
  height: 3px;
  /* 离标题远一点，才像分隔而不是下划线 */
  margin-top: calc(var(--card-h) * 0.008);
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--accent) 92%, transparent),
    color-mix(in srgb, var(--accent) 6%, transparent)
  );
}

.detail-desc {
  /* 允许被压：真溢出了由 main 裁掉，不外淌 */
  flex: 0 1 auto;
  margin: calc(var(--card-h) * 0.008) 0 0;
  overflow: hidden;
  /* 字号照小卡公式，配合同宽的列，断行逐字一致 */
  font-size: max(14px, calc(var(--card-h) * 0.07));
  line-height: 1.68;
  text-wrap: pretty;
  overflow-wrap: break-word;
  color: #c3ccdb;
}
</style>
