import { createRouter, createWebHistory } from 'vue-router'

import HomeShell from '@/pages/HomeShell.vue'
import Issues from '@/pages/Issues.vue'
import PosterNatbCli111 from '@/pages/PosterNatbCli111.vue'

/**
 * 站点路由。
 *
 * Issue 页是独立整页，用真正的路径而不是 hash：
 *   /issue          列表
 *   /issue/12       详情
 *   /issue/new      新建
 *
 * 首页及其四个 dock 页仍然由一个壳（HomeShell）内部切换，
 * 这样既保住原有的开场动画与预热逻辑，又让 Issue 页可以被直接分享。
 *
 * GitHub Pages 是静态托管：刷新子路径需要 404.html 回退，
 * 构建脚本已经把 dist/index.html 复制成 dist/404.html。
 */
const routes = [
  { path: '/', name: 'home', component: HomeShell },
  { path: '/issue', name: 'issue-list', component: Issues },
  { path: '/issue/new', name: 'issue-new', component: Issues },
  { path: '/issue/:number(\\d+)', name: 'issue-detail', component: Issues, props: true },
  /**
   * 宣传海报：v1.1.1 的发版海报。
   *
   * 刻意不挂进任何导航、dock、更新日志页——点不到，只能靠直连这条路径打开。
   * 因此它也不该被搜索收录，见路由守卫里的 noindex。
   */
  { path: '/poster/natb-cli-1-1-1', name: 'poster-natb-cli-1-1-1', component: PosterNatbCli111 },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    return { top: 0 }
  },
})

/**
 * 海报不属于站点信息架构，只认直连路径，也不该被搜索引擎收录。
 * 进这条路由才补一条 noindex，离开就撤掉，其余页面不受影响。
 */
export const POSTER_ROUTE_NAME = 'poster-natb-cli-1-1-1'

router.afterEach((to) => {
  const existing = document.head.querySelector('meta[name="robots"]')
  if (to.name === POSTER_ROUTE_NAME) {
    if (existing) return
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    meta.setAttribute('content', 'noindex, nofollow')
    meta.dataset.poster = '1'
    document.head.appendChild(meta)
    return
  }
  if (existing?.dataset.poster) existing.remove()
})

export default router
