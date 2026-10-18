<script setup>
/**
 * Vue Bits · WebThreads（https://vue-bits.dev/backgrounds/web-threads）
 *
 * 原组件是 TS + Tailwind 写法，这里只做三处本地化，着色器与参数一字未改：
 *   1. 去掉 TS 类型与 Tailwind 类，容器尺寸交给下面的 scoped 样式；
 *   2. WebGL 初始化失败时不再抛异常，而是安静地留一层 CSS 渐变兜底；
 *   3. 增加 paused / dpr 两个开关：少动效时直接停帧，高分屏也能压住像素比。
 *
 * 鼠标交互挂在 window 上而不是 canvas 上：首页的文字层盖在 canvas 之上，
 * 挂在 canvas 上的话指针永远进不来。只有指针落在容器矩形内才算"悬停"。
 */
import { Mesh, Program, Renderer, Triangle } from 'ogl'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  color1: { type: String, default: '#5227FF' },
  color2: { type: String, default: '#FF9FFC' },
  color3: { type: String, default: '#FFFFFF' },
  speed: { type: Number, default: 0.2 },
  threadCount: { type: Number, default: 6 },
  frequency: { type: Number, default: 5.0 },
  spread: { type: Number, default: 0.18 },
  taper: { type: Number, default: 1.0 },
  position: { type: Number, default: 0.5 },
  fanMode: { type: String, default: 'center' },
  glow: { type: Number, default: 0.02 },
  falloff: { type: Number, default: 0.6 },
  thickness: { type: Number, default: 1.1 },
  brightness: { type: Number, default: 0.6 },
  opacity: { type: Number, default: 1.0 },
  mirror: { type: Boolean, default: true },
  shimmer: { type: Boolean, default: false },
  grain: { type: Boolean, default: true },
  grainIntensity: { type: Number, default: 0.05 },
  mouseInteraction: { type: Boolean, default: true },
  mouseStrength: { type: Number, default: 0.3 },
  /** 少动效模式下停帧：仍渲染一帧静态画面，只是不再 requestAnimationFrame */
  paused: { type: Boolean, default: false },
  /** 像素比上限。片元着色器每条线都要跑一遍循环，4K + dpr2 会明显浪费 GPU */
  dpr: { type: Number, default: 1.5 },
})

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [1, 1, 1]
  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
}

const FAN_MODE = { center: 0, left: 1, right: 2 }

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uThreadCount;
uniform float uFrequency;
uniform float uSpread;
uniform float uTaper;
uniform float uPosition;
uniform float uFanMode;
uniform float uGlow;
uniform float uFalloff;
uniform float uThickness;
uniform float uBrightness;
uniform float uOpacity;
uniform float uMirror;
uniform float uShimmer;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform float uEnableMouse;
uniform float uMouseActive;
out vec4 fragColor;

#define TAU 6.28318530718
#define MAX_THREADS 10

