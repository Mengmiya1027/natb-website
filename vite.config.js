import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import vueDevTools from 'vite-plugin-vue-devtools'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import IconsResolver from 'unplugin-icons/resolver'

// 已安装的 Iconify 图标集：@iconify-json/{solar,lucide,ph}
const ICON_COLLECTIONS = ['solar', 'lucide', 'ph']

// GitHub Pages 项目站点在子路径下，用户站点（xxx.github.io）在根路径
// 本地 dev 保持根路径，CI 里由 GITHUB_REPOSITORY 推断
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
    // 自动导入 src/components 下的组件，同时把 <i-solar-home-outline /> 这类写法
    // 解析为 unplugin-icons 生成的图标组件
    Components({
      dts: false,
      resolvers: [
        IconsResolver({
          prefix: 'i',
          // 限定可用图标集，避免写错名字时构建期静默联网下载
          enabledCollections: ICON_COLLECTIONS,
        }),
      ],
    }),
    // 构建时按需编译图标，未使用的图标会被摇树（tree-shake）掉
    Icons({ compiler: 'vue3' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      // 编辑器原子写留下的临时目录会让文件监听报 EBUSY 并中断 dev server
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
    host: '0.0.0.0',
    port: 5173,
  },
})
