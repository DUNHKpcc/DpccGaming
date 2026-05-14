<template>
  <header class="top-navbar">
    <div class="navbar-content">
      <div class="navbar-left">
        <button
          @click="toggleSidebar"
          class="menu-button"
          aria-label="打开菜单"
        >
          <i class="fa fa-bars"></i>
        </button>

        <div class="navbar-title">
          <router-link to="/" class="title-link">
            <img
              :src="currentLogo"
              alt="DpccGaming Logo"
              class="logo-image mr-2"
            />
            DpccGaming
          </router-link>
        </div>

        <nav class="main-nav-links">
          <router-link to="/blog" class="nav-link nav-link--optional" active-class="nav-link-active">
            Blog
          </router-link>
          <router-link to="/aidocs" class="nav-link nav-link--optional" active-class="nav-link-active">
            AiDocs
          </router-link>
          <a href="https://api.dpccgaming.xyz" class="nav-link nav-link--api">
            DPCC API
          </a>
          <router-link to="/payment" class="nav-link nav-link--payment" active-class="nav-link-active">
            CDK
          </router-link>
        </nav>
      </div>

      <div class="navbar-right">
        <button
          @click="toggleTheme"
          class="theme-toggle-btn"
          :aria-label="themeToggleLabel"
          :title="themeToggleLabel"
        >
          <i :class="themeToggleIcon" aria-hidden="true"></i>
        </button>

        <div v-if="!isLoggedIn" class="auth-buttons">
          <button @click="openLoginModal" class="btn-secondary">
            登录
          </button>
          <button @click="openRegisterModal" class="btn-primary">
            注册
          </button>
        </div>

        <div v-else class="user-menu">
          <div class="user-info">
            <div class="user-avatar">
              <img
                v-if="currentUser?.avatar_url"
                :src="getAvatarUrl(currentUser.avatar_url)"
                alt="用户头像"
                class="user-avatar-image"
                @error="handleAvatarError"
              />
              <i v-else class="fa fa-user"></i>
            </div>
            <div class="username-row">
              <span class="username">{{ currentUser.username }}</span>
              <UserLevelBadge :user-id="currentUser?.id" />
            </div>
          </div>
          <div class="dropdown">
            <button @click="toggleDropdown" class="dropdown-toggle">
              <i class="fa fa-chevron-down"></i>
            </button>
            <div v-if="showDropdown" class="dropdown-menu">
              <router-link to="/account" class="dropdown-item" @click="closeDropdown">
                <i class="fa fa-user"></i>
                账户详情
              </router-link>
              <router-link to="/payment/orders" class="dropdown-item" @click="closeDropdown">
                <i class="fa fa-receipt"></i>
                历史订单
              </router-link>
              <router-link v-if="isAdmin" to="/admin" class="dropdown-item" target="_blank" rel="noopener" @click="closeDropdown">
                <i class="fa fa-cog"></i>
                管理后台
              </router-link>
              <button @click="logout" class="dropdown-item">
                <i class="fa fa-sign-out"></i>
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'
import { useThemeStore } from '../stores/theme'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import UserLevelBadge from './UserLevelBadge.vue'

const authStore = useAuthStore()
const modalStore = useModalStore()
const themeStore = useThemeStore()

const showDropdown = ref(false)
const isAdmin = ref(false)

const currentUser = computed(() => authStore.currentUser)
const isLoggedIn = computed(() => authStore.isLoggedIn)
const isDark = computed(() => themeStore.isDark)
const themeMode = computed(() => themeStore.themeMode)

const currentLogo = computed(() => (isDark.value ? '/logo.png' : '/logo_light.png'))
const themeToggleLabel = computed(() => {
  if (themeMode.value === 'system') return '当前跟随系统，点击切换到亮色模式'
  if (themeMode.value === 'light') return '当前亮色模式，点击切换到暗色模式'
  return '当前暗色模式，点击切换到跟随系统'
})
const themeToggleIcon = computed(() => {
  if (themeMode.value === 'system') return 'fa fa-desktop'
  if (themeMode.value === 'light') return 'fa fa-sun'
  return 'fa fa-moon'
})

const checkAdminPermission = async () => {
  const token = localStorage.getItem('token')

  try {
    const headers = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch('/api/admin/check-permission', {
      credentials: 'include',
      headers
    })

    if (response.ok) {
      const data = await response.json()
      isAdmin.value = data.isAdmin && ['admin', 'super_admin'].includes(data.user.role)
    } else {
      isAdmin.value = false
    }
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    isAdmin.value = false
  }
}

const toggleSidebar = () => {
  window.dispatchEvent(new CustomEvent('toggle-sidebar'))
}

const openLoginModal = () => {
  modalStore.openModal('login')
}

const openRegisterModal = () => {
  modalStore.openModal('register')
}

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const closeDropdown = () => {
  showDropdown.value = false
}

const logout = () => {
  authStore.logout()
  closeDropdown()
}

const toggleTheme = () => {
  themeStore.toggleTheme()
}

const handleClickOutside = (event) => {
  if (!event.target.closest('.dropdown')) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  checkAdminPermission()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

.top-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20000;
  background: rgb(29, 29, 31);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="light"] .top-navbar {
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
}

