<template>
  <div>
    <!-- 桌面端悬浮侧边栏 -->
    <aside 
      v-if="!isMobile"
      ref="floatingSidebar"
      class="floating-sidebar"
      :class="{ 'sidebar-expanded': isExpanded }"
      @mouseenter="handleSidebarEnter"
      @mouseleave="handleSidebarLeave">
      
      <!-- 导航图标 -->
      <nav class="floating-nav">
        <ul class="nav-icons">
          <li 
            v-for="(item, index) in navItems" 
            :key="item.name"
            class="nav-icon-item"
            @mouseenter="expandSidebar(item, index)">
            <router-link 
              :to="item.path"
              :class="[
                'nav-icon',
                { 'nav-icon-active': $route.path === item.path }
              ]"
              @focus="handleNavItemIntent(item)"
              @touchstart.passive="handleNavItemIntent(item)">
              <i :class="item.icon"></i>
              <span
                v-if="shouldShowUnreadDot(item)"
                class="nav-unread-dot"
              ></span>
            </router-link>
          </li>
        </ul>
      </nav>

      <!-- 详细信息面板 -->
      <div 
        ref="detailsPanel"
        class="details-panel">
        <div class="details-content">
          <div class="details-icon">
            <i :class="currentDetails.icon"></i>
          </div>
          <div class="details-text">
            <h3 class="details-title">{{ currentDetails.name }}</h3>
            <p class="details-description">{{ currentDetails.description }}</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- 移动端侧边栏 -->
    <aside 
      v-if="isMobile"
      :class="[
        'sidebar',
        { 'sidebar-open': isOpen },
        'sidebar-mobile'
      ]">
      
      <!-- 侧边栏头部 -->
      <div class="sidebar-header">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <img :src="currentLogo" alt="DpccGaming Logo" class="mobile-sidebar-logo w-8 h-8 mr-3">
            <span class="text-lg font-bold text-white">DpccGaming</span>
          </div>
          <button 
            @click="closeSidebar"
            class="text-neutral hover:text-dark transition-colors">
            <i class="fa fa-times"></i>
          </button>
        </div>
      </div>

      <!-- 导航菜单 -->
      <nav class="sidebar-nav">
        <ul class="space-y-2">
          <li v-for="item in mobileNavItems" :key="item.name">
            <a
              v-if="item.external"
              :href="item.href"
              class="nav-item"
              @click="closeSidebar">
              <i :class="item.icon"></i>
              <span>{{ item.name }}</span>
            </a>
            <router-link 
              v-else
              :to="item.path"
              :class="[
                'nav-item',
                { 'nav-item-active': $route.path === item.path }
              ]"
              @touchstart.passive="handleNavItemIntent(item)"
              @click="closeSidebar">
              <i :class="item.icon"></i>
              <span
                v-if="shouldShowUnreadDot(item)"
                class="mobile-unread-dot"
              ></span>
              <span>{{ item.name }}</span>
            </router-link>
          </li>
        </ul>
      </nav>

      <!-- 用户信息/登录区域 -->
      <div class="sidebar-footer">
        <div v-if="isLoggedIn" class="user-info">
          <div class="mobile-user-profile">
            <div class="mobile-user-avatar-shell">
              <img
                v-if="currentUser?.avatar_url"
                :src="getAvatarUrl(currentUser.avatar_url)"
                alt="用户头像"
                class="mobile-user-avatar"
                @error="handleAvatarError"
              />
              <i v-else class="fa fa-user text-[#1d1d1f] text-sm"></i>
            </div>
            <div class="mobile-user-main">
              <div class="mobile-user-badge-row">
                <UserLevelBadge :user-id="currentUser?.id" />
              </div>
              <div class="mobile-user-meta">
                <span class="mobile-username-text">{{ currentUser.username }}</span>
                <span class="mobile-login-state">已登录</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="login-prompt">
          <button 
            @click="openLoginModal"
            class="w-full bg-white hover:bg-white/90 text-[#1d1d1f] py-2 px-3 rounded-lg text-sm transition-colors">
            登录
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'
import { useThemeStore } from '../stores/theme'
import { gsap } from 'gsap'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import { prefetchBlueprintMode } from '../utils/blueprintAsync'
import UserLevelBadge from './UserLevelBadge.vue'

