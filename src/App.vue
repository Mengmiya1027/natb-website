<script setup>
/**
 * 背景层宿主。自上而下三层：
 *   1. 顶部 dock 栏 —— NavBar（站内顶栏胶囊）；
 *   2. 背景层 —— 整屏渲染左侧导航坞当前选中的那一页；
 *   3. 左侧导航坞 —— HarnessDock（页面切换 + QQ 群）。
 *
 * 去掉总览坞：删掉带 [HARNESS-DOCK] 的行，再把下面的 <component :is> 换成固定某一页即可。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import NavBar from './components/NavBar.vue'
/* 可拖动的液态玻璃已下线，组件文件保留在 ./components/DraggableGlass.vue 备用；
 * 需要恢复时取消下面这行 import 与模板里的 <DraggableGlass /> 即可。 */
// import DraggableGlass from './components/DraggableGlass.vue'
import { useAnimationStore } from '@/stores/animation'
// [HARNESS-DOCK] ① 注册表（唯一数据源就在 HarnessDock.vue 里，这里只引用）
import HarnessDock, { DOCK_TABS, DOCK_HOME } from './components/HarnessDock.vue'

const params = new URLSearchParams(window.location.search)

// [HARNESS-DOCK] ② 当前标签：控制条 v-model 双向绑定它
const activeId = ref(DOCK_HOME)
const activeTab = computed(() => DOCK_TABS.find((t) => t.id === activeId.value) ?? DOCK_TABS[0])

// [HARNESS-DOCK] ③ 离开首页时必须把动画阶段置为"已落位"—— 否则 ParticleField 一卸载
// store 就 reset 成 idle，NavBar 的 shown（isFlying || isLanded）永远为假，顶栏就再也不滑进来了。
const anim = useAnimationStore()
watch(
  activeId,
  () => {
    if (activeId.value !== DOCK_HOME) anim.land()
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

/* 顶栏不想直接碰宿主的 activeId：它只广播 natb:tab，这里校验后落到注册表里 */
const TAB_IDS = new Set(DOCK_TABS.map((tab) => tab.id))

function onTabRequest(event) {
  const id = event?.detail
  if (typeof id === 'string' && TAB_IDS.has(id)) activeId.value = id
}

onMounted(() => window.addEventListener('natb:tab', onTabRequest))
onBeforeUnmount(() => window.removeEventListener('natb:tab', onTabRequest))
</script>

<template>
  <div v-if="frame" class="frame" :style="{ width: `${frame.width}px`, height: `${frame.height}px` }">
    <iframe class="frame__view" src="?embed=1" title="窄屏预览"></iframe>
  </div>

  <template v-else>
    <!-- [HARNESS-DOCK] 顶部 dock 栏：首页交给开场动画自己管，其余页面由上面那个 watch 拉下来 -->
    <div class="nav-layer">
      <NavBar :active-id="activeId" />
    </div>

    <!-- [HARNESS-DOCK] ④ 背景层：整屏渲染当前标签页 -->
    <component :is="activeTab.comp" :key="activeId" />

    <!-- [HARNESS-DOCK] 左侧导航坞：页面切换 + QQ 群 -->
    <HarnessDock v-model="activeId" />

    <!-- 可拖动的液态玻璃已下线：组件文件保留在 ./components/DraggableGlass.vue 备用 -->
  </template>
</template>

<style>
:root {
  /* 左侧导航坞的槽位宽度。四个页面的根容器都吃这个值做左内边距，
   * 内容与胶囊之间因此留出空隙，而不是被它压住。 */
  --dock-gutter: 24px;
}

body {
  margin: 0;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
}

/* 顶栏槽位：给它一个高于各页面浮层的层叠上下文（查看器 200 等）。
 * 大屏（2147483600）是模态层，打开时连顶栏一起压住 —— 这是有意的：
 * 大屏自带顶部行（刊头 + 退出），不需要站点顶栏再叠一层。
 * 槽位本身只做定位，点击穿透交给 NavBar 的胶囊自己。 */
.nav-layer {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
  pointer-events: none;
}

/* 大屏打开期间顶栏整条让位：只被半透明玻璃压住的话，顶上会透出一圈胶囊残影。
 * 这个类由 Features.vue 在 bigOpen 时挂到 <html>，退出大屏立即撤掉。 */
html.big-screen-open .nav-layer {
  visibility: hidden;
}

/* 窄屏下导航坞挪到左下角，不再占用左侧竖条，页面不必为它让位 */
@media (max-width: 719px) {
  :root {
    --dock-gutter: 0px;
  }
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
