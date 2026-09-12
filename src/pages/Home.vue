<script setup>
import ParticleField from '@/components/ParticleField.vue'

// ── 那行字 ──
const TITLE = 'New Android Tool Box'
const FONT_FAMILY = "'HarmonyOS Sans SC', Arial"
const FONT_WEIGHT = 700
</script>

<template>
  <div class="home">
    <ParticleField :text="TITLE" :font-family="FONT_FAMILY" :font-weight="FONT_WEIGHT">
      <template #title="{ chars, titleStyle, shift, visible, probe }">
        <h1
          class="home__title"
          :class="{ 'is-visible': visible }"
          :style="[titleStyle, { transform: `translateX(${shift})` }]"
          :aria-label="TITLE"
        >
          <span
            v-for="(item, index) in chars"
            :key="index"
            class="home__char"
            :style="{ left: item.left, top: item.top }"
          ><i v-if="index === 0" :ref="probe" class="home__probe"></i>{{ item.ch }}</span>
        </h1>
      </template>
    </ParticleField>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh; /* 手机地址栏收放时 100vh 会超出可视区 */
  overflow: hidden;
  background: radial-gradient(circle at 50% 45%, #0b1424 0%, #05070d 58%, #000 100%);
}

.home__title {
  position: absolute;
  inset: 0;
  z-index: 1; /* 实体字压在粒子层之上 */
  margin: 0;
  opacity: 0;
  transition: opacity 700ms ease;
  pointer-events: none;
}

.home__title.is-visible {
  opacity: 1;
}

.home__char {
  position: absolute;
  display: block;
  line-height: 1;
  white-space: pre;
  transform: translate(-50%, -50%);
  color: #eaf2ff;
  text-shadow: 0 0 24px rgba(120, 170, 255, 0.45);
}

/* 零尺寸基线探针，底边即该行 alphabetic 基线 */
.home__probe {
  display: inline-block;
  width: 0;
  height: 0;
  vertical-align: baseline;
}
</style>
