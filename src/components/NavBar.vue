<script setup>
/**
 * 站内顶栏。外壳只负责三件事 —— 定位、入场翻入、点击穿透交给胶囊自己；
 * 胶囊本体、hover 弹簧、选中墨点、窄屏折叠面板全部来自 vue-bits 的 PillNav
 * （React Bits 版 Pill Nav 的 Vue 移植，见 ./vue-bits/PillNav.vue）。
 *
 * 顶栏不直接碰宿主的 activeId：条目点击只广播 natb:tab，由 App.vue 校验后落表。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAnimationStore } from '@/stores/animation'
import PillNav from './vue-bits/PillNav.vue'

const props = defineProps({
  /** 当前站内页，用来给对应条目点亮墨点 */
  activeId: { type: String, default: 'home' }
})

const DOWNLOAD_URL = 'https://qm.qq.com/q/Cb2vLZtsZ4'

// 跟随 base，子路径部署也能取到 public 下的图标
const brandIcon = import.meta.env.BASE_URL + 'natb-icon.png'

const store = useAnimationStore()

// 首页已经换成常驻顶栏：挂载即显示，不再等粒子上台
const shown = computed(() => store.isFlying || store.isLanded)

/* 入场那一下是 3D 翻转（translateY + rotateX + 父级 perspective）。翻完之后还留着
 * 恒等的 transform，会让整个顶栏一直待在 3D 渲染上下文里，多付一层合成开销。
 * 这里在动画结束后落一个 is-settled，把 perspective 和 transform 一起撤掉。 */
const settled = ref(false)
let settleTimer = 0
watch(
  shown,
  (visible) => {
    window.clearTimeout(settleTimer)
    if (!visible) {
      settled.value = false
      return
    }
    settleTimer = window.setTimeout(() => {
      settled.value = true
    }, 1400)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.clearTimeout(settleTimer))

const items = [
  { label: '介绍', href: '#features' },
  { label: '下载', href: DOWNLOAD_URL, target: '_blank', rel: 'noopener' },
  { label: '关于', href: '#projectinfo' }
]

const activeHref = computed(() => '#' + props.activeId)

function goTab(id) {
  window.dispatchEvent(new CustomEvent('natb:tab', { detail: id }))
}

/** 站内条目走 tab 广播，外链（下载）交给浏览器自己开 */
function onItemClick(item, index, event) {
  if (!item.href?.startsWith('#')) return
  event.preventDefault()
  goTab(item.href.slice(1))
}

/** 品牌圆和条目同源：点它回首页 */
function onLogoClick(event) {
  if (!event.target.closest?.('.pill-nav__logo-link')) return
  event.preventDefault()
  goTab('home')
}
</script>

<template>
  <header
    class="navbar"
    :class="{ 'is-shown': shown, 'is-settled': settled }"
    :aria-hidden="shown ? undefined : 'true'"
    :inert="!shown"
    @click.capture="onLogoClick"
  >
    <div class="dock">
      <PillNav
        :logo="brandIcon"
        logo-alt="NATB"
        logo-text="NATB"
        logo-href="#home"
        :items="items"
        :active-href="activeHref"
        bar-color="rgba(12, 12, 14, 0.92)"
        :intro="false"
        collapse="auto"
        aria-label="主导航"
        @item-click="onItemClick"
      >
        <template #trailing>
          <!-- 右侧圆形占位：位置先留着，将来换图只改这一段 -->
          <span class="nav-placeholder">
            <img :src="brandIcon" alt="" draggable="false" />
          </span>
        </template>
      </PillNav>
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

/* 这一层只剩翻入动画：胶囊的底色/描边/投影由 PillNav 自己画。
 * 宽度得给足 —— PillNav 的 collapse="auto" 按父容器可用宽度决定要不要收起条目，
 * 父容器若是 shrink-to-fit，它量到的可用宽度就永远不够。 */
.dock {
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: auto;
  max-width: 100%;
  transform-origin: center top;
  transform: translateY(-160%) rotateX(-180deg);
  transition: transform 1.2s ease;
}

.navbar.is-shown .dock {
  transform: translateY(0) rotateX(0);
}

/* 翻入结束：撤掉 3D 上下文，子层合成更省 */
.navbar.is-settled {
  perspective: none;
}

.navbar.is-settled .dock {
  transform: none;
  will-change: auto;
}

/* 右侧占位圆：尺寸与 logo 圆同源（--pn-h），玻璃底 + 一圈内高光也与 logo 胶囊一致 */
.nav-placeholder {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--pn-h, 44px);
  height: var(--pn-h, 44px);
  border-radius: 999px;
  background: var(--pn-surface, rgba(38, 35, 46, 0.66));
  box-shadow: var(--pn-shadow, none);
  /* 占位圆里没有文字、图标又占满，再叠一层 backdrop 模糊只是白付采样成本 */
}

.nav-placeholder::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px var(--pn-edge, rgba(255, 255, 255, 0.08)),
    inset 0 1px 0 var(--pn-rim, rgba(255, 255, 255, 0.07));
  pointer-events: none;
}

.nav-placeholder img {
  display: block;
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  border-radius: 999px;
  object-fit: cover;
}
</style>
