import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import PostListView from './views/PostListView.vue'
import PostView from './views/PostView.vue'
import AboutView from './views/AboutView.vue'

// 使用 hash 路由：GitHub Pages 上刷新/直达任意页面都不会 404
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/posts', name: 'posts', component: PostListView },
    { path: '/post/:slug', name: 'post', component: PostView, props: true },
    { path: '/about', name: 'about', component: AboutView },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
