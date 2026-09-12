import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

/**
 * 首页开场动画进程。
 * 阶段依次为：idle 未开始 → starfield 星空 → morphing 汇聚成字
 * → reveal 静态字渐显 → fading 粒子渐隐 → done 结束。
 */
export const useAnimationStore = defineStore('animation', () => {
  const current = ref('idle')
  const playing = ref(false)
  const hasPlayed = ref(false)

  const isDone = computed(() => current.value === 'done')
  const isIntro = computed(() => playing.value)

  function setStage(stage) {
    current.value = stage
    playing.value = stage !== 'idle' && stage !== 'done'
  }

  function begin(stage = 'starfield') {
    hasPlayed.value = true
    setStage(stage)
  }

  function finish() {
    current.value = 'done'
    playing.value = false
  }

  function reset() {
    current.value = 'idle'
    playing.value = false
  }

  return { current, playing, hasPlayed, isDone, isIntro, setStage, begin, finish, reset }
})
