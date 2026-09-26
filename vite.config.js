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
      /* Windows 上原生 fs.watch 对"此刻正被写入"的文件会直接抛 EBUSY，
       * 而 chokidar 的该异常不受 ignored 保护 —— 编辑器/工具的原子替换或并发写入
       * 会把整个 dev server 掀翻（本项目已复现三次：364656.mov、*.vue~RFxxx.TMP、3dcard.vue）。
       * 改成轮询：不再对具体文件注册原生 watcher，这个失败模式从根上消失，代价是一点 CPU。 */
      usePolling: true,
      interval: 300,
      // 原子写留下的临时目录会让监听报 EBUSY，必须忽略
      // 调试脚本与浏览器 profile 同在工作区，被监听同样会 EBUSY 压垮 dev server
      // 大体积媒体文件（下载/剪辑途中）被 watch 打开同样会 EBUSY，一并忽略；
      // public 下的静态资源照常由中间件直出，不受影响
      // 注意：编辑器/工具的原子替换会落成 xxx~RF1a2b3c.TMP，Windows 上通配大小写敏感，
      // 只写 *.tmp 会漏掉大写，dev server 会被这个临时文件直接掀翻
      ignored: [
        '**/.*.tmpdir/**',
        '**/*.tmp',
        '**/*.TMP',
        '**/*~RF*',
        '**/.dsh-check/**',
        '**/*.mov',
        '**/*.mp4',
        '**/*.webm',
      ],
    },
    host: '0.0.0.0',
    port: 5173,
  },
})
