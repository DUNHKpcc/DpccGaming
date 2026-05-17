import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import BlueprintRouteShell from '../views/BlueprintRouteShell.vue'

const Games = () => import('../views/Games.vue')
const Blog = () => import('../views/Blog.vue')
const Account = () => import('../views/Account.vue')
const AdminPanel = () => import('../admin/views/AdminPanel.vue')
const UserManagement = () => import('../admin/views/UserManagement.vue')
const GameManagement = () => import('../admin/views/GameManagement.vue')
const ContentManagement = () => import('../admin/views/ContentManagement.vue')
const RedeemCodeManagement = () => import('../admin/views/RedeemCodeManagement.vue')
const OrderManagement = () => import('../admin/views/OrderManagement.vue')
const PaymentProductManagement = () => import('../admin/views/PaymentProductManagement.vue')
const CodingMode = () => import('../views/CodingMode.vue')
const DocsPlaceholder = () => import('../views/DocsPlaceholder.vue')
const DiscussionMode = () => import('../views/DiscussionMode.vue')
const CookiePolicy = () => import('../views/CookiePolicy.vue')
const Payment = () => import('../views/Payment.vue')
const PaymentOrders = () => import('../views/PaymentOrders.vue')
const PaymentResult = () => import('../views/PaymentResult.vue')

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/games',
    name: 'Games',
    component: Games
  },
  {
    path: '/blog',
    name: 'Blog',
    component: Blog
  },
  {
    path: '/blueprint',
    name: 'BlueprintMode',
    component: BlueprintRouteShell,
    meta: { hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/account',
    name: 'Account',
    component: Account
  },
  {
    path: '/admin',
    name: 'Admin',
    component: AdminPanel,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/users',
    name: 'UserManagement',
    component: UserManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/games',
    name: 'GameManagement',
    component: GameManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/content',
    name: 'ContentManagement',
    component: ContentManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/redeem-codes',
    name: 'RedeemCodeManagement',
    component: RedeemCodeManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/orders',
    name: 'OrderManagement',
    component: OrderManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/admin/payment-products',
    name: 'PaymentProductManagement',
    component: PaymentProductManagement,
    meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/coding/:id',
    name: 'CodingMode',
    component: CodingMode,
    props: true,
    meta: { hideSidebar: true, hideTopbar: true }
  },
  {
    path: '/discussion/:id?',
    name: 'DiscussionMode',
    component: DiscussionMode,
    props: true,
    meta: { hideSidebar: true }
  },
  {
    path: '/aidocs',
    name: 'AiDocs',
    component: DocsPlaceholder
  },
  {
    path: '/docs',
    redirect: '/aidocs'
  },
  {
    path: '/cookie-policy',
    name: 'CookiePolicy',
    component: CookiePolicy,
    meta: { hideSidebar: true }
  },
  {
    path: '/payment',
    name: 'Payment',
    component: Payment
  },
  {
    path: '/payment/orders',
    name: 'PaymentOrders',
    component: PaymentOrders,
    meta: { requiresAuth: true }
  },
  {
    path: '/payment/result',
    name: 'PaymentResult',
    component: PaymentResult
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { left: 0, top: 0 }
  }
})

const CHUNK_RELOAD_KEY = '__dpcc_chunk_reload__'

const clearLocalAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('authToken')
  localStorage.removeItem('currentUser')
}

const restoreSessionFromCookie = async () => {
  try {
    const response = await fetch('/api/verify-token', {
      method: 'GET',
      credentials: 'include'
    })
    if (!response.ok) return false

    const data = await response.json()
    if (data?.token) {
      localStorage.setItem('token', data.token)
      localStorage.setItem('authToken', data.token)
    }
    if (data?.user) {
      localStorage.setItem('currentUser', JSON.stringify(data.user))
    }
    return !!data?.token
  } catch (error) {
    console.error('恢复登录会话失败:', error)
    return false
  }
}

router.onError((error) => {
  const message = (error && error.message) ? error.message : ''
  const isChunkLoadFailure =
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message)

  if (!isChunkLoadFailure) return

  const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'
  if (alreadyReloaded) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    return
  }

  sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  window.location.reload()
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  let token = localStorage.getItem('token')

  // 检查是否需要认证
  if (to.meta.requiresAuth && !token) {
    const restored = await restoreSessionFromCookie()
    if (!restored) {
      clearLocalAuth()
      next('/')
      return
    }
    token = localStorage.getItem('token')
  }

  // 检查管理员权限
  if (to.meta.requiresAdmin) {
    try {
      // 调用API检查管理员权限
      const headers = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch('/api/admin/check-permission', {
        credentials: 'include',
        headers
      })

      if (!response.ok) {
        // 权限不足，重定向到首页
        clearLocalAuth()
        next('/')
        return
      }

      // 权限验证通过，继续访问
      next()
    } catch (error) {
      console.error('权限检查失败:', error)
      next('/')
    }
  } else {
    next()
  }
})

router.afterEach(() => {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  }
})

export default router
