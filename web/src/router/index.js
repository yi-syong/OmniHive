import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../pages/DashboardPage.vue'
import EditorPage from '../pages/EditorPage.vue'

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardPage
  },
  {
    path: '/editor',
    name: 'Editor',
    component: EditorPage
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
