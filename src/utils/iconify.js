/**
 * Iconify 运行时配置
 *
 * 本项目提供两种图标用法：
 *
 * 1. 构建时按需编译（推荐：离线可用、零运行时开销）
 *    - 显式引入：import SolarHomeOutline from '~icons/solar/home-outline'
 *    - 自动导入：<i-solar-home-outline /> / <i-lucide-rocket /> / <i-ph-github-logo />
 *    图标数据来自 @iconify-json/{solar,lucide,ph}，只有真正用到的图标会进入产物。
 *    配置见 vite.config.js 里的 unplugin-icons / unplugin-vue-components。
 *
 * 2. 运行时动态图标名（图标名来自后端接口或配置时才需要）
 *    <Icon icon="solar:home-outline" width="24" />
 *    未注册的图标会按需从 https://api.iconify.design 请求，需要联网。
 *
 * 想同时做到「离线 + 动态图标名」，可在此按需注册图标集数据，例如：
 *
 *   import { addCollection } from '@iconify/vue' // 必须与下面 Icon 来自同一入口
 *   import solar from '@iconify-json/solar/icons.json'
 *   addCollection(solar)
 *
 * 注意：addCollection 会把整个图标集打进包里（solar 约 9.85 MB、ph 约 4.35 MB），
 * 所以只建议在确实需要时按需注册，而不是一次性把三套全部注册。
 */
import { Icon } from '@iconify/vue'

/** 全局注册 <Icon> 组件，模板中可直接写 <Icon icon="lucide:rocket" /> */
export const IconifyPlugin = {
  install(app) {
    app.component('Icon', Icon)
  },
}

export { Icon }
