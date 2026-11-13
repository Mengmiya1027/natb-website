<script setup>
/**
 * DockBurst —— 左侧导航坞的"点击回响"（每个图标一套完全不同的动效）。
 *
 * ── 为什么常驻而不是点击时才造 ──────────────────────────────────────
 * 这一层要十几二十个带动画的元素。第一版是点击时 `v-if` 造出来，实测每次"某个图标
 * 第一次被点"都甩出一条 80–170ms 的长任务（创建 + 样式计算 + 首次光栅 + 图层分配
 * 全挤在同一帧），也就是用户说的"点那一下卡"。改成挂载即存在、动画默认 `paused`
 * 停在 0% 帧（全透明，看不见），点击只做两件廉价事：currentTime 归零 + 放行播放。
 *
 * 五种几何语汇刻意错开，避免"同一招换个颜色"：
 *   home        → 粒子绕按钮边缘加速旋转并收紧（吸积盘），收束瞬间炸出一道冲击环；
 *   features    → 4 枚方片从图标四角剥离，各自沿对角旋转飞出；
 *   updatelog   → 一叠带「文字行」的纸片被风吹散，透视翻转斜向右上飞出；
 *   projectinfo → 3 圈同心环依次炸开 + 一根扫描线扫过一整圈（雷达）；
 *   qq          → 5 颗大小不一的气泡带左右摆幅升空。
 *
 * 其余性能约束同样为"点击那一帧别卡"服务：不用 mix-blend-mode（会让整层失去合成
 * 缓存，实测多付 60ms 以上）、不给粒子加 box-shadow、不加 will-change、只动
 * transform / opacity。配色由父级 --fx-ink 声明（白胶囊＝白，白底选中态＝墨）。
 */
import { ref, watch } from 'vue'

defineOptions({ name: 'DockBurst' })

const props = defineProps({
  /** 对应 HarnessDock 注册表里的 tab.id（'qq' 是唯一的非页面项） */
  kind: { type: String, required: true },
  /** 0 = 静置；每次点击自增，凭它把动画重置到起点再放行 */
  seq: { type: Number, default: 0 },
})

/** 每个动效的粒子数：与下面的 CSS 关键帧一一对应 */
const COUNT = {
  home: 12,
  features: 4,
  updatelog: 3,
  projectinfo: 3,
  qq: 5,
}

const root = ref(null)

watch(
  () => props.seq,
  (n) => {
    const el = root.value
    if (!el) return
    if (!n) {
      // 撤场必须连时间轴一起归零：paused + fill: both 会把动画冻在最后一帧，
      // 半途被打断（点了别的图标）时那一帧还在，粒子会永远挂在按钮上。
      el.classList.remove('is-on')
      el.getAnimations({ subtree: true }).forEach((a) => {
        try {
          a.currentTime = 0
        } catch {}
      })
      return
    }
    // 先撤回放行状态、把每条动画按回 0 点，再重新放行：CSS 动画不重建就重播
    el.classList.remove('is-on')
    el.getAnimations({ subtree: true }).forEach((a) => {
      try {
        a.currentTime = 0
      } catch {}
    })
    el.classList.add('is-on')
  },
)
</script>

<template>
  <span ref="root" class="db" :class="`db--${kind}`" aria-hidden="true">
    <i v-for="n in COUNT[kind]" :key="n" class="db__mote" :style="{ '--i': n - 1 }"></i>
  </span>
</template>

<style scoped>
/* 装饰层：铺满按钮、不吃指针、不裁剪（粒子要飞出按钮外才有"迸发"感）。
 * contain 把布局/样式影响关在这一层内，但不动 paint —— 飞出去的部分要照常画。 */
.db {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  contain: layout style;
  /* 静置时整层不显示。用 visibility 而不是指望把动画按回 0 点：CSS 动画一旦被点过，
   * 半途撤场（点了别的图标）会把最后一帧冻在那儿，粒子就永远挂在按钮上。 */
  visibility: hidden;
  /* 父级给的墨色：深色底上是白，选中态的纯白按钮上（以及功能页的浅色卡片墙）是墨 */
  --ink: var(--fx-ink, 255 255 255);
}

/* 所有粒子共用：圆心为原点，具体位置/尺寸由各自的变体类决定 */
.db__mote {
  position: absolute;
  left: 50%;
  top: 50%;
  display: block;
}

