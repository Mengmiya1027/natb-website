<script setup>
/**
 * 页面级滚动指示条。
 *
 * 原生滚动条在 Windows 上会实打实占掉 15px 左右的横向空间，内容区宽度因此
 * 少一截；浏览器也不给网页把这条改成 overlay 的开关。于是把原生条隐藏，
 * 自己画一条 fixed 定位的指示条浮在内容上：不占布局宽度，但位置一直可见。
 *
 * 因为原生条没了，这里补上拖拽：抓住滑块上下拖即可滚动页面。
 * 轨道本身是 pointer-events-none，只有滑块接收指针，不会挡住右侧内容的点击。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const visible = ref(false)
const thumbHeight = ref(0)
const thumbOffset = ref(0)
const trackRef = ref(null)

function measure() {
  const doc = document.documentElement
  const scrollHeight = doc.scrollHeight
  const clientHeight = doc.clientHeight
  visible.value = scrollHeight > clientHeight + 1
  if (!visible.value) return
  // thumb 高度按可见比例算；位移百分比相对 thumb 自身高度，故除以 clientHeight
  thumbHeight.value = Math.min(100, (clientHeight / scrollHeight) * 100)
  thumbOffset.value = (window.scrollY / clientHeight) * 100
}

let frame = 0
function onScroll() {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    measure()
  })
}

function onThumbDown(event) {
  const track = trackRef.value
  if (!track) return
  event.preventDefault()

  const doc = document.documentElement
  const trackHeight = track.clientHeight
  const thumbPx = (thumbHeight.value / 100) * trackHeight
  const maxThumbMove = trackHeight - thumbPx
  const maxScroll = doc.scrollHeight - doc.clientHeight
  if (maxThumbMove <= 0 || maxScroll <= 0) return

  const startY = event.clientY
  const startScroll = window.scrollY
  const scrollPerPx = maxScroll / maxThumbMove

  const onMove = (e) => {
    const next = startScroll + (e.clientY - startY) * scrollPerPx
    window.scrollTo(0, Math.max(0, Math.min(maxScroll, next)))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.style.userSelect = ''
  }

  // 拖动时别顺手选中页面文字
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

let bodyObserver = null

onMounted(() => {
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measure)
  // 页面内容是异步拉的，body 高度会晚于挂载才变化，届时需要重新算比例
  if (typeof ResizeObserver !== 'undefined') {
    bodyObserver = new ResizeObserver(measure)
    bodyObserver.observe(document.body)
  }
})

onBeforeUnmount(() => {
  bodyObserver?.disconnect()
  if (frame) cancelAnimationFrame(frame)
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    ref="trackRef"
    v-show="visible"
    data-scroll-indicator
    class="pointer-events-none fixed top-1 right-1 bottom-1 z-40 w-1.5"
    aria-hidden="true"
  >
    <div
      class="bg-foreground/25 hover:bg-foreground/40 active:bg-foreground/50 pointer-events-auto w-full cursor-default touch-none rounded-full"
      :style="{ height: thumbHeight + '%', transform: 'translateY(' + thumbOffset + '%)' }"
      @pointerdown="onThumbDown"
    />
  </div>
</template>