const authStore = useAuthStore()
const modalStore = useModalStore()
const themeStore = useThemeStore()

const isOpen = ref(false) // 移动端侧边栏状态
const isMobile = ref(false)
const isExpanded = ref(false) // 桌面端侧边栏展开状态
const hoverTimeout = ref(null) // 悬停延迟定时器
const hasUnreadNotifications = ref(false)
let unreadPollingTimer = null

// 模板引用
const floatingSidebar = ref(null)
const detailsPanel = ref(null)

// 导航数据
const navItems = ref([
  {
    name: '主页',
    path: '/',
    icon: 'fa fa-home',
    description: '返回首页，查看平台概览和最新动态'
  },
  {
    name: '游戏区',
    path: '/games',
    icon: 'fa fa-laptop',
    description: '浏览所有游戏，发现有趣的HTML5游戏'
  },
  {
    name: '蓝图模式',
    path: '/blueprint',
    icon: 'fa fa-diagram-project',
    description: '用节点式逻辑快速搭建玩法蓝图'
  },
  {
    name: '团队讨论',
    path: '/discussion',
    icon: 'fa fa-comments',
    description: '进入多人讨论房间，围绕当前游戏协作交流'
  },
  {
    name: '账户详情',
    path: '/account',
    icon: 'fa fa-users',
    description: '管理您的账户信息和个人设置'
  }
])

const mobileNavItems = computed(() => [
  ...navItems.value,
  {
    name: 'Blog',
    path: '/blog',
    icon: 'fa fa-newspaper',
    description: '查看平台更新和文章'
  },
  {
    name: 'AiDocs',
    path: '/aidocs',
    icon: 'fa fa-book',
    description: '阅读平台文档和教程'
  },
  {
    name: 'CDK',
    path: '/payment',
    icon: 'fa fa-ticket',
    description: '购买和查看兑换码相关服务'
  },
  {
    name: 'DPCC API',
    href: 'https://api.dpccgaming.xyz',
    icon: 'fa fa-plug',
    external: true,
    description: '打开 DPCC API 控制台'
  }
])

// 详细信息相关
const currentDetails = ref({
  name: '',
  icon: '',
  description: ''
})

const currentUser = computed(() => authStore.currentUser)
const isLoggedIn = computed(() => authStore.isLoggedIn)
const currentLogo = computed(() => (themeStore.isDark ? '/logo.png' : '/logo_light.png'))

const isAccountItem = (item) => item?.path === '/account'

const shouldShowUnreadDot = (item) => {
  return isAccountItem(item) && hasUnreadNotifications.value
}

const fetchUnreadStatus = async () => {
  if (!isLoggedIn.value) {
    hasUnreadNotifications.value = false
    return
  }

  try {
    const token = localStorage.getItem('token') || authStore.authToken
    if (!token) {
      hasUnreadNotifications.value = false
      return
    }

    const response = await fetch('/api/notifications/unread-status', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) return
    const data = await response.json()
    hasUnreadNotifications.value = Boolean(data?.hasUnread || Number(data?.unreadCount || 0) > 0)
  } catch (error) {
    console.error('获取未读通知状态失败:', error)
  }
}

const clearUnreadPolling = () => {
  if (unreadPollingTimer) {
    clearInterval(unreadPollingTimer)
    unreadPollingTimer = null
  }
}

const canPollUnreadStatus = () => {
  return isLoggedIn.value && !document.hidden && navigator.onLine !== false
}

const startUnreadPolling = () => {
  clearUnreadPolling()
  if (!canPollUnreadStatus()) return
  unreadPollingTimer = setInterval(() => {
    fetchUnreadStatus()
  }, 25000)
}

