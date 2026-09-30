<script>
/**
 * 标签注册表（本文件唯一的"数据源"）
 *
 * 放在普通 <script> 块里并以命名导出交给宿主 App.vue：背景层整屏渲染哪一页由
 * App.vue 决定，而"项目里到底有哪些页面"只在 HarnessDock.vue 这一处定义。
 *
 * 注意：页面的挂载点是 App.vue 的 <component :is>，本组件只画底部那枚白色胶囊 ——
 * 页面绝不出现在本组件的 DOM 里。
 */
import HomePage from '@/pages/HomePage.vue'
import Features from '@/pages/Features.vue'
import UpdateLog from '@/pages/UpdateLog.vue'
import ProjectInfo from '@/pages/ProjectInfo.vue'
import FeatureBigScreen from '@/components/FeatureBigScreen.vue'

/** 沿用原来的 ?face=N 预览参数：功能页放大状态暂行预览（FeatureBigScreen）开场正对第几面（0 起） */
const FACE = (() => {
  const n = Number(new URLSearchParams(window.location.search).get('face'))
  return Number.isInteger(n) && n >= 0 && n < 8 ? n : 0
})()

export const DOCK_TABS = [
  { id: 'home', short: '首页', file: 'HomePage.vue', desc: '粒子汇聚 / 标题起飞', comp: HomePage },
  { id: 'features', short: '功能', file: 'Features.vue', desc: '卡片网格 / 查看器', comp: Features },
  { id: 'updatelog', short: '更新', file: 'UpdateLog.vue', desc: '3D 卡片轴', comp: UpdateLog },
  { id: 'projectinfo', short: '关于', file: 'ProjectInfo.vue', desc: '项目说明 / 二维码', comp: ProjectInfo },
  {
    id: 'octagon',
    short: '功能页放大状态暂行预览',
    file: 'FeatureBigScreen.vue',
    desc: '8 面 3D 大屏',
    comp: FeatureBigScreen,
    props: { open: true, initial: FACE },
  },
]

/** 默认标签（启动即展示的那一页）。首页不显示顶栏开关，故这里也要用到 */
export const DOCK_HOME = DOCK_TABS[0].id
</script>

<script setup>
/**
 * 底部控制条：一枚白色胶囊 = 一组整合的分段按钮 + Ctrl K 键帽（带"隐藏"二字）
 * + 最右侧的"顶栏"开关（只在非首页出现）。
 *
 * 它不渲染任何页面，只对外表达两件事：
 *   v-model      当前该展示哪一页  → 宿主 App.vue 的背景层
 *   v-model:nav  顶部 dock 栏开不开 → 宿主 App.vue 的 NavBar
 *
 * ── 怎么删掉它（两处、零残留）───────────────────────────────────────
 *   1. 删除本文件；
 *   2. 删除 App.vue 里带 [HARNESS-DOCK] 的行（import / activeId / navOpen / <HarnessDock />）。
 * 页面本体一行都不用动。
 *
 * ── 快捷键 ─────────────────────────────────────────────────────────
 * Ctrl+K（Mac 上 Cmd+K）显隐本控制条，Esc 亦可收起。键帽右侧写着"隐藏"，
 * 键帽本身也是按钮；收起后屏幕下边缘只留一枚很短矮小的指示器（上面照旧写着 Ctrl K 显示），
 * 点它或 Ctrl+K 开回来
 * —— Chrome 的 Ctrl+K 是"聚焦地址栏"的保留行为，脚本拦不干净，所以必须有兜底入口。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 当前选中的标签 id：宿主说了算（v-model 双向绑定 App.vue 的 activeId） */
const activeId = defineModel({ type: String, default: DOCK_HOME })

/** 顶部 dock 栏（NavBar）开着没有：只在非首页由用户拨动 */
const navOpen = defineModel('nav', { type: Boolean, default: true })

/** 控制条自己开着没有。需求：启动网页默认展示 */
const open = ref(true)

// 模板只能引用 <script setup> 的绑定，这里把注册表接进来
const TABS = DOCK_TABS
const HOME = DOCK_HOME

