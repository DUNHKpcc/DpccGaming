import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

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
const AdminSecurity = () => import('../admin/views/AdminSecurity.vue')
const CodingMode = () => import('../views/CodingMode.vue')
const DocsPlaceholder = () => import('../views/DocsPlaceholder.vue')
const CookiePolicy = () => import('../views/CookiePolicy.vue')
const Payment = () => import('../views/Payment.vue')
const PaymentOrders = () => import('../views/PaymentOrders.vue')
const PaymentResult = () => import('../views/PaymentResult.vue')
const Download = () => import('../views/Download.vue')

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
    path: '/admin/security',
    name: 'AdminSecurity',
    component: AdminSecurity,
    meta: { requiresAuth: true, requiresAdmin: true, skipAdminElevation: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
  },
  {
    path: '/coding/:id',
    name: 'CodingMode',
    component: CodingMode,
    props: true,
    meta: { hideSidebar: true, hideTopbar: true }
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
    component: Payment,
    meta: { hideDesktopSidebar: true }
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
    path: '/download',
    name: 'Download',
    component: Download,
    meta: { hideSidebar: true, hideOverlays: true }
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
    if (data?.user) {
      localStorage.setItem('currentUser', JSON.stringify(data.user))
    }
    return !!data?.user
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
  // 检查是否需要认证
  if (to.meta.requiresAuth && !localStorage.getItem('currentUser')) {
    const restored = await restoreSessionFromCookie()
    if (!restored) {
      clearLocalAuth()
      next('/')
      return
    }
  }

  // 检查管理员权限
  if (to.meta.requiresAdmin) {
    try {
      // 调用API检查管理员权限
      const response = await fetch('/api/admin/check-permission', {
        credentials: 'include'
      })

      if (!response.ok) {
        // 权限不足，重定向到首页
        clearLocalAuth()
        next('/')
        return
      }

      if (!to.meta.skipAdminElevation) {
        const securityResponse = await fetch('/api/admin/security/status', {
          credentials: 'include'
        })
        const securityStatus = securityResponse.ok
          ? await securityResponse.json()
          : null

        if (!securityStatus?.elevated) {
          next({
            path: '/admin/security',
            query: { redirect: to.fullPath }
          })
          return
        }
      }

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
