<script setup lang="ts">
import type { SelectContentEmits, SelectContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { cn } from "cn"
import {
  SelectContent,
  SelectPortal,
  SelectViewport,
  useForwardPropsEmits,
} from "reka-ui"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    position: "popper",
  },
)
const emits = defineEmits<SelectContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)

/**
 * 自绘滚动条。Chromium 在 Windows 上默认走 Fluent overlay 滚动条，
 * ::-webkit-scrollbar 不生效、scrollbar-color 也只影响浮出样式，
 * 静止时完全看不到还能不能滚。所以自己画一条常显的指示条。
 */
const viewportRef = ref(null)
const barRef = ref(null)
const barVisible = ref(false)
const thumbHeight = ref(100)
const thumbOffset = ref(0)

function viewportEl() {
  // 页面上可能同时存在多个 select-content（关闭的、动画中的），
  // 只有真正可见的那个 clientHeight 才大于 0，据此挑出目标视口。
  for (const c of document.querySelectorAll('[data-slot="select-content"]')) {
    const v = c.querySelector('[data-slot="select-viewport"]')
    if (v instanceof HTMLElement && v.clientHeight > 0) return v
  }
  return null
}

let boundEl = null

function measure() {
  if (document.visibilityState !== 'visible') return
  const el = viewportEl()
  if (!el) return
  // 视口要等面板真正打开才存在，所以滚动监听在这里惰性绑定
  if (el !== boundEl) {
    boundEl = el
    el.addEventListener('scroll', measure, { passive: true })
  }
  const sh = el.scrollHeight
  const ch = el.clientHeight
  barVisible.value = sh > ch + 1
  if (!barVisible.value) return
  thumbHeight.value = (ch / sh) * 100
  thumbOffset.value = (el.scrollTop / sh) * 100
}

let pollTimer = 0

onMounted(() => {
  nextTick(() => {
    // 面板常驻在 DOM 里、关闭时不可见，打开时机完全由用户决定，
    // 所以这里持续轮询；measure 找不到可见视口会立刻返回，不产生布局读取。
    measure()
    pollTimer = window.setInterval(measure, 200)
  })
})

onBeforeUnmount(() => window.clearInterval(pollTimer))
</script>

<template>
  <SelectPortal>
    <SelectContent
      data-slot="select-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :class="cn(
        'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--reka-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border shadow-md',
        position === 'popper'
          && 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        props.class,
      )
      "
    >
      <!-- 选项超出高度时用容器自身的滚动条，不再显示上下两个箭头按钮 -->
      <!-- 不要 h-(--reka-select-trigger-height)：那会把视口锁成触发器高度，
           内容超出也不产生溢出，外层 max-h 就滚不起来 -->
      <SelectViewport
        ref="viewportRef"
        data-slot="select-viewport"
        :class="cn('p-1', position === 'popper' && 'w-full min-w-(--reka-select-trigger-width) scroll-my-1')"
      >
        <slot />
      </SelectViewport>

      <!-- 常显滚动指示条：不受浏览器 overlay 滚动条影响 -->
      <div
        ref="barRef"
        v-show="barVisible"
        class="pointer-events-none absolute top-1 right-1 bottom-1 w-1.5 overflow-hidden"
        aria-hidden="true"
      >
        <div
          class="bg-foreground/25 w-full rounded-full"
          :style="{
            height: thumbHeight + '%',
            transform: 'translateY(' + (thumbOffset / thumbHeight) * 100 + '%)',
          }"
        />
      </div>
    </SelectContent>
  </SelectPortal>
</template>