.navbar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  max-width: 100%;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.main-nav-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: 1.5rem;
}

.nav-link {
  padding: 0.35rem 0.9rem;
  border-radius: 9999px;
  font-size: 1rem;
  font-weight: 800;
  color: #e5e7eb;
  text-decoration: none;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.nav-link-active {
  background: #ffffff;
  color: #000000;
  border-color: transparent;
}

[data-theme="light"] .nav-link {
  color: #1f2937;
}

[data-theme="light"] .nav-link:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
}

[data-theme="light"] .nav-link-active {
  background: #000000;
  color: #ffffff;
}

.menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  background: #2e2e30;
  border-radius: 0.5rem;
  color: #f3f4f6;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-button:hover {
  background: #3a3a3d;
  color: #ffffff;
}

[data-theme="light"] .menu-button {
  background: #f3f4f6;
  color: #1f2937;
}

[data-theme="light"] .menu-button:hover {
  background: #e5e7eb;
  color: #111827;
}

.navbar-title {
  font-size: 1.25rem;
  font-weight: bold;
  color: #f9fafb;
  margin: 0;
  transition: color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="light"] .navbar-title {
  color: #000000;
}

.title-link {
  display: flex;
  align-items: center;
  color: inherit;
  text-decoration: none;
  transition: color 0.2s ease;
}

.title-link:hover {
  color: #676767;
}

.logo-image {
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
  transition: opacity 0.3s ease, transform 0.3s ease;
  opacity: 1;
}

.logo-image:hover {
  transform: scale(1.05);
}

[data-theme="light"] .logo-image {
  opacity: 1;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.theme-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  background: #2e2e30;
  border-radius: 0.5rem;
  color: #f3f4f6;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.theme-toggle-btn:hover {
  background: #3a3a3d;
  color: #ffffff;
  transform: scale(1.05);
}

.theme-toggle-btn i {
  font-size: 1rem;
  transition: all 0.3s ease;
}

[data-theme="light"] .theme-toggle-btn {
  background: #f8f9fa;
  color: #4a5568;
  border: 1px solid #e2e8f0;
}

[data-theme="light"] .theme-toggle-btn:hover {
  background: #e2e8f0;
  color: #2d3748;
}

.auth-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-primary {
  background: #ffffff;
  color: #000000;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: #f3f4f6;
  color: #000000;
}

[data-theme="light"] .btn-primary {
  background: #000000;
  color: #ffffff;
}

[data-theme="light"] .btn-primary:hover {
  background: #333333;
  color: #ffffff;
}

.btn-secondary {
  background: #ffffff;
  color: #000000;
  border: 1px solid #ffffff;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: #f9fafb;
  color: #374151;
}

[data-theme="light"] .btn-secondary {
  background: #000000;
  color: #ffffff;
  border: 1px solid #000000;
}

[data-theme="light"] .btn-secondary:hover {
  background: #333333;
  color: #ffffff;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.user-avatar {
  width: 2rem;
  height: 2rem;
  background: #ffffff;
  color: #1d1d1f;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.username {
  font-weight: 500;
  color: #ffffff;
  transition: color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.username-row {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

[data-theme="light"] .username {
  color: #1f2937;
}

.dropdown {
  position: relative;
}

.dropdown-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s ease;
}

.dropdown-toggle:hover {
  background: #f3f4f6;
  color: #374151;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: rgb(29, 29, 31);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  min-width: 12rem;
  z-index: 20001;
}

[data-theme="light"] .dropdown-menu {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: #ffffff;
  text-decoration: none;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.dropdown-item i {
  width: 1rem;
  text-align: center;
}

[data-theme="light"] .dropdown-item {
  color: #1f2937;
}

@media (max-width: 768px) {
  .navbar-content {
    padding: 0.75rem 1rem;
  }

  .navbar-left {
    gap: 0.55rem;
    min-width: 0;
  }

  .main-nav-links {
    gap: 0.35rem;
    margin-left: 0.25rem;
  }

  .nav-link {
    padding: 0.3rem 0.55rem;
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .nav-link--optional {
    display: none;
  }

  .menu-button {
    width: 2.25rem;
    height: 2.25rem;
  }

  .navbar-title {
    font-size: 1.125rem;
  }

  .navbar-right {
    gap: 0.5rem;
  }

  .theme-toggle-btn {
    width: 2.25rem;
    height: 2.25rem;
  }

  .theme-toggle-btn i {
    font-size: 0.875rem;
  }

  .auth-buttons {
    gap: 0.25rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .user-info {
    gap: 0.25rem;
  }

  .username {
    font-size: 0.875rem;
  }

  .user-avatar {
    width: 1.75rem;
    height: 1.75rem;
    font-size: 0.75rem;
  }
}

@media (max-width: 480px) {
  .navbar-content {
    padding: 0.5rem 0.75rem;
  }

  .navbar-title {
    font-size: 1rem;
  }

  .title-link {
    max-width: 1.5rem;
    overflow: hidden;
    font-size: 0;
  }

  .logo-image {
    margin-right: 0 !important;
  }

  .btn-primary,
  .btn-secondary {
    display: none;
  }

  .username-row {
    display: none;
  }
}
</style>