function onKey(event) {
  const key = String(event.key ?? '').toLowerCase()
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && key === 'k') {
    event.preventDefault()
    event.stopPropagation()
    open.value = !open.value
    return
  }
  if (key === 'escape' && open.value) open.value = false
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <!-- 收起态：屏幕下边缘一枚很短矮小的指示器，Ctrl K 提示照旧写在上面 -->
  <button
    v-if="!open"
    class="hd-tick"
    type="button"
    title="展开页面切换条（Ctrl K）"
    @click="open = true"
  >
    <kbd>Ctrl</kbd><kbd>K</kbd><span class="hd__label">显示</span>
  </button>

  <!-- 展开态：一枚白色胶囊，按钮整合成一组 -->
  <nav v-else class="hd" aria-label="页面与组件切换">
    <button
      v-for="tab in TABS"
      :key="tab.id"
      class="hd__btn"
      :class="{ 'is-active': tab.id === activeId }"
      type="button"
      :aria-current="tab.id === activeId ? 'page' : undefined"
      :title="`${tab.file} · ${tab.desc}`"
      @click="activeId = tab.id"
    >
      {{ tab.short }}
    </button>

    <span class="hd__split" aria-hidden="true"></span>

    <button class="hd__key" type="button" title="隐藏切换条（Ctrl K）" @click="open = false">
      <kbd>Ctrl</kbd><kbd>K</kbd><span class="hd__label">隐藏</span>
    </button>

    <!-- 最右侧：顶部 dock 栏开关。首页不显示（首页顶栏由开场动画自己管） -->
    <template v-if="activeId !== HOME">
      <span class="hd__split" aria-hidden="true"></span>

      <button
        class="hd__switch"
        type="button"
        role="switch"
        :aria-checked="navOpen"
        :title="navOpen ? '隐藏顶部 dock 栏' : '显示顶部 dock 栏'"
        @click="navOpen = !navOpen"
      >
        <span class="hd__switch-track" aria-hidden="true"><i class="hd__switch-knob"></i></span>
        <span class="hd__label">顶栏</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
/* 一枚白色胶囊：无渐变、无装饰，只有一层很轻的投影 */
.hd {
  position: fixed;
  left: 50%;
  bottom: 18px;
  translate: -50% 0;
  z-index: 2147483000; /* 高于站内一切 */
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 24px);
  padding: 4px;
  border: 1px solid #ececec;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.04);
  overflow-x: auto;
  scrollbar-width: none;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
  font-size: 13px;
  user-select: none;
}

.hd::-webkit-scrollbar {
  display: none;
}

.hd__btn {
  flex: none;
  padding: 7px 15px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #8a8a8a;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.hd__btn:hover {
  color: #111;
  background: #f5f5f5;
}

.hd__btn.is-active {
  background: #111;
  color: #fff;
}

/* 组与组之间的一根细线 */
.hd__split {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: #ededed;
}

.hd__label {
  color: inherit;
  font-size: 12px;
}

/* Ctrl K 键帽 + "隐藏"二字 */
.hd__key {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #9a9a9a;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.hd__key .hd__label {
  margin-left: 3px;
}

.hd__key:hover {
  background: #f5f5f5;
  color: #111;
}

.hd__key kbd,
.hd-tick kbd {
  padding: 3px 6px;
  border: 1px solid #e6e6e6;
  border-radius: 6px;
  background: #fafafa;
  color: #8a8a8a;
  font: inherit;
  font-size: 11px;
  line-height: 1;
}

/* 最右侧开关：30×17 的细轨道 + 白圆点 */
.hd__switch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 7px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #9a9a9a;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.hd__switch:hover {
  background: #f5f5f5;
  color: #111;
}

.hd__switch-track {
  position: relative;
  display: block;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: #e8e8e8;
  transition: background 0.18s ease;
}

.hd__switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: translate 0.18s ease;
}

.hd__switch[aria-checked='true'] .hd__switch-track {
  background: #111;
}

.hd__switch[aria-checked='true'] .hd__switch-knob {
  translate: 13px 0;
}

/* 收起态：屏幕下边缘一枚很短矮小的指示器（贴底、只留上圆角，Ctrl K 显示 照旧） */
.hd-tick {
  position: fixed;
  left: 50%;
  bottom: 0;
  translate: -50% 0;
  z-index: 2147483000;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px 5px;
  border: 1px solid #ececec;
  border-bottom: 0;
  border-radius: 9px 9px 0 0;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
  color: #a0a0a0;
  font-family: 'HarmonyOS Sans SC', 'Arial', system-ui;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  user-select: none;
  transition: color 0.15s ease, box-shadow 0.15s ease;
}

.hd-tick .hd__label {
  margin-left: 3px;
  font-size: 12px;
}

.hd-tick:hover {
  color: #111;
  box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.1);
}
</style>
