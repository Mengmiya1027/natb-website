<script setup>
/**
 * Vue Bits - GlassSurface (Vue port)
 * https://vue-bits.dev/components/glass-surface
 *
 * 液态玻璃容器：用一张 SVG 位移贴图（中间平坦、边缘渐变）做 backdrop-filter，
 * 让背景在玻璃边缘产生折射/色散，中间保持清透。Chrome 走完整折射，
 * Safari / Firefox 或不支持 SVG backdrop-filter 的浏览器降级成毛玻璃。
 *
 * 与官方版的差异：官方版依赖 Tailwind 类名，本项目没有 Tailwind，
 * 这里把所有工具类翻译成本组件自己的 scoped CSS；props 与官方保持一致。
 */
defineOptions({ name: 'GlassSurface' })

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  width: { type: [String, Number], default: '200px' },
  height: { type: [String, Number], default: '200px' },
  borderRadius: { type: Number, default: 20 },
  /** 边缘折射带宽：占短边的比例（0.07 ≈ 7%） */
  borderWidth: { type: Number, default: 0.07 },
  /** 位移贴图里边缘高光的亮度与不透明度 */
  brightness: { type: Number, default: 70 },
  opacity: { type: Number, default: 0.93 },
  blur: { type: Number, default: 11 },
  /** 位移后整体高斯模糊量 */
  displace: { type: Number, default: 0.5 },
  /** 玻璃本体底色（0 = 全透明，只留边缘） */
  backgroundOpacity: { type: Number, default: 0 },
  saturation: { type: Number, default: 1 },
  /** 位移强度，负值让边缘向内折 */
  distortionScale: { type: Number, default: -180 },
  /** RGB 三通道各自的位移偏移量，拉开就成色散 */
  redOffset: { type: Number, default: 0 },
  greenOffset: { type: Number, default: 10 },
  blueOffset: { type: Number, default: 20 },
  xChannel: { type: String, default: 'R' },
  yChannel: { type: String, default: 'G' },
  mixBlendMode: { type: String, default: 'difference' },
  className: { type: String, default: '' },
  style: { type: Object, default: () => ({}) },
})

/* 每个实例一套唯一 id：同一页可能同时存在多块玻璃，filter 不能撞名 */
const uniqueId = Math.random().toString(36).slice(2, 15)
const filterId = `glass-filter-${uniqueId}`
const redGradId = `glass-red-grad-${uniqueId}`
const blueGradId = `glass-blue-grad-${uniqueId}`

const containerRef = ref(null)
const feImageRef = ref(null)
const redChannelRef = ref(null)
const greenChannelRef = ref(null)
const blueChannelRef = ref(null)
const gaussianBlurRef = ref(null)

/* 跟随系统深浅色（玻璃底色与投影不同） */
const isDarkMode = ref(false)
let darkModeQuery = null

function syncDarkMode(event) {
  isDarkMode.value = event.matches
}

function watchDarkMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  isDarkMode.value = darkModeQuery.matches
  darkModeQuery.addEventListener('change', syncDarkMode)
}

/* Chrome 之外基本不支持 backdrop-filter: url(#...)，探测一次后缓存 */
let svgFilterSupport = null
function supportsSVGFilters() {
  if (svgFilterSupport !== null) return svgFilterSupport
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  if (isWebkit || isFirefox) {
    svgFilterSupport = false
    return svgFilterSupport
  }

  const probe = document.createElement('div')
  probe.style.backdropFilter = `url(#${filterId})`
  svgFilterSupport = probe.style.backdropFilter !== ''
  return svgFilterSupport
}

function supportsBackdropFilter() {
  if (typeof window === 'undefined') return false
  return CSS.supports('backdrop-filter', 'blur(10px)')
}

/* 生成位移贴图：黑色底 + 红/蓝径向渐变 + 一幅模糊过的圆角矩形高光。
 * feDisplacementMap 用红/绿/蓝通道分别做 x/y 位移，于是矩形边缘把背景"掰弯"。 */