float glow(float x, float str, float dist) {
  return dist / pow(max(x, 1e-4), str);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float n = max(uThreadCount, 1.0);

  float pinchX = uFanMode < 0.5 ? 0.5 : (uFanMode < 1.5 ? 0.0 : 1.0);
  if (uEnableMouse > 0.5) {
    pinchX = mix(pinchX, uMouse.x, clamp(uMouseStrength, 0.0, 1.0) * uMouseActive);
  }

  float spreadDx = uSpread * abs(uv.x - pinchX);
  float baseT = iTime * uSpeed;
  float tauOverN = TAU / n;
  float mirror = uMirror > 0.5 ? sign(pinchX - uv.x) : 1.0;
  bool doShimmer = uShimmer > 0.5;
  float shimmerT = iTime * 1.7;
  float invThickness = 1.0 / max(uThickness, 0.01);
  float xFreq = uv.x * uFrequency;
  float yOff = uv.y - uPosition;
  float ciScale = n > 1.0 ? 1.0 / (n - 1.0) : 0.0;

  vec3 col = vec3(0.0);
  float gsum = 0.0;

  for (int idx = 0; idx < MAX_THREADS; idx++) {
    float i = float(idx);
    if (i >= n) break;

    float amplitude = spreadDx * (1.0 + i * uTaper);
    float shimmer = doShimmer ? sin(shimmerT + i * 1.3) * 0.35 : 0.0;
    float phase = (baseT + i * tauOverN) * mirror + shimmer;

    float sdf = abs(yOff + sin(xFreq + phase) * amplitude) * invThickness;

    float g = glow(sdf, uFalloff, uGlow);
    float ci = i * ciScale;
    vec3 threadCol = mix(uColor1, uColor2, ci);

    col += g * threadCol;
    gsum += g;
  }

  float coreAmt = smoothstep(0.5, 2.2, gsum);
  col = mix(col, uColor3 * gsum, coreAmt * 0.5);

  float bright = uBrightness;
  if (uEnableMouse > 0.5) {
    vec2 md = uv - uMouse;
    float d2 = dot(md, md);
    bright += clamp(uMouseStrength, 0.0, 1.0) * uMouseActive * exp(-d2 * 6.0) * 0.6;
  }
  col *= bright;

  float alpha = clamp(gsum, 0.0, 1.0) * uOpacity;

  vec3 outRgb = col * alpha;

  if (uGrain > 0.5) {
    float gv = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453) - 0.5) * uGrainIntensity;
    outRgb = clamp(outRgb + gv, 0.0, 1.0);
    alpha = clamp(alpha + gv, 0.0, 1.0);
  }

  fragColor = vec4(outRgb, alpha);
}
`

const containerRef = ref(null)
const ready = ref(false)

let program = null
let teardown = null

function syncUniforms() {
  if (!program) return
  const u = program

  u.uSpeed.value = props.speed
  u.uThreadCount.value = Math.round(props.threadCount)
  u.uFrequency.value = props.frequency
  u.uSpread.value = props.spread
  u.uTaper.value = props.taper
  u.uPosition.value = props.position
  u.uFanMode.value = FAN_MODE[props.fanMode] ?? 0
  u.uGlow.value = props.glow
  u.uFalloff.value = props.falloff
  u.uThickness.value = props.thickness
  u.uBrightness.value = props.brightness
  u.uOpacity.value = props.opacity
  u.uMirror.value = props.mirror ? 1.0 : 0.0
  u.uShimmer.value = props.shimmer ? 1.0 : 0.0
  u.uGrain.value = props.grain ? 1.0 : 0.0
  u.uGrainIntensity.value = props.grainIntensity

  const c1 = u.uColor1.value
  const rgb1 = hexToRgb(props.color1)
  c1[0] = rgb1[0]
  c1[1] = rgb1[1]
  c1[2] = rgb1[2]

  const c2 = u.uColor2.value
  const rgb2 = hexToRgb(props.color2)
  c2[0] = rgb2[0]
  c2[1] = rgb2[1]
  c2[2] = rgb2[2]

  const c3 = u.uColor3.value
  const rgb3 = hexToRgb(props.color3)
  c3[0] = rgb3[0]
  c3[1] = rgb3[1]
  c3[2] = rgb3[2]

  u.uMouseStrength.value = props.mouseStrength
  u.uEnableMouse.value = props.mouseInteraction ? 1.0 : 0.0
}

watch(
  () => [
    props.color1,
    props.color2,
    props.color3,
    props.speed,
    props.threadCount,
    props.frequency,
    props.spread,
    props.taper,
    props.position,
    props.fanMode,
    props.glow,
    props.falloff,
    props.thickness,
    props.brightness,
    props.opacity,
    props.mirror,
    props.shimmer,
    props.grain,
    props.grainIntensity,
    props.mouseInteraction,
    props.mouseStrength,
  ],
  syncUniforms,
)

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  let renderer
  try {
    renderer = new Renderer({
      webgl: 2,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, props.dpr),
    })
  } catch (error) {
    console.warn('[WebThreads] WebGL2 不可用，已退回 CSS 渐变背景', error)
    return
  }

  const gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  const canvas = gl.canvas
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  container.appendChild(canvas)

  const geometry = new Triangle(gl)
  const localProgram = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1]) },
      uSpeed: { value: 0.2 },
      uThreadCount: { value: 6 },
      uFrequency: { value: 5.0 },
      uSpread: { value: 0.18 },
      uTaper: { value: 1.0 },
      uPosition: { value: 0.5 },
      uFanMode: { value: 0 },
      uGlow: { value: 0.02 },
      uFalloff: { value: 0.6 },
      uThickness: { value: 1.1 },
      uBrightness: { value: 0.6 },
      uOpacity: { value: 1.0 },
      uMirror: { value: 1.0 },
      uShimmer: { value: 0.0 },
      uGrain: { value: 1.0 },
      uGrainIntensity: { value: 0.05 },
      uColor1: { value: new Float32Array([1, 1, 1]) },
      uColor2: { value: new Float32Array([1, 1, 1]) },
      uColor3: { value: new Float32Array([1, 1, 1]) },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uMouseStrength: { value: 0.3 },
      uEnableMouse: { value: 1.0 },
      uMouseActive: { value: 0 },
    },
  })
  const mu = localProgram.uniforms
  program = mu

  const mesh = new Mesh(gl, { geometry, program: localProgram })

  const setSize = () => {
    const rect = container.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    renderer.setSize(w, h)
    const res = mu.iResolution.value
    res[0] = gl.drawingBufferWidth
    res[1] = gl.drawingBufferHeight
    renderer.render({ scene: mesh })
  }

  const ro = new ResizeObserver(setSize)
  ro.observe(container)
  setSize()

  const currentMouse = [0.5, 0.5]
  const targetMouse = [0.5, 0.5]
  let currentActive = 0
  let targetActive = 0

  const onPointerMove = (event) => {
    const rect = canvas.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!inside) {
      targetActive = 0
      return
    }
    targetMouse[0] = (event.clientX - rect.left) / rect.width
    targetMouse[1] = 1.0 - (event.clientY - rect.top) / rect.height
    targetActive = 1
  }
  const onPointerLeave = () => {
    targetActive = 0
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerleave', onPointerLeave)

  let raf = 0
  let isVisible = true
  let isPageVisible = !document.hidden
  const t0 = performance.now()

  const loop = (t) => {
    mu.iTime.value = (t - t0) * 0.001
    currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0])
    currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1])
    currentActive += 0.05 * (targetActive - currentActive)
    const mouse = mu.uMouse.value
    mouse[0] = currentMouse[0]
    mouse[1] = currentMouse[1]
    mu.uMouseActive.value = currentActive
    mu.uEnableMouse.value = props.mouseInteraction ? 1.0 : 0.0
    mu.uMouseStrength.value = props.mouseStrength
    renderer.render({ scene: mesh })
    raf = requestAnimationFrame(loop)
  }

  const tryStart = () => {
    if (!props.paused && isVisible && isPageVisible && raf === 0) raf = requestAnimationFrame(loop)
  }
  const tryStop = () => {
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const io = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry.isIntersecting
      if (isVisible) tryStart()
      else tryStop()
    },
    { threshold: 0 },
  )
  io.observe(container)

  const onVisibility = () => {
    isPageVisible = !document.hidden
    if (isPageVisible) tryStart()
    else tryStop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const stopPausedWatch = watch(
    () => props.paused,
    (paused) => {
      if (paused) {
        tryStop()
        setSize()
      } else {
        tryStart()
      }
    },
  )

  tryStart()
  syncUniforms()
  requestAnimationFrame(() => {
    ready.value = true
  })

  teardown = () => {
    tryStop()
    stopPausedWatch()
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerleave', onPointerLeave)
    program = null
    try {
      container.removeChild(canvas)
    } catch {
      /* canvas 可能已被移走 */
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
})

onUnmounted(() => {
  teardown?.()
  teardown = null
})
</script>

<template>
  <div ref="containerRef" class="web-threads" :class="{ 'is-ready': ready }" aria-hidden="true" />
</template>

<style scoped>
.web-threads {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  opacity: 0;
  transition: opacity 1.2s ease;
  /* WebGL 起不来时至少还有一层同色系的光，不会露白 */
  background:
    radial-gradient(60% 55% at 50% 48%, rgba(94, 82, 255, 0.18), transparent 70%),
    radial-gradient(45% 45% at 72% 30%, rgba(53, 214, 255, 0.1), transparent 70%);
}

.web-threads.is-ready {
  opacity: 1;
}

.web-threads :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