const handleWindowFocus = () => {
  if (document.hidden) return
  fetchUnreadStatus()
}

const handleNotificationsUpdated = () => {
  fetchUnreadStatus()
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    clearUnreadPolling()
    return
  }
  fetchUnreadStatus()
  startUnreadPolling()
}

const handleNetworkOnline = () => {
  fetchUnreadStatus()
  startUnreadPolling()
}

const handleNetworkOffline = () => {
  clearUnreadPolling()
}

const handleNavItemIntent = (item) => {
  if (item?.path === '/blueprint') {
    prefetchBlueprintMode()
  }
}

// GSAP动画函数
const expandSidebar = (item, index) => {
  handleNavItemIntent(item)
  currentDetails.value = item
  isExpanded.value = true
  
  if (floatingSidebar.value && detailsPanel.value) {
    // 先设置详细信息面板的初始状态
    gsap.set(detailsPanel.value, {
      opacity: 0,
      x: -20,
      scale: 0.9
    })
    
    // 侧边栏展开动画
    gsap.to(floatingSidebar.value, {
      width: 280,
      duration: 0.25,
      ease: "power2.out"
    })
    
    // 详细信息面板显示动画
    gsap.to(detailsPanel.value, {
      opacity: 1,
      x: 0,
      scale: 1,
      duration: 0.2,
      ease: "back.out(1.7)",
      delay: 0.05
    })
    
    // 图标放大效果
    const iconElement = document.querySelector(`.nav-icon-item:nth-child(${index + 1}) .nav-icon`)
    if (iconElement) {
      gsap.to(iconElement, {
        scale: 1.1,
        duration: 0.15,
        ease: "power2.out"
      })
    }
  }
}

// 处理侧边栏鼠标进入事件
const handleSidebarEnter = () => {
  // 清除任何待执行的收缩定时器
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value)
    hoverTimeout.value = null
  }
}

// 处理侧边栏鼠标离开事件
const handleSidebarLeave = () => {
  // 延迟收缩，给用户时间移动鼠标
  hoverTimeout.value = setTimeout(() => {
    if (isExpanded.value) {
      collapseSidebar()
    }
    hoverTimeout.value = null
  }, 200) // 增加延迟时间到200ms
}

const collapseSidebar = () => {
  if (!isExpanded.value) return

  isExpanded.value = false
  
  // 清除定时器
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value)
    hoverTimeout.value = null
  }
  
  if (floatingSidebar.value && detailsPanel.value) {
    gsap.killTweensOf([floatingSidebar.value, detailsPanel.value])

    const tl = gsap.timeline({
      defaults: { overwrite: "auto" },
      onStart: () => {
        gsap.set(floatingSidebar.value, { willChange: "width" })
        gsap.set(detailsPanel.value, { willChange: "opacity, transform" })
      },
      onComplete: () => {
        gsap.set(floatingSidebar.value, { willChange: "auto" })
        gsap.set(detailsPanel.value, { willChange: "auto" })
      }
    })

    // 先快速隐藏右侧内容，再平滑收回宽度，减轻收回时重绘压力
    tl.to(detailsPanel.value, {
      opacity: 0,
      x: -12,
      duration: 0.1,
      ease: "power1.out"
    }).to(floatingSidebar.value, {
      width: 80,
      duration: 0.26,
      ease: "power2.inOut"
    }, 0.03)

    // 直接重置图标缩放，避免额外动画占用帧预算
    const iconElements = document.querySelectorAll('.nav-icon')
    gsap.set(iconElements, { scale: 1 })
  }
}

const closeSidebar = () => {
  if (isMobile.value) {
    isOpen.value = false
  }
}

const openLoginModal = () => {
  modalStore.openModal('login')
  closeSidebar()
}

const checkScreenSize = () => {
  isMobile.value = window.innerWidth < 1024
  if (!isMobile.value) {
    isOpen.value = false // 桌面端默认隐藏侧边栏
  }
}