/* 常驻的动画默认停在 0% 帧（全部 opacity: 0，看不见），点击才放行。
 * 伪元素的动画也要单独声明 —— animation-play-state 不沿树继承。 */
.db::before,
.db::after,
.db .db__mote {
  animation-play-state: paused;
}

.db.is-on::before,
.db.is-on::after,
.db.is-on .db__mote {
  animation-play-state: running;
}

.db.is-on {
  visibility: visible;
}

/* ── home：粒子被吸进漩涡 → 冲击波扩散 ─────────────────────────────── */
.db--home .db__mote {
  --a: calc(var(--i) * 30deg);
  width: 3px;
  height: 3px;
  margin: -1.5px 0 0 -1.5px;
  border-radius: 50%;
  background: rgb(var(--ink) / 92%);
  animation: db-orbit 700ms cubic-bezier(0.42, 0, 0.3, 1) calc(var(--i) * 14ms) both;
}

/* 一圈点绕着按钮边缘越转越快、半径越收越小 —— 收进中心时已经透明，
 * 所以那一帧不会在图标上留下"糊成一团"的痕迹 */
@keyframes db-orbit {
  0% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(-38px) scale(0.5);
  }
  30% {
    opacity: 1;
    transform: rotate(calc(var(--a) + 90deg)) translateY(-33px) scale(1);
  }
  66% {
    opacity: 0.85;
    transform: rotate(calc(var(--a) + 280deg)) translateY(-13px) scale(0.8);
  }
  100% {
    opacity: 0;
    transform: rotate(calc(var(--a) + 360deg)) translateY(-2px) scale(0.2);
  }
}

/* 收束结束的那一下：一道细环从按钮边缘炸到 100px 外 */
.db--home::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border: 1.4px solid rgb(var(--ink) / 90%);
  border-radius: 50%;
  animation: db-shock 760ms cubic-bezier(0.2, 0.8, 0.2, 1) 420ms both;
}

@keyframes db-shock {
  0% {
    opacity: 0;
    scale: 1;
  }
  16% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    scale: 2.4;
  }
}

/* 中心只留一个转瞬即逝的小亮点 */
.db--home::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: rgb(var(--ink) / 70%);
  animation: db-spark 420ms ease-out 360ms both;
}

@keyframes db-spark {
  0% {
    opacity: 0;
    scale: 0.3;
  }
  35% {
    opacity: 0.85;
    scale: 1.4;
  }
  100% {
    opacity: 0;
    scale: 2;
  }
}

/* ── features：2×2 宫格从图标四角剥离 → 炸裂 ──────────────────────── */
.db--features .db__mote {
  --dx: 0px;
  --dy: 0px;
  --rot: 0deg;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border: 1.5px solid rgb(var(--ink) / 95%);
  border-radius: 3px;
  animation: db-grid 760ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
}

.db--features .db__mote:nth-child(1) {
  --dx: -14px;
  --dy: -14px;
  --rot: -90deg;
}
.db--features .db__mote:nth-child(2) {
  --dx: 14px;
  --dy: -14px;
  --rot: 90deg;
  animation-delay: 24ms;
}
.db--features .db__mote:nth-child(3) {
  --dx: -14px;
  --dy: 14px;
  --rot: 90deg;
  animation-delay: 48ms;
}
.db--features .db__mote:nth-child(4) {
  --dx: 14px;
  --dy: 14px;
  --rot: -90deg;
  animation-delay: 72ms;
}

@keyframes db-grid {
  0% {
    opacity: 0;
    transform: translate(calc(var(--dx) * 0.35), calc(var(--dy) * 0.35)) rotate(calc(var(--rot) * 0.4)) scale(0.4);
  }
  18% {
    opacity: 1;
    transform: translate(var(--dx), var(--dy)) rotate(calc(var(--rot) * 0.55)) scale(1);
  }
  42% {
    opacity: 1;
    transform: translate(calc(var(--dx) * 1.3), calc(var(--dy) * 1.3)) rotate(var(--rot)) scale(1.05);
  }
  100% {
    opacity: 0;
    transform: translate(calc(var(--dx) * 2.9), calc(var(--dy) * 2.9)) rotate(calc(var(--rot) * 2.2)) scale(0.25);
  }
}

.db--features::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 1.2px solid rgb(var(--ink) / 55%);
  border-radius: 4px;
  animation: db-frame 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms both;
}

