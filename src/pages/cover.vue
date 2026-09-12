<script setup>
</script>

<template>
  <div class="bottom">
    <div class="wrapper">
      <div class="cover">
        <div class="background">
          <div class="window">
            <!-- macOS 窗口标题栏 -->
            <div class="window__bar">
              <span class="dot dot--red" />
              <span class="dot dot--yellow" />
              <span class="dot dot--green" />
              <div class="window-title-text">NATB App</div>
            </div>
            <!-- 窗口内容区 -->
            <div class="window__body">
              <div class="title-wrap">
                <h1 class="home__title">New Android Tool Box</h1>
                <p class="subtitle">Powerful · Lightweight · Open Source</p>
              </div>
              <div class="divider-line"></div>
              <div class="tag-group">
                <span class="tag">Android</span>
                <span class="tag">ToolBox</span>
                <span class="tag">Developer</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 倒数第二行：左对齐 -->
      <div class="texts-wrapper">
        <p class="made">Made</p>
        <p class="by">by</p>
      </div>
      <!-- 最底下一行：占满宽度 -->
      <div class="developer-group" aria-label="NATB DEVELOPER GROUP">
        <span>NATB DEVELOPER GROUP</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 外层容器：严格贴合视口，不产生滚动条 ===== */
.bottom {
  box-sizing: border-box;
  position: fixed;      /* 不受 body 默认 margin 影响，稳稳铺满视口 */
  inset: 0;
  display: flex;
  align-items: flex-end;
  width: 100%;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;       /* 移动端地址栏收起/展开时更准确 */
  max-height: 100dvh;
  overflow: hidden;     /* 兜底：绝不溢出视口 */
}

/* ===== wrapper：整体灰色背景 ===== */
.wrapper {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-height: 0;        /* 关键：允许子项在 flex 中收缩 */
  background: #2E3234;
  overflow: hidden;
  user-select: none;
}

/* ===== 封面区域：吃掉剩余高度 ===== */
.cover {
  --l: 1500px;   /* 尺规里那段线段的长度，也是圆半径 */
  height: 82%;
  min-height: 0;
  min-width: 0;
  width: 100%;
  display: flex;
  overflow: hidden;
  clip-path: circle(var(--l) at 50% calc(100% - var(--l)));
}

.background {
  flex: 1 1 auto;
  min-height: 0;        /* 去掉固定 min-height: 340px，避免小屏溢出 */
  min-width: 0;

  background-image: url('./images/home-page-bg.webp');
  background-color: #dfe3ea; /* 图片未加载时的兜底色 */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;

  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ===== 仿 macOS 窗口 ===== */
/* ===== 仿 macOS 窗口｜增强高级质感 + 悬浮微动效 ===== */
.window {
  width: min(860px, calc(100% - 40px));
  margin-top: 80px;
  height: 100%;
  max-height: 440px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.06),
      0 12px 32px rgba(0, 0, 0, 0.16),
      0 30px 60px rgba(0, 0, 0, 0.24);
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s ease;
}
.window:hover {
  box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.08),
      0 20px 48px rgba(0, 0, 0, 0.20),
      0 40px 80px rgba(0, 0, 0, 0.28);
}

/* 标题栏 */
.window__bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(210, 210, 210, 0.45);
  background: rgba(248, 248, 248, 0.72);
}

/* 窗口标题文字 */
.window-title-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
  color: #515154;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* 红黄绿三个圆点 */
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.12));
}
.dot--red {
  background: #ff5f57;
  border: 0.5px solid #e0443e;
}
.dot--yellow {
  background: #febc2e;
  border: 0.5px solid #dea123;
}
.dot--green {
  background: #28c840;
  border: 0.5px solid #1aab29;
}

/* 内容区 */
.window__body {
  padding: clamp(20px, 5vh, 42px) 32px;
  text-align: center;
  background: transparent;
}

.title-wrap {
  margin-bottom: 20px;
}

.home__title {
  margin: 0 0 8px;
  font-size: clamp(60px, 4vw, 70px);
  font-weight: 1000;
  letter-spacing: 0.02em;
  color: #1d1d1f;
}

.subtitle {
  margin:0;
  font-size: clamp(23px,1.8vw,26px);
  color:#6e6e73;
  font-weight:500;
}

.divider-line {
  width: 64px;
  height:1px;
  background: linear-gradient(90deg, transparent,#c7c7cc,transparent);
  margin:0 auto 24px;
}

.tag-group {
  display:flex;
  gap:10px;
  justify-content:center;
  flex-wrap:wrap;
}
.tag {
  padding:4px 12px;
  background:rgba(0,0,0,0.05);
  border-radius:999px;
  font-size:13px;
  color:#444;
}

/* ===== 倒数第二行：Made by（左对齐） ===== */
.texts-wrapper{
  display: flex;
}

.made {
  flex: none;
  margin: -1em 0 0;        /* 用负 margin-bottom 抵消自身高度 */
  font-size: 6.5cqw;
  line-height: 1;
  color: #8a8a8e;
  text-align: left;
  font-weight: 500;
}

.by {
  flex: none;
  margin: -1em 0.1em 0 auto;        /* 用负 margin-bottom 抵消自身高度 */
  font-size: 6cqw;
  line-height: 1;
  color: #8a8a8e;
  text-align: left;
  font-weight: 500;
}

/* ===== 最后一行：NATB DEVELOPER GROUP（占满宽度） ===== */
.developer-group {
  font-family: Arial, system-ui;
  width: 100%;
  font-size: 8.23cqw;   /* 数字试一下，差一点就微调 */
  font-weight: 700;
  line-height: 0.8;
  color: #8a8a8e;
  white-space: nowrap;
  letter-spacing: -0.05em;   /* ← 负值 = 收紧；原来 0.04em 是撑开 */
}
.developer-group span {
  display: inline-block;
  height: 0.8em;
}
</style>