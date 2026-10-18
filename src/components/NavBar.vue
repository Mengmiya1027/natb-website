<script setup>
import { computed } from 'vue'
import { useAnimationStore } from '@/stores/animation'

const QQ_URL = 'https://qm.qq.com/q/Cb2vLZtsZ4'

// 跟随 base，子路径部署也能取到 public 下的图标
const brandIcon = import.meta.env.BASE_URL + 'natb-icon.png'

const store = useAnimationStore()

// 首页已经换成常驻顶栏：挂载即显示，不再等粒子上台
const shown = computed(() => store.isFlying || store.isLanded)

/**
 * 首页只做一屏，顶栏不再有页内锚点可跳。
 * 这里只广播站内页面切换请求（介绍 → 功能 / 关于 → 项目信息），
 * 由 App.vue 统一决定展示哪一页；下载直接进 QQ 群。
 */
function goTab(id) {
  window.dispatchEvent(new CustomEvent('natb:tab', { detail: id }))
}
</script>

<template>
  <header
    class="navbar"
    :class="{ 'is-shown': shown }"
    :aria-hidden="shown ? undefined : 'true'"
    :inert="!shown"
  >
    <div class="dock">
      <!-- 左：圆形图标 + 字样 -->
      <a class="brand" href="#" @click.prevent="goTab('home')">
        <img class="brand-icon" :src="brandIcon" alt="NATB" />
        <span class="brand-text">NATB</span>
      </a>

      <nav class="links" aria-label="主导航">
        <a class="link" href="#" @click.prevent="goTab('features')">介绍</a>
        <a class="link" :href="QQ_URL" target="_blank" rel="noopener">下载</a>
        <a class="link" href="#" @click.prevent="goTab('projectinfo')">关于</a>
      </nav>

      <!-- 右：QQ 交流群入口 -->
      <a
        class="action"
        :href="QQ_URL"
        target="_blank"
        rel="noopener"
        aria-label="加入 QQ 交流群"
        title="加入 QQ 交流群"
      >
        <i-lucide-message-circle width="17" height="17" aria-hidden="true" />
      </a>
    </div>
  </header>
</template>

<style scoped>
/* 外层只负责定位，点击穿透交给胶囊自己 */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding: calc(12px + env(safe-area-inset-top)) 12px 0;
  pointer-events: none;
  /* 透视得挂在父级，才能照到 dock 的 3D 旋转 */
  perspective: 900px;
  perspective-origin: center top;
  opacity: 0;
  transition: opacity 600ms ease;
}

.navbar.is-shown {
  opacity: 1;
}

/* 灵动岛式黑胶囊 */
.dock {
  pointer-events: auto;
  display: flex;
  align-items: center;
  /* 两端贴边，中间三个按钮分掉剩余空间 */
  justify-content: space-between;
  gap: 4px;
  max-width: calc(100vw - 24px);
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  background: rgba(12, 12, 14, 0.78);
  /* 绕顶边翻：起点立起来并抬到屏幕上方之外 */
  transform-origin: center top;
  transform: translateY(-160%) rotateX(-180deg);
  transition: transform 1.2s ease;
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.35);
  user-select: none;
  min-width: 50vw;
}

.navbar.is-shown .dock {
  transform: translateY(0) rotateX(0);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  text-decoration: none;
}

.brand-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
  background: #1c1c1e;
}

.brand-text {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.links {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.link {
  padding: 4px 16px;
  font-weight: 700;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 17px;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

.link:active {
  scale: 0.94;
}

/* 圆形图片位 */
.action {
  width: 32px;
  height: 32px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.72);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.action:hover {
  background: rgba(255, 255, 255, 0.22);
}

.action:active {
  scale: 0.92;
}

.action svg {
  display: block;
}

.action-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 窄屏收紧，保住一行 */
@media (max-width: 480px) {
  .brand-text {
    display: none;
  }

  .link {
    padding: 7px 10px;
    font-size: 13px;
  }
}
</style>