@keyframes db-frame {
  0% {
    opacity: 0;
    scale: 0.5;
    rotate: 0deg;
  }
  28% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
    scale: 3.2;
    rotate: 45deg;
  }
}

/* ── updatelog：一叠纸被吹散，斜向右上飞出 ─────────────────────────── */
.db--updatelog {
  perspective: 220px;
  perspective-origin: 50% 60%;
}

.db--updatelog .db__mote {
  --tx: 52px;
  --ty: -60px;
  --rz: 20deg;
  width: 17px;
  height: 21px;
  margin: -10.5px 0 0 -8.5px;
  border: 1px solid rgb(var(--ink) / 95%);
  border-radius: 2.5px;
  /* 三层"文字行"直接画在纸片上，不再另加元素（元素越多，这一帧越贵） */
  background: linear-gradient(
    to bottom,
    rgb(var(--ink) / 70%) 0 1px,
    transparent 1px 5px,
    rgb(var(--ink) / 70%) 5px 6px,
    transparent 6px 10px,
    rgb(var(--ink) / 70%) 10px 11px,
    transparent 11px 21px
  );
  background-size: calc(100% - 8px) calc(100% - 12px);
  background-position: 4px 7px;
  background-repeat: no-repeat;
  animation: db-sheet 760ms cubic-bezier(0.25, 0.8, 0.3, 1) calc(var(--i) * 90ms) both;
}

.db--updatelog .db__mote:nth-child(1) {
  --tx: 56px;
  --ty: -62px;
  --rz: 22deg;
}
.db--updatelog .db__mote:nth-child(2) {
  --tx: 72px;
  --ty: -44px;
  --rz: 10deg;
}
.db--updatelog .db__mote:nth-child(3) {
  --tx: 44px;
  --ty: -76px;
  --rz: 32deg;
}

@keyframes db-sheet {
  0% {
    opacity: 0;
    transform: translate3d(-8px, 12px, -40px) rotateX(60deg) rotateZ(-16deg) scale(0.8);
  }
  24% {
    opacity: 1;
    transform: translate3d(2px, 0, 0) rotateX(18deg) rotateZ(-4deg) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--tx), var(--ty), 30px) rotateX(0deg) rotateZ(var(--rz)) scale(0.92);
  }
}

/* ── projectinfo：同心涟漪 + 一圈扫描线 ────────────────────────────── */
.db--projectinfo .db__mote {
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 1.8px solid rgb(var(--ink) / 95%);
  border-radius: 50%;
  animation: db-ring 900ms cubic-bezier(0.15, 0.75, 0.2, 1) calc(var(--i) * 130ms) both;
}

@keyframes db-ring {
  0% {
    opacity: 0;
    scale: 0.3;
  }
  18% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    scale: 4.6;
  }
}

.db--projectinfo::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 2px;
  margin-top: -1px;
  transform-origin: 0 50%;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgb(var(--ink) / 100%), rgb(var(--ink) / 0));
  animation: db-sweep 820ms cubic-bezier(0.3, 0.7, 0.2, 1) both;
}

@keyframes db-sweep {
  0% {
    opacity: 0;
    rotate: -60deg;
  }
  16% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    rotate: 300deg;
  }
}

/* ── qq：大小不一的气泡带摆幅上浮 ──────────────────────────────────── */
.db--qq .db__mote {
  --x: calc((var(--i) - 2) * 7px);
  width: calc(6px + var(--i) * 1.6px);
  height: calc(6px + var(--i) * 1.6px);
  border: 1px solid rgb(var(--ink) / 75%);
  border-radius: 50%;
  background: rgb(var(--ink) / 18%);
  animation: db-bubble 940ms cubic-bezier(0.25, 0.6, 0.3, 1) calc(var(--i) * 70ms) both;
}

@keyframes db-bubble {
  0% {
    opacity: 0;
    transform: translate(calc(-50% + var(--x)), calc(-50% + 18px)) scale(0.3);
  }
  22% {
    opacity: 1;
  }
  58% {
    opacity: 0.9;
    transform: translate(calc(-50% - var(--x) * 0.8), calc(-50% - 20px)) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--x) * 0.6), calc(-50% - 64px)) scale(1.2);
  }
}

/* 少动效：一次都不播，装饰层直接不渲染 */
@media (prefers-reduced-motion: reduce) {
  .db {
    display: none;
  }
}
</style>