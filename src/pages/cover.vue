<script setup>
import GridBackground from "@/components/GridBackground.vue";
</script>

<template>
  <div class="bottom">
    <div class="wrapper">
      <div class="cover">
        <div class="background">
          <div class="window">
            <!-- macOS 窗口标题栏 -->
            <div class="window-bar">
              <span class="dot dot-red" />
              <span class="dot dot-yellow" />
              <span class="dot dot-green" />
              <div class="window-title-text">NATB App</div>
            </div>
            <!-- 窗口内容区 -->
            <div class="window-body">
              <div class="title-wrap">
                <h1 class="home-title">New Android Tool Box</h1>
                <p class="subtitle">小天才手表ADB工具箱</p>
              </div>
              <div class="divider-line"></div>
              <div class="tag-group">
                <span class="tag">一键ROOT</span>
                <span class="tag">离线OTA</span>
                <span class="tag">XP框架安装</span>
                <span class="tag">应用管理</span>
              </div>
              <!-- 标签下方的探索引导 -->
              <div class="scroll-hint">
                <span>点击探索</span>
                <i-lucide-chevrons-down class="scroll-hint-icon" width="18" height="18" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <grid-background zIndex="1"/>
      <!-- 最底下一行：占满宽度 -->
      <div class="developer-group" aria-label="NATB DEVELOPER GROUP">
        <span>NATB DEVELOPER GROUP</span>
      </div>
    </div>
    <button class="edge-fab" type="button" aria-label="更多">
      <!-- 土星造型，呼应宇宙主题 -->
      <i-solaratom-bold-duotone width="40" height="40" aria-hidden="true" />
    </button>
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

.edge-fab {
  --fab-size: 64px;

  position: absolute;
  left: 50%;
  top: 88%;                 /* ★ 与 .cover 的 height: 88% 对齐 → 落在 cover 底边 */
  translate: -50% -75%;     /* 圆心正好压在那条线上 */

  width: var(--fab-size);
  height: var(--fab-size);
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  z-index: 20;

  color: #ffffff;
  background: #0A59F7;
  box-shadow: 0 1px 2px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.35);
  transition: scale .25s cubic-bezier(.22,1,.36,1), box-shadow .25s ease, background .2s ease;
}
.edge-fab:hover  { scale: 1.06; }
.edge-fab:active { scale: .94; }
.edge-fab svg    { display: block; pointer-events: none; }

/* ===== 封面区域：吃掉剩余高度 ===== */
.cover {
  --l: 1500px;   /* 尺规里那段线段的长度，也是圆半径 */
  position: relative;   /* 抬到网格之上 */
  z-index: 2;
  height: 88%;
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

  background-image: url('/images/home-page-bg.webp');
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
  margin-top: 280px;
  height: 100%;
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
.window-bar {
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
.dot-red {
  background: #ff5f57;
  border: 0.5px solid #e0443e;
}
.dot-yellow {
  background: #febc2e;
  border: 0.5px solid #dea123;
}
.dot-green {
  background: #28c840;
  border: 0.5px solid #1aab29;
}

/* 内容区 */
.window-body {
  padding: 50px 32px;
  text-align: center;
  background: transparent;
}

.title-wrap {
  margin-bottom: 20px;
}

.home-title {
  margin: 0 0 8px;
  font-size: clamp(70px, 4vw, 75px);
  font-weight: 1000;
  letter-spacing: 0.02em;
  color: rgba(0, 0, 0, 0);
  background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3);
  background-clip: text;
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

/* 探索引导：文字与图标整体居中，轻轻上下浮动 */
.scroll-hint {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  margin-top:38px;
  font-size:14px;
  letter-spacing:0.1em;
  color:#8a8a8e;
  animation: hint-float 2s ease-in-out infinite;
}
.scroll-hint-icon { display:block; }

@keyframes hint-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(4px); }
}

/* ===== 倒数第二行：Made by（左对齐） ===== */
.texts-wrapper{
  display: flex;
}

/* ===== 最后一行：NATB DEVELOPER GROUP（占满宽度） ===== */
.developer-group {
  position: relative;   /* 抬到网格之上 */
  z-index: 0;
  font-family: Arial, system-ui;
  width: 100%;
  font-size: 8.23cqw;   /* 数字试一下，差一点就微调 */
  font-weight: 700;
  line-height: 0.8;
  color: #3a3f42;
  white-space: nowrap;
  letter-spacing: -0.05em;   /* ← 负值 = 收紧；原来 0.04em 是撑开 */
}
.developer-group span {
  display: inline-block;
  height: 0.8em;
}
</style>