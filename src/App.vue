<script setup>
/**
 * 背景层宿主。自上而下三层：
 *   1. 顶部 dock 栏 —— NavBar（站内顶栏胶囊），由底部控制条最右侧的开关控制；
 *   2. 背景层 —— 整屏渲染控制条当前选中的那一页；
 *   3. 底部控制条 —— HarnessDock（切换 + Ctrl+K 显隐）。
 *
 * 去掉总览坞：删掉带 [HARNESS-DOCK] 的行，再把下面的 <component :is> 换成固定某一页即可。
 */
import { computed, ref, watch } from 'vue'

import NavBar from './components/NavBar.vue'
import { useAnimationStore } from '@/stores/animation'
// [HARNESS-DOCK] ① 注册表（唯一数据源就在 HarnessDock.vue 里，这里只引用）
import HarnessDock, { DOCK_TABS, DOCK_HOME } from './components/HarnessDock.vue'

const params = new URLSearchParams(window.location.search)

// [HARNESS-DOCK] ② 当前标签：控制条 v-model 双向绑定它
const activeId = ref(DOCK_HOME)
const activeTab = computed(() => DOCK_TABS.find((t) => t.id === activeId.value) ?? DOCK_TABS[0])

// [HARNESS-DOCK] ③ 顶栏开关。首页不显示开关，顶栏交给开场动画自己管；
// 其余页面必须把动画阶段置为"已落位"—— 否则 ParticleField 一卸载 store 就 reset 成 idle，
// NavBar 的 shown（isFlying || isLanded）永远为假，顶栏就再也不滑进来了。
const navOpen = ref(true)
const anim = useAnimationStore()
watch(
  [activeId, navOpen],
  () => {
    if (navOpen.value && activeId.value !== DOCK_HOME) anim.land()
  },
  { flush: 'post' },
)

/* ?frame=390x844：把页面装进一个精确尺寸的 iframe 里再截屏。
 * 桌面 Chrome 有最小窗口宽度，--window-size 给不出真实的窄视口（实测 390 会被顶成 526），
 * 只有 iframe 里的 vw 与断点才是真正的那个视口。 */
const frame = (() => {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(params.get('frame') || '')
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
})()
</script>

<template>
  <div v-if="frame" class="frame" :style="{ width: `${frame.width}px`, height: `${frame.height}px` }">
    <iframe class="frame__view" src="?embed=1" title="窄屏预览"></iframe>
  </div>

  <template v-else>
    <!-- [HARNESS-DOCK] 顶部 dock 栏：开关关掉就不挂；首页始终挂（交开场动画管） -->
    <div v-if="navOpen || activeId === DOCK_HOME" class="nav-layer">
      <NavBar />
    </div>

    <!-- [HARNESS-DOCK] ④ 背景层：整屏渲染当前标签页；功能页放大状态暂行预览 的 close 回到首页 -->
    <component :is="activeTab.comp" :key="activeId" v-bind="activeTab.props || {}" @close="activeId = DOCK_HOME" />

    <!-- 底部控制条：切换 + Ctrl+K 显隐 + 顶栏开关 -->
    <HarnessDock v-model="activeId" v-model:nav="navOpen" />
  </template>
</template>

<style>
body {
  margin: 0;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
}

/* 顶栏槽位：给它一个高于各页面浮层的层叠上下文（查看器 200 / 大屏 120），
 * 否则顶栏会被页面自己的浮层盖住，最右侧那个开关看起来就像坏的。
 * 槽位本身只做定位，点击穿透交给 NavBar 的胶囊自己。 */
.nav-layer {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  pointer-events: none;
}

/* 窄屏预览框：只为了量准视口，框本身不该抢戏 */
.frame {
  position: fixed;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  overflow: hidden;
}

.frame__view {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
