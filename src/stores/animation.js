import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 首页开场动画进程。
 * 阶段依次为：idle 未开始 → starfield 星空 → morphing 汇聚成字
 * → reveal 静态字渐显 → fading 粒子渐隐 → done 粒子收尾
 * → flying 那行字飞向窗口标题 → landed 开场结束。
 */
export const useAnimationStore = defineStore('animation', () => {
  const current = ref('idle')
  const playing = ref(false)
  const hasPlayed = ref(false)

  const isDone = computed(() => current.value === 'done')
  const isFlying = computed(() => current.value === 'flying')
  const isLanded = computed(() => current.value === 'landed')
  const isIntro = computed(() => playing.value)

  function setStage(stage) {
    current.value = stage
    // idle 与 landed 才算停下，done 之后那 1s 还在演
    playing.value = stage !== 'idle' && stage !== 'landed'
  }

  function begin(stage = 'starfield') {
    hasPlayed.value = true
    setStage(stage)
  }

  // 粒子收尾，字还在台上等落位
  function finish() {
    setStage('done')
  }

  // 字已就位，整场开场结束
  function land() {
    setStage('landed')
  }

  function reset() {
    current.value = 'idle'
    playing.value = false
  }

  return {
    current,
    playing,
    hasPlayed,
    isDone,
    isFlying,
    isLanded,
    isIntro,
    setStage,
    begin,
    finish,
    land,
    reset,
  }
})
