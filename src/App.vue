<template>
  <div class="app-layout">
    <!-- 侧边栏 -->
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    
    <!-- 主内容区域 -->
    <div ref="mainContent" class="main-content" :class="{ 'main-content--no-topbar': !showTopbar }">
      <!-- 顶部导航栏 -->
      <TopNavbar v-if="showTopbar" />
      
      <!-- 页面内容 -->
      <main class="page-content">
        <router-view />
      </main>
    </div>
    
    
    <GameModal v-if="showOverlays" />
    <AddGameModal v-if="showOverlays" />
    <LoginModal v-if="showOverlays" />
    <RegisterModal v-if="showOverlays" />
    
    <!-- 全屏游戏容器 -->
    <FullscreenGame v-if="showOverlays" />
    
    <!-- 通知组件 -->
    <Notification v-if="showOverlays" />
    <CookieConsentBanner v-if="showOverlays && !isDevPreview" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import TopNavbar from './components/TopNavbar.vue'
import GameModal from './components/GameModal.vue'
import AddGameModal from './components/AddGameModal.vue'
import LoginModal from './components/LoginModal.vue'
import RegisterModal from './components/RegisterModal.vue'
import FullscreenGame from './components/FullscreenGame.vue'
import Notification from './components/Notification.vue'
import { useAuthStore } from './stores/auth'
import { useModalStore } from './stores/modal'
import CookieConsentBanner from './components/CookieConsentBanner.vue'

const authStore = useAuthStore()
const modalStore = useModalStore()
const sidebarRef = ref(null)
const mainContent = ref(null)
const route = useRoute()
const isFullscreen = computed(() => modalStore.isFullscreen)
const isDesktop = ref(true)
const isDevPreview = import.meta.env.DEV

const showSidebar = computed(() => !route.meta?.hideSidebar)
const showTopbar = computed(() => {
  if (isDesktop.value) {
    return !route.meta?.hideTopbar
  }

  return !route.meta?.hideTopbar && !isFullscreen.value
})
const showOverlays = computed(() => !route.meta?.hideOverlays)

const updateDesktopFlag = () => {
  isDesktop.value = window.innerWidth >= 1024
}

onMounted(async () => {
  await authStore.checkAuthStatus()
  updateDesktopFlag()
  window.addEventListener('resize', updateDesktopFlag)
  
  // 监听侧边栏切换事件
  window.addEventListener('toggle-sidebar', () => {
    if (sidebarRef.value) {
      sidebarRef.value.toggleSidebar()
    }
  })
  
  // 监听侧边栏显示/隐藏状态变化
  window.addEventListener('sidebar-toggle', (event) => {
    const isHidden = event.detail
    if (mainContent.value) {
      if (isHidden) {
        mainContent.value.style.marginLeft = '0px' // 侧边栏隐藏时无边距
      } else {
        mainContent.value.style.marginLeft = '280px' // 侧边栏显示时添加边距
      }
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateDesktopFlag)
})

watch(showSidebar, (visible) => {
  if (!visible && mainContent.value) {
    mainContent.value.style.marginLeft = '0px'
  }
}, { immediate: true })
</script>

<style scoped>
.app-layout {
  --site-topbar-z-index: 20000;
  --site-mobile-topbar-height: 3.25rem;
  display: flex;
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-left: 0; /* 默认无边距 */
  margin-top: 4rem; /* 为固定导航栏留出空间 */
  transition: margin-left 0.3s ease;
}

.main-content--no-topbar {
  margin-top: 0;
}

.main-content--no-topbar .page-content {
  min-height: 100vh;
}

.page-content {
  flex: 1;
  min-height: calc(100vh - 4rem);
}

/* 桌面端侧边栏布局 - 默认无边距 */
@media (min-width: 1024px) {
  .main-content {
    margin-left: 0; /* 默认无边距，侧边栏完全隐藏 */
    transition: margin-left 0.3s ease;
  }
}

/* 小屏幕下的导航栏调整 */
@media (max-width: 768px) {
  .main-content {
    margin-top: var(--site-mobile-topbar-height); /* 移动端稍小的高度 */
  }
  .main-content--no-topbar {
    margin-top: 0;
  }
}

@media (max-width: 480px) {
  .main-content--no-topbar {
    margin-top: 0;
  }
}
</style>
