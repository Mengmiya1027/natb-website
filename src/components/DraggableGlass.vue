<script setup>
/**
 * 全站可拖动的液态玻璃。
 *
 * 视觉来自 Vue Bits 的 GlassSurface（./vue-bits/GlassSurface.vue，
 * https://vue-bits.dev/components/glass-surface）：它是一块真正的"玻璃"，
 * 边缘用 SVG 位移贴图把背景折射/色散，中间保持清透。
 *
 * 这里只负责"能动"：
 *   - 鼠标 / 触屏拖拽（Pointer Events，含指针捕获，滑出窗口也不丢）
 *   - 键盘方向键移动（Shift 加速），方便不用鼠标的场景
 *   - 始终夹在视口内，窗口缩放后也会被夹回来
 *   - 位置只保存在组件内存里：刷新 / 切页 / 重开都回到右下角默认位，
 *     不写 cookie，也不碰 localStorage / sessionStorage / IndexedDB。
 *
 * 挂在 App.vue 的页面宿主里，所以四个页面共享同一枚玻璃。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import GlassSurface from './vue-bits/GlassSurface.vue'

/* 玻璃本体尺寸与默认落点（右下角、底栏上方，避开顶部 dock 与底部控制条） */
const WIDTH = 176
const HEIGHT = 64
const RADIUS = 999
const MARGIN = 12
const EDGE_RIGHT = 28
const EDGE_BOTTOM = 96

const x = ref(0)
const y = ref(0)
const ready = ref(false)
const dragging = ref(false)

let pointerId = null
let startClientX = 0
let startClientY = 0
let startX = 0
let startY = 0

const viewportWidth = () => window.innerWidth
const viewportHeight = () => window.innerHeight

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const maxX = () => Math.max(MARGIN, viewportWidth() - WIDTH - MARGIN)
const maxY = () => Math.max(MARGIN, viewportHeight() - HEIGHT - MARGIN)

/** 默认位置：右下角。每次挂载都重新算，不做任何持久化。 */
function resetPosition() {
  x.value = clamp(viewportWidth() - WIDTH - EDGE_RIGHT, MARGIN, maxX())
  y.value = clamp(viewportHeight() - HEIGHT - EDGE_BOTTOM, MARGIN, maxY())
}

const layerStyle = computed(() => ({
  transform: `translate3d(${x.value}px, ${y.value}px, 0)`,
}))

function onPointerDown(event) {
  // 只认主键 / 触摸 / 笔；右键与中键留给浏览器
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (dragging.value) return

  dragging.value = true
  pointerId = event.pointerId
  startClientX = event.clientX
  startClientY = event.clientY
  startX = x.value
  startY = y.value

  // 指针捕获：快速滑动时指针离开玻璃也继续跟随
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event) {
  if (!dragging.value || event.pointerId !== pointerId) return

  x.value = clamp(startX + event.clientX - startClientX, MARGIN, maxX())
  y.value = clamp(startY + event.clientY - startClientY, MARGIN, maxY())
  event.preventDefault()
}

function endDrag(event) {
  if (!dragging.value || (event && event.pointerId !== pointerId)) return

  if (pointerId !== null) {
    event?.currentTarget?.releasePointerCapture?.(pointerId)
  }
  dragging.value = false
  pointerId = null
}

/** 方向键移动（Shift = 大步），拦截默认滚动并把按键从页面快捷键里截走 */
function onKeyDown(event) {
  const step = event.shiftKey ? 48 : 12
  let dx = 0
  let dy = 0

  switch (event.key) {
    case 'ArrowLeft':
      dx = -step
      break
    case 'ArrowRight':
      dx = step
      break
    case 'ArrowUp':
      dy = -step
      break
    case 'ArrowDown':
      dy = step
      break
    default:
      return
  }

  event.preventDefault()
  event.stopPropagation()
  x.value = clamp(x.value + dx, MARGIN, maxX())
  y.value = clamp(y.value + dy, MARGIN, maxY())
}

/** 窗口尺寸变化：别把玻璃留在视口外 */
function onResize() {
  x.value = clamp(x.value, MARGIN, maxX())
  y.value = clamp(y.value, MARGIN, maxY())
}

onMounted(() => {
  resetPosition()
  window.addEventListener('resize', onResize)
  // 等一帧再淡入：避免首帧在左上角闪一下
  requestAnimationFrame(() => {
    ready.value = true
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="draggable-glass" :style="layerStyle">
    <div
      class="draggable-glass__handle"
      :class="{ 'is-ready': ready, 'is-dragging': dragging }"
      role="button"
      tabindex="0"
      aria-label="液态玻璃，可拖动；聚焦后可用方向键移动"
      title="拖动我（方向键也能移动）"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      @keydown="onKeyDown"
    >
      <GlassSurface
        :width="WIDTH"
        :height="HEIGHT"
        :border-radius="RADIUS"
        :border-width="0.12"
        :displace="0.6"
        :distortion-scale="-170"
        :background-opacity="0.02"
        :saturation="1.25"
        :blur="9"
        :brightness="68"
        :style="{ width: '100%', height: '100%' }"
      >
        <span class="draggable-glass__label">
          <i-lucide-move class="draggable-glass__grip" width="15" height="15" aria-hidden="true" />
          <span>液态玻璃</span>
        </span>
      </GlassSurface>
    </div>
  </div>
</template>

<style scoped>
/* 定位层：只负责平移，永远不挡页面 —— 指针事件只落在玻璃本体上 */
.draggable-glass {
  position: fixed;
  left: 0;
  top: 0;
  /* 高于页面自身浮层（查看器 200 / 大屏 120），低于 NavBar 槽位与控制条 */
  z-index: 2147481000;
  pointer-events: none;
  will-change: transform;
}

.draggable-glass__handle {
  pointer-events: auto;
  width: 176px;
  height: 64px;
  border-radius: 999px;
  opacity: 0;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  transition:
    opacity 360ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.draggable-glass__handle.is-ready {
  opacity: 1;
}

/* hover / 拖拽只做很小的缩放，玻璃看起来像"被拿起来" */
.draggable-glass__handle.is-ready:hover {
  transform: scale(1.03);
}

.draggable-glass__handle.is-dragging {
  cursor: grabbing;
  transform: scale(1.05);
  transition-duration: 140ms;
}

.draggable-glass__handle:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.75);
  outline-offset: 4px;
}

/* 玻璃里的字：白字 + 轻投影，深浅背景上都读得出来 */
.draggable-glass__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-left: 0.14em;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.14em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.draggable-glass__grip {
  opacity: 0.72;
  flex: none;
}
</style>
