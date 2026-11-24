<!--
  功能页 —— 空白占位。

  原先的卡片网格 + 大屏模式实现已整份备份到 backup/features-20261125-001407/
  （Features.vue / FeatureCard.vue / FeatureBigScreen.vue，回滚命令见该目录 README.md）。

  挂载点刻意不动：HarnessDock 的 DOCK_TABS 仍把 'features' 指向本文件，
  HomeShell 用 <component :is="tab.comp" /> 渲染。本组件不接 props、不派发事件，
  HomeShell 的悬停预热挂载空页同样无害。
-->
<template>
  <div class="features-blank" aria-hidden="true" />
</template>

<style scoped>
/* 只占位：撑满视口、透明背景，不引入任何标题、网格或动画。 */
.features-blank {
  min-height: 100vh;
  min-height: 100dvh;
  background: transparent;
}
</style>
