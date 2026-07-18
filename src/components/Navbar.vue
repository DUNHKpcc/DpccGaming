<template>
  <header class="fixed w-full z-[1000] bg-white shadow-sm">
    <nav class="container mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center">
        <img src="/logo.png" alt="DpccGaming Logo" class="w-8 h-8 mr-2">
        <span class="text-2xl font-bold text-primary">DpccGaming</span>
      </div>

      <div class="flex items-center space-x-4">
        <!-- 游客状态按钮 -->
        <div v-if="!isLoggedIn" class="flex items-center space-x-4">
          <button @click="openLoginModal" class="hover:text-primary transition-colors duration-300">
            登录
          </button>
          <button @click="openRegisterModal"
            class="bg-primary hover:bg-primary/90 text-white px-5 py-2 rounded-full transition-all duration-300">
            注册
          </button>
        </div>
        
        <!-- 登录用户状态 -->
        <div v-else class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <i class="fa fa-user-circle text-primary text-xl"></i>
            <span class="text-dark font-medium">{{ currentUser?.username }}</span>
          </div>
          <button @click="logout" class="text-neutral hover:text-primary transition-colors duration-300">
            退出登录
          </button>
        </div>
      </div>
    </nav>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'

const authStore = useAuthStore()
const modalStore = useModalStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const currentUser = computed(() => authStore.currentUser)

const openLoginModal = () => {
  modalStore.openModal('login')
}

const openRegisterModal = () => {
  modalStore.openModal('register')
}

const logout = () => {
  authStore.logout()
}
</script>
