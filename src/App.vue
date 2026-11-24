<script setup>
/**
 * 根组件：只做两件事 —— 窄屏预览壳（?frame=）与路由出口。
 *
 * 站点常规页面（首页 + 四个 dock 页）由 HomeShell 承载，
 * Issue 页是独立路由 /issue，自己整屏渲染，不经过左侧导航坞。
 */
import { computed } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import NavBar from '@/components/NavBar.vue'

const route = useRoute()

/* 只有海报页不渲染站点胶囊：它是满屏作品，不接站内导航、只认直连路径，
 * 顶上再压一条胶囊只会把版面挤下去。
 *
 * Issue 页照常渲染——它的页头（SiteHeader）本来就是按"与胶囊左右环绕"排的：
 * 桌面端 logo 在左、胶囊在中间偏右，窄屏页头落在胶囊下方。
 * 10d5282 把 issue 一起并进 hideNav，把这条胶囊从 /issue 上摘掉了，这里改回来。 */
const isPosterRoute = computed(() => route.path.startsWith('/poster'))
const hideNav = computed(() => isPosterRoute.value)

const params = new URLSearchParams(window.location.search)

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
    <div v-if="!hideNav" class="nav-layer">
      <NavBar />
    </div>

    <RouterView />
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
  font-family: 'HarmonyOS Sans SC', system-ui, sans-serif;
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

/* 预热层：要真参与布局（否则等于没预热），但必须不可见、不可点、不进层叠 */
.warm {
  position: fixed;
  inset: 0;
  z-index: -1;
  opacity: 0;
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