function generateDisplacementMap() {
  const rect = containerRef.value?.getBoundingClientRect()
  const actualWidth = rect?.width || 400
  const actualHeight = rect?.height || 200
  const edgeSize = Math.min(actualWidth, actualHeight) * (props.borderWidth * 0.5)

  const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${props.borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${props.mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${props.borderRadius}" fill="hsl(0 0% ${props.brightness}% / ${props.opacity})" style="filter:blur(${props.blur}px)" />
      </svg>
    `

  return `data:image/svg+xml,${encodeURIComponent(svgContent)}`
}

function updateDisplacementMap() {
  if (feImageRef.value) feImageRef.value.setAttribute('href', generateDisplacementMap())
}

function updateFilterElements() {
  const channels = [
    { el: redChannelRef.value, offset: props.redOffset },
    { el: greenChannelRef.value, offset: props.greenOffset },
    { el: blueChannelRef.value, offset: props.blueOffset },
  ]

  channels.forEach(({ el, offset }) => {
    if (!el) return
    el.setAttribute('scale', String(props.distortionScale + offset))
    el.setAttribute('xChannelSelector', props.xChannel)
    el.setAttribute('yChannelSelector', props.yChannel)
  })

  if (gaussianBlurRef.value) {
    gaussianBlurRef.value.setAttribute('stdDeviation', String(props.displace))
  }
}

const containerStyles = computed(() => {
  const base = {
    ...props.style,
    width: typeof props.width === 'number' ? `${props.width}px` : props.width,
    height: typeof props.height === 'number' ? `${props.height}px` : props.height,
    borderRadius: `${props.borderRadius}px`,
    '--glass-frost': props.backgroundOpacity,
    '--glass-saturation': props.saturation,
  }

  if (supportsSVGFilters()) {
    return {
      ...base,
      background: isDarkMode.value
        ? `hsl(0 0% 0% / ${props.backgroundOpacity})`
        : `hsl(0 0% 100% / ${props.backgroundOpacity})`,
      backdropFilter: `url(#${filterId}) saturate(${props.saturation})`,
      boxShadow: isDarkMode.value
        ? `0 0 2px 1px color-mix(in oklch, white, transparent 65%) inset,
           0 0 10px 4px color-mix(in oklch, white, transparent 85%) inset,
           0px 4px 16px rgba(17, 17, 26, 0.05),
           0px 8px 24px rgba(17, 17, 26, 0.05),
           0px 16px 56px rgba(17, 17, 26, 0.05),
           0px 4px 16px rgba(17, 17, 26, 0.05) inset,
           0px 8px 24px rgba(17, 17, 26, 0.05) inset,
           0px 16px 56px rgba(17, 17, 26, 0.05) inset`
        : `0 0 2px 1px color-mix(in oklch, black, transparent 85%) inset,
           0 0 10px 4px color-mix(in oklch, black, transparent 90%) inset,
           0px 4px 16px rgba(17, 17, 26, 0.05),
           0px 8px 24px rgba(17, 17, 26, 0.05),
           0px 16px 56px rgba(17, 17, 26, 0.05),
           0px 4px 16px rgba(17, 17, 26, 0.05) inset,
           0px 8px 24px rgba(17, 17, 26, 0.05) inset,
           0px 16px 56px rgba(17, 17, 26, 0.05) inset`,
    }
  }

  const backdropFilterSupported = supportsBackdropFilter()

  if (isDarkMode.value) {
    if (!backdropFilterSupported) {
      return {
        ...base,
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`,
      }
    }
    return {
      ...base,
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
      WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.2)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                  inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`,
    }
  }

  if (!backdropFilterSupported) {
    return {
      ...base,
      background: 'rgba(255, 255, 255, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
                  inset 0 -1px 0 0 rgba(255, 255, 255, 0.3)`,
    }
  }
  return {
    ...base,
    background: 'rgba(255, 255, 255, 0.25)',
    backdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
    WebkitBackdropFilter: 'blur(12px) saturate(1.8) brightness(1.1)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2),
                0 2px 16px 0 rgba(31, 38, 135, 0.1),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
                inset 0 -1px 0 0 rgba(255, 255, 255, 0.2)`,
  }
})

let resizeObserver = null

function setupResizeObserver() {
  if (!containerRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    setTimeout(updateDisplacementMap, 0)
  })
  resizeObserver.observe(containerRef.value)
}

watch(
  [
    () => props.width,
    () => props.height,
    () => props.borderRadius,
    () => props.borderWidth,
    () => props.brightness,
    () => props.opacity,
    () => props.blur,
    () => props.displace,
    () => props.distortionScale,
    () => props.redOffset,
    () => props.greenOffset,
    () => props.blueOffset,
    () => props.xChannel,
    () => props.yChannel,
    () => props.mixBlendMode,
  ],
  () => {
    updateDisplacementMap()
    updateFilterElements()
  },
)

watch([() => props.width, () => props.height], () => {
  setTimeout(updateDisplacementMap, 0)
})

onMounted(() => {
  watchDarkMode()
  nextTick(() => {
    updateDisplacementMap()
    updateFilterElements()
    setupResizeObserver()
  })
})

onBeforeUnmount(() => {
  darkModeQuery?.removeEventListener('change', syncDarkMode)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="containerRef" class="glass-surface" :class="className" :style="containerStyles">
    <!-- 位移贴图用的 SVG 滤镜：不可见、不占布局、不接收指针 -->
    <svg class="glass-surface__filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter :id="filterId" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
          <feImage ref="feImageRef" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

          <feDisplacementMap ref="redChannelRef" in="SourceGraphic" in2="map" result="dispRed" />
          <feColorMatrix
            in="dispRed"
            type="matrix"
            values="1 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="red"
          />

          <feDisplacementMap ref="greenChannelRef" in="SourceGraphic" in2="map" result="dispGreen" />
          <feColorMatrix
            in="dispGreen"
            type="matrix"
            values="0 0 0 0 0
                    0 1 0 0 0
                    0 0 0 0 0
                    0 0 0 1 0"
            result="green"
          />

          <feDisplacementMap ref="blueChannelRef" in="SourceGraphic" in2="map" result="dispBlue" />
          <feColorMatrix
            in="dispBlue"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 1 0 0
                    0 0 0 1 0"
            result="blue"
          />

          <feBlend in="red" in2="green" mode="screen" result="rg" />
          <feBlend in="rg" in2="blue" mode="screen" result="output" />
          <feGaussianBlur ref="gaussianBlurRef" in="output" stdDeviation="0.7" />
        </filter>
      </defs>
    </svg>

    <div class="glass-surface__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.glass-surface {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: opacity 260ms ease-out;
}

.glass-surface__filter {
  position: absolute;
  inset: 0;
  z-index: -10;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
}

.glass-surface__content {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 8px;
  border-radius: inherit;
}

.glass-surface:focus-visible {
  outline: 2px solid #0a84ff;
  outline-offset: 2px;
}
</style>
