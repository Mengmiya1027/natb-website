<script setup>
/**
 * 取色器：饱和度/明度面板 + 色相条 + hex 输入。
 * 只负责「选一个颜色」，不带任何预设 —— 预设色板留在表单里原本的位置。
 * v-model 收发的都是 6 位 hex（不带 #），与 GitHub label 的颜色格式一致。
 */
import { computed, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'cfd3d7' },
})
const emit = defineEmits(['update:modelValue'])

const h = ref(0)
const s = ref(0)
const v = ref(0)
/** 自己发出去的值回流时不重算 HSV，否则拖到边界会抖 */
let fromSelf = false

function hexToRgb(hex) {
  const t = String(hex || '').replace('#', '').trim()
  const full = t.length === 3 ? t.split('').map((c) => c + c).join('') : t
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let hh = 0
  if (d !== 0) {
    if (max === r) hh = ((g - b) / d) % 6
    else if (max === g) hh = (b - r) / d + 2
    else hh = (r - g) / d + 4
    hh *= 60
    if (hh < 0) hh += 360
  }
  return [Math.round(hh), Math.round(max === 0 ? 0 : (d / max) * 100), Math.round(max * 100)]
}

function hsvToRgb(hh, ss, vv) {
  const S = ss / 100
  const V = vv / 100
  const C = V * S
  const X = C * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = V - C
  const seg = Math.floor(hh / 60) % 6
  const table = [
    [C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X],
  ][seg] || [0, 0, 0]
  return table.map((n) => Math.round((n + m) * 255))
}

function toHex() {
  return hsvToRgb(h.value, s.value, v.value)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
}

const currentHex = computed(() => toHex())
const hueColor = computed(() => `hsl(${h.value} 100% 50%)`)

watch(
  () => props.modelValue,
  (val) => {
    if (fromSelf) return
    const rgb = hexToRgb(val)
    if (!rgb) return
    const [hh, ss, vv] = rgbToHsv(...rgb)
    // 灰色没有色相，保留当前色相，否则一拖到纯灰色相条就跳回红色
    if (ss > 0) h.value = hh
    s.value = ss
    v.value = vv
  },
  { immediate: true },
)

function push() {
  fromSelf = true
  hexInput.value = currentHex.value
  emit('update:modelValue', currentHex.value)
  requestAnimationFrame(() => { fromSelf = false })
}

const svEl = ref(null)
const hueEl = ref(null)

function applySv(event) {
  const rect = svEl.value?.getBoundingClientRect()
  if (!rect) return
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
  s.value = Math.round((x / rect.width) * 100)
  v.value = Math.round(100 - (y / rect.height) * 100)
  push()
}

function applyHue(event) {
  const rect = hueEl.value?.getBoundingClientRect()
  if (!rect) return
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  h.value = Math.round((x / rect.width) * 360)
  push()
}

function startDrag(event, apply) {
  apply(event)
  const move = (e) => apply(e)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/** 输入框显示的是「外部传进来的原值」，不是 HSV 往返后的值 —— 往返会差 1，看着像被改过 */
const hexInput = ref('')
watch(
  () => props.modelValue,
  (val) => { hexInput.value = String(val || '').replace('#', '').toLowerCase() },
  { immediate: true },
)

function onHexInput(event) {
  const raw = String(event.target.value || '').replace('#', '').trim()
  hexInput.value = raw
  const rgb = hexToRgb(raw)
  if (!rgb) return
  const [hh, ss, vv] = rgbToHsv(...rgb)
  if (ss > 0) h.value = hh
  s.value = ss
  v.value = vv
  emit('update:modelValue', raw.toLowerCase())
}
</script>

<template>
  <div class="flex w-44 flex-col gap-2">
    <div
      ref="svEl"
      class="relative h-28 w-full cursor-crosshair touch-none overflow-hidden rounded-md border"
      :style="{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
      }"
      @pointerdown="startDrag($event, applySv)"
    >
      <span
        class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        :style="{ left: s + '%', top: 100 - v + '%' }"
      />
    </div>

    <div
      ref="hueEl"
      class="relative h-3 w-full cursor-pointer touch-none rounded-full border"
      style="background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
      @pointerdown="startDrag($event, applyHue)"
    >
      <span
        class="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        :style="{ left: (h / 360) * 100 + '%' }"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <span
        class="size-6 shrink-0 rounded-md border"
        :style="{ backgroundColor: '#' + currentHex }"
      />
      <span class="text-muted-foreground font-mono text-xs">#</span>
      <input
        :value="hexInput"
        maxlength="6"
        class="border-input bg-transparent h-7 w-full min-w-0 rounded-md border px-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2"
        @input="onHexInput"
      />
    </div>
  </div>
</template>