// 初始化悬浮侧边栏动画
const initFloatingSidebar = () => {
  if (floatingSidebar.value) {
    // 设置初始状态
    gsap.set(floatingSidebar.value, {
      x: -60,
      opacity: 0
    })
    
    // 进入动画
    gsap.to(floatingSidebar.value, {
      x: 0,
      opacity: 1,
      duration: 0.8,
      ease: "power3.out",
      delay: 0.5
    })
  }
}

onMounted(() => {
  checkScreenSize()
  window.addEventListener('resize', checkScreenSize)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('notifications:updated', handleNotificationsUpdated)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleNetworkOnline)
  window.addEventListener('offline', handleNetworkOffline)
  
  // 延迟初始化悬浮侧边栏动画
  setTimeout(() => {
    if (!isMobile.value) {
      initFloatingSidebar()
    }
  }, 100)

  fetchUnreadStatus()
  startUnreadPolling()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkScreenSize)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('notifications:updated', handleNotificationsUpdated)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('online', handleNetworkOnline)
  window.removeEventListener('offline', handleNetworkOffline)
  
  // 清理定时器
  if (hoverTimeout.value) {
    clearTimeout(hoverTimeout.value)
    hoverTimeout.value = null
  }

  clearUnreadPolling()
})

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    hasUnreadNotifications.value = false
    clearUnreadPolling()
    return
  }
  fetchUnreadStatus()
  startUnreadPolling()
}, { immediate: false })

// 暴露方法给父组件
defineExpose({
  toggleSidebar: () => {
    if (isMobile.value) {
      isOpen.value = !isOpen.value
    }
  }
})
</script>

<style scoped>
/* 悬浮侧边栏样式 */
.floating-sidebar {
  position: fixed;
  top: 50%;
  left: 20px;
  transform: translateY(-50%);
  z-index: 1000;
  background: rgb(29, 29, 31);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 20px 0;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  box-sizing: border-box;
  width: 80px;
  height: auto;
  max-height: 86vh;
  display: flex;
  align-items: flex-start;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  overflow: hidden;
}

