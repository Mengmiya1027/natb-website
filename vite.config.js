import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import vueDevTools from 'vite-plugin-vue-devtools'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'

// 已安装的 Iconify 图标集：@iconify-json/{solar,lucide,ph}
const ICON_COLLECTIONS = ['solar', 'lucide', 'ph', 'logos']

// 项目站点在子路径，用户站点与本地 dev 用根路径
function pagesBase() {
  const slug = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!slug) return '/'
  return slug.endsWith('.github.io') ? '/' : `/${slug}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: pagesBase(),
  plugins: [
    vue(),
    // vueDevTools(),
    // 自动导入组件，并把 <i-xxx /> 写法解析成图标组件
    Components({
      dts: false,
      resolvers: [
        IconsResolver({
          prefix: 'i',
          // 限定图标集，写错名字不会静默联网下载
          enabledCollections: ICON_COLLECTIONS,
        }),
      ],
    }),
    // 按需编译图标，未使用的会被摇树
    // 需要源码时按 ~icons/xxx/yyy?raw 导入，Features 页就靠它认品牌色
    Icons({ compiler: 'vue3' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      // 原子写留下的临时目录会让监听报 EBUSY，必须忽略
      // 调试脚本与浏览器 profile 同在工作区，被监听同样会 EBUSY 压垮 dev server
      ignored: ['**/.*.tmpdir/**', '**/*.tmp', '**/.dsh-check/**'],
    },
    host: '0.0.0.0',
    port: 5173,
  },
})
