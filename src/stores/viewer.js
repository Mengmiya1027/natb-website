import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * 特色卡片"展开成大窗"的状态。
 * expanded 严格贴着动画走：点下卡片放大第一帧就为 true，关闭动画彻底收尾才为 false，
 * 期间列表停滚、页面惰性，都只看它一个字段。
 */
export const useViewerStore = defineStore('viewer', () => {
  const active = ref(-1) // 展开的是第几项，-1 表示没有
  const expanded = ref(false) // 展开态，含"正在放大"和"正在收起"两段
  const closing = ref(false) // 关闭动画进行中，覆盖层收到后开始倒放

  const isOpen = computed(() => expanded.value)

  function open(index) {
    active.value = index
    closing.value = false
    expanded.value = true
  }

  // Esc、遮罩、关闭按钮都走这里；真正结束由 finish 宣布
  function requestClose() {
    if (!expanded.value || closing.value) return
    closing.value = true
  }

  // 倒放播完，覆盖层卸载，状态归位
  function finish() {
    expanded.value = false
    closing.value = false
    active.value = -1
  }

  return { active, expanded, closing, isOpen, open, requestClose, finish }
})