/* 亮色模式下的悬浮侧边栏毛玻璃效果 */
[data-theme="light"] .floating-sidebar {
  background: rgba(240, 242, 245, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.floating-sidebar.sidebar-expanded {
  width: 280px;
}

.floating-sidebar.sidebar-expanded .details-panel {
  pointer-events: auto;
}

.floating-nav {
  position: relative;
  left: 0;
  top: 0;
  width: 80px;
  height: auto;
  max-height: calc(86vh - 40px);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  overflow-y: auto;
  padding: 20px 0;
  z-index: 10;
}

.nav-icons {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}

.nav-icon-item {
  position: relative;
  display: flex;
  width: 80px;
  justify-content: center;
  align-items: center;
}

.nav-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border-radius: 15px;
  background: rgba(40, 40, 45, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
}

.nav-unread-dot {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(29, 29, 31, 0.95);
}

/* 亮色模式下的导航图标 */
[data-theme="light"] .nav-icon {
  background: rgba(250, 250, 252, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.7);
}

[data-theme="light"] .nav-icon:hover {
  background: rgba(240, 240, 245, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.25);
  color: rgba(0, 0, 0, 0.9);
}

[data-theme="light"] .nav-icon-active {
  background: rgba(220, 220, 225, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.3);
  color: rgba(0, 0, 0, 0.9);
}

.nav-icon:hover {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.nav-icon-active {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: white;
}

.nav-icon i {
  font-size: 20px;
}

/* 详细信息面板 */
.details-panel {
  position: absolute;
  top: 0;
  left: 80px;
  width: 200px;
  height: 100%;
  padding: 20px 15px;
  opacity: 0;
  transform: translateX(-20px) scale(0.9);
  pointer-events: none;
  display: flex;
  align-items: center;
  z-index: 5;
}

.details-content {
  background: rgba(50, 50, 55, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 15px;
  padding: 20px;
  height: calc(100% - 40px);
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

/* 亮色模式下的详细信息面板 */
[data-theme="light"] .details-content {
  background: rgba(248, 249, 250, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.details-icon {
  width: 60px;
  height: 60px;
  border-radius: 15px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 15px;
  align-self: center;
}

.details-icon i {
  color: white;
  font-size: 24px;
}

.details-text {
  text-align: center;
}

.details-title {
  color: white;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.details-icon i {
  color: white;
  font-size: 24px;
}

/* 亮色模式下的详细信息文字颜色 */
[data-theme="light"] .details-icon i {
  color: rgba(0, 0, 0, 0.8);
}

[data-theme="light"] .details-title {
  color: rgba(0, 0, 0, 0.9);
}

[data-theme="light"] .details-description {
  color: rgba(0, 0, 0, 0.7);
}

.details-description {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin: 0;
  line-height: 1.4;
}


/* 移动端侧边栏样式 */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  --site-topbar-z-index: 20000;
  --site-mobile-sidebar-z-index: 20010;
  height: 100svh;
  background: rgb(29, 29, 31);
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.3);
  z-index: var(--site-mobile-sidebar-z-index);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 亮色模式下的移动端侧边栏 */
[data-theme="light"] .sidebar {
  background: #ffffff;
  border-right: 1px solid rgba(0, 0, 0, 0.1);
}

.sidebar-mobile {
  width: min(82vw, 20rem);
  transform: translateX(-100%);
}

.sidebar-mobile.sidebar-open {
  transform: translateX(0);
}

[data-theme="light"] .sidebar-mobile,
[data-theme="light"] .sidebar-mobile .nav-item,
[data-theme="light"] .sidebar-mobile .nav-item span,
[data-theme="light"] .sidebar-mobile .sidebar-header,
[data-theme="light"] .sidebar-mobile .sidebar-header * ,
[data-theme="light"] .sidebar-mobile .user-info,
[data-theme="light"] .sidebar-mobile .login-prompt,
[data-theme="light"] .sidebar-mobile .nav-item i {
  color: #000 !important;
}

[data-theme="light"] .sidebar-mobile .nav-item:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000 !important;
}

[data-theme="light"] .sidebar-mobile .nav-item-active {
  color: #000 !important;
  border-color: rgba(0, 0, 0, 0.25);
}

/* 侧边栏头部 */
.sidebar-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.mobile-sidebar-logo {
  object-fit: contain;
}

.sidebar-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  color: #e5e7eb;
  border: 1px solid transparent;
  text-decoration: none;
  transition: all 0.2s ease;
  margin-bottom: 0.25rem;
}

.mobile-unread-dot {
  position: absolute;
  left: calc(1rem + 20px - 2px);
  top: calc(0.75rem - 3px);
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(29, 29, 31, 0.95);
}

[data-theme="light"] .nav-unread-dot,
[data-theme="light"] .mobile-unread-dot {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.nav-item-active {
  background: transparent;
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.25);
}

.nav-item i {
  width: 20px;
  margin-right: 0.75rem;
  text-align: center;
}

/* 侧边栏底部 */
.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
}

.user-info {
  padding: 0.5rem;
  background: transparent;
  border-radius: 0.5rem;
}

.mobile-user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 9999px;
}

.mobile-user-profile {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.mobile-user-avatar-shell {
  flex: 0 0 2rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9999px;
  background: #ffffff;
}

.mobile-user-main {
  flex: 1;
  min-width: 0;
}

.mobile-user-badge-row {
  display: flex;
  align-items: center;
  min-height: 2rem;
}

.mobile-user-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.mobile-username-text {
  font-size: 0.875rem;
  font-weight: 500;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-login-state {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: #ffffff;
}

.login-prompt {
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 1023px) {
  .floating-sidebar {
    display: none;
  }
}

@media (min-width: 1024px) {
  .sidebar-mobile {
    display: none;
  }
}
</style>
