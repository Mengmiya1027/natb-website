<script setup>
/**
 * 首页外壳：顶部胶囊栏 + 四个 dock 页 + 左侧导航坞。
 *
 * 这部分原本在 App.vue 里。加入路由后，Issue 页变成独立路由（/issue），
 * 需要自己整屏渲染，所以把"站点常规页面"的宿主抽到这里，
 * App.vue 只保留 <RouterView> 与全局样式。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAnimationStore } from '@/stores/animation'
import HarnessDock, { DOCK_TABS, DOCK_HOME } from '@/components/HarnessDock.vue'

const activeId = ref(DOCK_HOME)
const activeTab = computed(() => DOCK_TABS.find((t) => t.id === activeId.value) ?? DOCK_TABS[0])

const anim = useAnimationStore()
watch(
  activeId,
  () => {
    if (activeId.value !== DOCK_HOME) anim.land()
  },
  { flush: 'post' },
)

/* 顶栏只广播 natb:tab，这里校验后落到注册表里 */
const TAB_IDS = new Set(DOCK_TABS.map((tab) => tab.id))

function onTabRequest(event) {
  const id = event?.detail
  if (typeof id === 'string' && TAB_IDS.has(id)) activeId.value = id
}

/* 悬停预热：把目标页静默挂载一次，让组件代码、样式、字体度量提前算完 */
const WARMABLE = new Set(['features', 'updatelog', 'projectinfo'])
const warmed = new Set()
const warmingId = ref('')
const warmingTab = computed(() => DOCK_TABS.find((t) => t.id === warmingId.value) ?? null)
let warmTimer = 0

function onWarmRequest(event) {
  const id = event?.detail
  if (!WARMABLE.has(id) || warmed.has(id) || activeId.value === id) return
  warmed.add(id)
  warmingId.value = id
  window.clearTimeout(warmTimer)
  warmTimer = window.setTimeout(() => {
    warmingId.value = ''
  }, 320)
}

onMounted(() => {
  window.addEventListener('natb:tab', onTabRequest)
  window.addEventListener('natb:warm', onWarmRequest)
})
onBeforeUnmount(() => {
  window.clearTimeout(warmTimer)
  window.removeEventListener('natb:tab', onTabRequest)
  window.removeEventListener('natb:warm', onWarmRequest)
})
</script>

<template>
  <div>
    <component :is="activeTab.comp" :key="activeId" />

    <Teleport to="body">
      <div v-if="warmingTab" class="warm" aria-hidden="true">
        <component :is="warmingTab.comp" />
      </div>
    </Teleport>

    <HarnessDock v-if="!activeTab.dockless" v-model="activeId" />
  </div>
</template>
