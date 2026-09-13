<script setup>
// 右侧图片位：填入图片地址即可显示，留空时用占位图标
const actionIcon = ''

// 跟随 base，子路径部署也能取到 public 下的图标
const brandIcon = import.meta.env.BASE_URL + 'natb-icon.png'
</script>

<template>
  <header class="navbar">
    <div class="dock">
      <!-- 左：圆形图标 + 字样 -->
      <a class="brand" href="#">
        <img class="brand-icon" :src="brandIcon" alt="NATB" />
        <span class="brand-text">NATB</span>
      </a>

      <nav class="links" aria-label="主导航">
        <button class="link" type="button">介绍</button>
        <button class="link" type="button">下载</button>
        <button class="link" type="button">关于</button>
      </nav>

      <!-- 右：圆形图片位，将来当按钮用 -->
      <button class="action" type="button" aria-label="更多">
        <img v-if="actionIcon" class="action-icon" :src="actionIcon" alt="" />
        <i-lucide-image v-else width="18" height="18" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* 外层只负责定位，点击穿透交给胶囊自己 */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding: calc(12px + env(safe-area-inset-top)) 12px 0;
  pointer-events: none;
}

/* 灵动岛式黑胶囊 */
.dock {
  pointer-events: auto;
  display: flex;
  align-items: center;
  /* 两端贴边，中间三个按钮分掉剩余空间 */
  justify-content: space-between;
  gap: 4px;
  max-width: calc(100vw - 24px);
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  background: rgba(12, 12, 14, 0.78);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.35);
  user-select: none;
  min-width: 50vw;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  text-decoration: none;
}

.brand-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
  background: #1c1c1e;
}

.brand-text {
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.links {
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.link {
  padding: 4px 16px;
  font-weight: 700;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 17px;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

.link:active {
  scale: 0.94;
}

/* 圆形图片位 */
.action {
  width: 32px;
  height: 32px;
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  overflow: hidden;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: background 0.2s ease, scale 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.action:hover {
  background: rgba(255, 255, 255, 0.22);
}

.action:active {
  scale: 0.92;
}

.action svg {
  display: block;
}

.action-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 窄屏收紧，保住一行 */
@media (max-width: 480px) {
  .brand-text {
    display: none;
  }

  .link {
    padding: 7px 10px;
    font-size: 13px;
  }
}
</style>
