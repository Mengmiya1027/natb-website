import { createRouter, createWebHistory } from 'vue-router'

import HomeShell from '@/pages/HomeShell.vue'
import Issues from '@/pages/Issues.vue'

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

export default router
