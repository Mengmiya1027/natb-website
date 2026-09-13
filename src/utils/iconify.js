/**
 * Iconify 运行时配置
 * 首选构建期按需编译：<i-solar-home-outline /> 离线可用、零运行时开销。
 * 动态图标名（<Icon icon="solar:home-outline" />）未注册时会联网请求。
 * addCollection 会把整套图标打进包（solar 约 9.85 MB），非必要别用。
 */
import { Icon } from '@iconify/vue'

/** 全局注册 <Icon> 组件，模板中可直接写 <Icon icon="lucide:rocket" /> */
export const IconifyPlugin = {
  install(app) {
    app.component('Icon', Icon)
  },
}

export { Icon }
