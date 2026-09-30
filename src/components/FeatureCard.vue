<script setup>
/**
 * 图片墙的一格：一张手绘的抽象插画 + 图注。
 *
 * 版式是"上图下文"：插画出血铺满上半部，图注落在下半部的纸色区。
 * 上一版把产品截图直接当主视觉 —— 八张黑色终端窗口排成一面墙，
 * 那是"截图墙"，不是画报。画报的主视觉得自己画：这一版每格一张
 * 按功能构图的抽象插画（见 Features 里的 ART），真实界面留到展开后再看。
 *
 * 三层变换各走各的道：父级 grid 的视差平移、入场用 translate 属性、
 * 指针倾斜用 transform，互不覆盖。
 */
defineProps({
  item: { type: Object, required: true },
})
</script>

<template>
  <!-- 根用 button：整格可点，键盘 Tab / Enter 天生能到。
       button 的内容模型只许 phrasing content，所以内部一律 span。 -->
  <button
    type="button"
    class="cell"
    :style="{ '--tint': item.tint, '--art-ink': item.artInk }"
    :aria-label="`${item.title}：${item.desc}`"
  >
    <!-- 插画是内联 SVG（静态内容，来源可信），样式全写在 SVG 自己的属性上 -->
    <span class="cell__art" aria-hidden="true">
      <img class="cell__art-img" :src="item.art" alt="" draggable="false" />
    </span>

    <span class="cell__body">
      <!-- 不编号：卡片上只留标题与一句话。序号是版面上最容易变成噪音的那种装饰，
           真要"第几项"的信息，展开大窗里已经写着 -->
      <span class="cell__head">
        <span class="cell__icon" aria-hidden="true">
          <component :is="item.icon" width="14" height="14" />
        </span>
        <span class="cell__title">{{ item.title }}</span>
      </span>
      <span class="cell__desc">{{ item.desc }}</span>
    </span>
  </button>
</template>

<style scoped>
.cell {
  /* 内距压到最小：格子里每一像素都留给插画 */
  --pad: clamp(9px, 0.9vw, 14px);

  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  /* 出血版式：内距只给图注那一半，插画要顶到边 */
  padding: 0;
  overflow: hidden;

  /* 直角版式：2px 只用来消掉亚像素毛边，不是"圆角" */
  border: 0;
  border-radius: 2px;
  background: var(--tint, #eeebe5);
  color: #16150f;
  font: inherit;
  text-align: left;
  cursor: pointer;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;

  /* 倾斜、抬起、放大共用一个 transform —— 分几条写会互相覆盖。
     perspective 收在 900px：远了 3D 就等于没有 */
  transform: perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))
    translateZ(var(--lift-z, 0px)) scale(var(--lift, 1));
  transition:
    transform 380ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 380ms ease,
    border-radius 380ms ease;
}

/* ── 悬停：整格朝指针方向仰起，同时抬离版面 ——
     放大 6%、上浮 28px（在 900px 透视下又自带约 3% 的增益），
     再压两层落差明显的投影。上一版只给 3.5% 又没有 z 位移，等于没动 ── */
.cell:hover,
.cell:focus-visible {
  --lift: 1.1;
  --lift-z: 28px;
  z-index: 2;
  box-shadow:
    0 6px 14px rgba(22, 21, 15, 0.16),
    0 26px 54px rgba(22, 21, 15, 0.22);
  border-radius: 8px;
}

/* 插画：出血铺满上半部。overflow 裁掉 cover 溢出的部分 */
.cell__art {
  position: relative;
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.cell__art-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform 720ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 只在底部一段化进卡片色，图与文字之间不留硬边。
   上一版把渐变铺满整张（顶部 78%、底部 94%），等于给插画盖了层纱 ——
   旁边的装饰格是鲜的，卡片却是灰的，一眼就看出不对 */
.cell__art::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0%,
    transparent 58%,
    color-mix(in srgb, var(--tint) 52%, transparent) 82%,
    color-mix(in srgb, var(--tint) 96%, transparent) 100%
  );
}

.cell__body {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: clamp(2px, 0.35vh, 5px);
  padding: var(--pad);
}

/* 页码那一档已经撤掉：卡片上只留标题与一句话 */
.cell__head {
  display: flex;
  align-items: center;
  gap: 0.46em;
  transition: transform 460ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cell__icon {
  flex: none;
  display: grid;
  place-items: center;
  color: rgba(22, 21, 15, 0.5);
  transition: color 320ms ease;
}

.cell__title {
  min-width: 0;
  /* 这一格的主角：字号压过编号与正文整整一档 */
  font-size: clamp(15px, 1.08vw, 19px);
  font-weight: 700;
  letter-spacing: 0.005em;
  line-height: 1.15;
  color: #16150f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell__desc {
  /* 默认就可见：信息不挂在 hover 上，触摸与键盘都没有 hover。
     亮底深字，对比度实测 4.65:1，稳过 AA */
  font-size: clamp(10.5px, 0.7vw, 12px);
  line-height: 1.55;
  color: rgba(22, 21, 15, 0.64);
  /* 两行封顶：格子高度只有那么多，多出来的留给上面的插画 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 320ms ease;
}

/* ── 微交互：插画轻轻推近一点。是"凑近看"，不是"弹一下" ── */
.cell:hover .cell__art :deep(svg),
.cell:focus-visible .cell__art :deep(svg) {
  transform: scale(1.04);
}

.cell:hover .cell__head,
.cell:focus-visible .cell__head {
  transform: translateX(2px);
}

.cell:hover .cell__icon,
.cell:focus-visible .cell__icon {
  color: rgba(22, 21, 15, 0.82);
}

.cell:hover .cell__desc,
.cell:focus-visible .cell__desc {
  color: rgba(22, 21, 15, 0.82);
}

/* 焦点必须看得见：亮底上用品牌蓝描边，外扩 2px 不压内容 */
.cell:focus-visible {
  outline: 2px solid #0a59f7;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cell,
  .cell__art :deep(svg),
  .cell__head,
  .cell__icon,
  .cell__desc {
    transition: none;
  }

  /* 少动效时连"抬起"也免了：它靠的是缩放，本身就是动效 */
  .cell:hover,
  .cell:focus-visible {
    --lift: 1;
  }

  .cell:hover .cell__art :deep(svg),
  .cell:focus-visible .cell__art :deep(svg),
  .cell:hover .cell__head,
  .cell:focus-visible .cell__head {
    transform: none;
  }
}
</style>
