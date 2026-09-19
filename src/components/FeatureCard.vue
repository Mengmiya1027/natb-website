<script setup>
/**
 * 卡片本体：斜向滚动栏与大窗共用一份。
 * 卡内一切尺寸都由祖先给的 --card-h 折算，所以"放大"只是换了个 --card-h，
 * 版式比例、换行点、截断行数都不会变 —— 大窗里就是原卡按比例变大。
 */
defineProps({
  item: { type: Object, required: true },
  /** 大窗那版用清晰图标 + CSS 模糊：SVG 滤镜换尺寸要重光栅，展开时会卡一下 */
  sharp: { type: Boolean, default: false },
})
</script>

<template>
  <article
    class="card"
    :style="{
      '--accent': item.theme.base,
      '--logo': item.src,
      '--logo-sharp': item.srcSharp,
    }"
  >
    <!-- 超大序号当背景水印，超出卡片的部分被裁掉 -->
    <span class="card-no" aria-hidden="true">{{ item.no }}</span>
    <!-- 品牌色水印：垫在磨砂层底下，透过玻璃化成一层彩雾 -->
    <span class="card-halo" :class="{ 'is-sharp': sharp }" aria-hidden="true"></span>
    <header class="card-head">
      <!-- 主图标走 solar 系列 -->
      <span class="card-icon">
        <component :is="item.icon" width="20" height="20" />
      </span>
      <h2 class="card-title">{{ item.title }}</h2>
    </header>
    <p class="card-desc">{{ item.desc }}</p>
  </article>
</template>

<style scoped>
/* 卡内一切尺寸都按卡高折算，比例由 --card-w 定 */
.card {
  /* 版式自成一格：这些子树的布局与样式计算可以不再波及外面 */
  contain: layout style paint;
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: calc(var(--card-h) * 0.026);
  width: var(--card-w, calc(var(--card-h) * 0.85));
  height: fit-content;
  /* 间距用外边距，一份列表的高度才严格等于八张 */
  margin-bottom: var(--card-gap, 0px);
  /* 左右比上下宽一点：和浅色弧区并排，横向不留空虚 */
  padding: calc(var(--card-h) * 0.056) calc(var(--card-h) * 0.064) calc(var(--card-h) * 0.088);

  overflow: hidden;
  /* 自成层叠上下文，水印才能垫在内容下 */
  isolation: isolate;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: calc(var(--card-h) * 0.66);
  corner-shape: superellipse(3.25);
  /* 深蓝墨底：底色几乎压满，压住后面浅弧区，深底上还要留住品牌色 */
  background:
    radial-gradient(
      122% 96% at 88% 114%,
      color-mix(in srgb, var(--accent) 24%, transparent) 0%,
      transparent 64%
    ),
    radial-gradient(90% 70% at 8% -14%, rgba(255, 255, 255, 0.11) 0%, transparent 62%),
    linear-gradient(158deg, #363c47 0%, #22262e 48%, #181b22 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.13),
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 2px 4px rgba(8, 12, 24, 0.28),
    0 14px 28px rgba(8, 12, 24, 0.26),
    0 30px 58px rgba(8, 12, 24, 0.22);
  transition:
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.32s ease,
    border-color 0.32s ease;
}

/* 语言图标只当背景：原封不动的彩色图标糊开，在深底上化成一层品牌色雾 */
.card-halo {
  position: absolute;
  right: calc(var(--card-h) * -0.03);
  bottom: calc(var(--card-h) * -0.06);
  z-index: -2; /* 垫到最底下 */
  width: calc(var(--card-h) * 0.72);
  height: calc(var(--card-h) * 0.72);
  /* 直接用图标本身的彩色版，不再换成单色遮罩 */
  background-image: var(--logo);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  /* 模糊已经烘进图标本身，这里只留一层渐隐：图形芯子还认得出，外圈直接化进底色 */
  mask-image: radial-gradient(circle at 72% 72%, #000 30%, rgba(0, 0, 0, 0.45) 62%, transparent 92%);
  -webkit-mask-image: radial-gradient(
    circle at 72% 72%,
    #000 30%,
    rgba(0, 0, 0, 0.45) 62%,
    transparent 92%
  );
  opacity: 0.34;
  pointer-events: none;
}

/* 清晰图标 + 同比例的 CSS 模糊：观感与烘进 SVG 的那版一致，但换尺寸不必重光栅 */
.card-halo.is-sharp {
  background-image: var(--logo-sharp);
  filter: blur(calc(var(--card-h) * 0.0096));
}

/* 底部一道渐隐强调线，代替满卡留白 */
.card::after {
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

.card:hover {
  border-color: color-mix(in srgb, var(--accent) 46%, rgba(255, 255, 255, 0.14));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 4px 10px rgba(8, 12  , 24, 0.34),
    0 22px 42px rgba(8, 12, 24, 0.34),
    0 38px 74px color-mix(in srgb, var(--accent) 30%, transparent);
}

.card:hover .card-halo {
  opacity: 0.5;
}

/* 图标与标题同一行，图标在左、标题紧随 */
.card-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: calc(var(--card-h) * 0.055);
}

.card-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: calc(var(--card-h) * 0.185);
  height: calc(var(--card-h) * 0.185);
  /* 深处一点、亮处一点的品牌色，芯片在深底上透出光 */
  border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
  border-radius: calc(var(--card-h) * 0.062);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--accent) 30%, transparent),
    color-mix(in srgb, var(--accent) 10%, transparent)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: color-mix(in srgb, var(--accent) 76%, #ffffff);
}

.card-icon svg {
  display: block;
  width: calc(var(--card-h) * 0.1);
  height: calc(var(--card-h) * 0.1);
}

.card-title {
  min-width: 0;
  margin: 0;
  font-size: max(17px, calc(var(--card-h) * 0.074));
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.2;
  color: #f2f5fa;
}

.card-desc {
  /* 占住剩余高度，各卡版式一致 */
  display: block;
  flex: 1 1 auto;
  /* 行数超了直接截断，卡片高度才稳 */
  overflow: hidden;
  max-height: calc(var(--card-h) * 0.46);
  margin: 0;
  /* 正文比上一版抬一档，标题字号保持原样 */
  font-size: max(14px, calc(var(--card-h) * 0.07));
  line-height: 1.68;
  /* 中文末行不落单字，不支持也就是照旧换行 */
  text-wrap: pretty;
  overflow-wrap: break-word;
  color: #b6c0d0;
}

/* 超大水印序号，压在右上角当背景板 */
.card-no {
  position: absolute;
  top: calc(var(--card-h) * -0.12);
  right: calc(var(--card-h) * -0.07);
  z-index: -1; /* 垫到内容底下 */
  font-family: Arial, system-ui;
  font-size: calc(var(--card-h) * 0.44);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  /* 深底上要更亮才认得出，仍压在水印的层次上 */
  color: color-mix(in srgb, var(--accent) 52%, transparent);
  pointer-events: none;
}

.card:hover .card-no {
  color: color-mix(in srgb, var(--accent) 72%, transparent);
}
</style>
