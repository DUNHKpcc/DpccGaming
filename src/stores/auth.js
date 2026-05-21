import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiCall } from '../utils/api'
import { DEFAULT_AVATAR_URL } from '../utils/avatar'
import { compressImageToBlob } from '../utils/image'

export const useAuthStore = defineStore('auth', () => {
  const normalizeUser = (user) => {
    if (!user) return null
    return {
      ...user,
      avatar_url: user.avatar_url || DEFAULT_AVATAR_URL,
      cover_url: user.cover_url || '',
      bio: user.bio || '',
      preferred_language: user.preferred_language || '',
      preferred_engine: user.preferred_engine || ''
    }
  }

  // 从localStorage恢复用户状态
  const currentUser = ref(normalizeUser(JSON.parse(localStorage.getItem('currentUser') || 'null')))
  localStorage.removeItem('authToken')
  localStorage.removeItem('token')
  const authToken = ref(null)

  const isLoggedIn = computed(() => !!currentUser.value)

  const persistAuth = (token, user) => {
    authToken.value = token || null
    currentUser.value = normalizeUser(user)

    localStorage.removeItem('authToken')
    localStorage.removeItem('token')

    if (currentUser.value) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser.value))
    } else {
      localStorage.removeItem('currentUser')
    }
  }

  const updateCurrentUser = (patch) => {
    const base = currentUser.value || {}
    currentUser.value = normalizeUser({ ...base, ...patch })
    if (currentUser.value) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser.value))
    }
  }

  const login = async (username, password) => {
    try {
      const response = await apiCall('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })

      persistAuth(response.token, response.user)

      return { success: true, message: '登录成功！' }
    } catch (error) {
      return { success: false, message: error.message || '登录失败' }
    }
  }

  const register = async (username, password, email = '') => {
    try {
      const response = await apiCall('/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, email })
      })

      persistAuth(response.token, response.user)

      return { success: true, message: '注册成功！您现在已登录。' }
    } catch (error) {
      return { success: false, message: error.message || '注册失败' }
    }
  }

  const logout = async () => {
    // 先清理本地状态，保证界面立即退出登录
    persistAuth(null, null)

    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      // 忽略网络错误，本地状态仍需清理
      console.warn('退出登录请求失败，已清理本地登录状态:', error)
    }
  }

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/verify-token', {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('登录状态无效')
      }

      const data = await response.json()
      persistAuth(null, data.user || null)
      return !!currentUser.value
    } catch (error) {
      console.error('验证令牌失败:', error)
      persistAuth(null, null)
      return false
    }
  }

  const uploadAvatar = async (file) => {
    if (!file) {
      return { success: false, message: '请选择头像文件' }
    }

    if (!file.type.startsWith('image/')) {
      return { success: false, message: '请上传图片文件' }
    }

    try {
      // 压缩头像：最大边长 320px，WebP 格式
      const { blob } = await compressImageToBlob(file, { maxSize: 320, quality: 0.82 })

      const formData = new FormData()
      formData.append('avatar', blob, 'avatar.webp')

      const response = await fetch('/api/user/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.message || '头像上传失败')
      }

      if (data.user) {
        updateCurrentUser(data.user)
      }

      return { success: true, message: data.message || '头像更新成功' }
    } catch (error) {
      console.error('上传头像失败:', error)
      return { success: false, message: error.message || '头像上传失败' }
    }
  }

  const uploadCover = async (file) => {
    if (!file) {
      return { success: false, message: '请选择封面文件' }
    }

    if (!file.type.startsWith('image/')) {
      return { success: false, message: '请上传图片文件' }
    }

    try {
      // 压缩封面：最大边长 1920px，WebP 格式
      const { blob } = await compressImageToBlob(file, { maxSize: 1920, quality: 0.84 })

      const formData = new FormData()
      formData.append('cover', blob, 'cover.webp')

      const response = await fetch('/api/user/cover', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.message || '封面上传失败')
      }

      if (data.user) {
        updateCurrentUser(data.user)
      }

      return { success: true, message: data.message || '封面更新成功' }
    } catch (error) {
      console.error('上传封面失败:', error)
      return { success: false, message: error.message || '封面上传失败' }
    }
  }

  const updateProfile = async (payload = {}) => {
    const headers = {
      'Content-Type': 'application/json'
    }

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(payload || {})
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.message || '资料保存失败')
      }

      if (data.user) {
        updateCurrentUser(data.user)
      }

      return { success: true, message: data.message || '资料保存成功' }
    } catch (error) {
      console.error('更新资料失败:', error)
      return { success: false, message: error.message || '资料保存失败' }
    }
  }

  return {
    currentUser,
    authToken,
    isLoggedIn,
    updateCurrentUser,
    login,
    register,
    logout,
    checkAuthStatus,
    uploadAvatar,
    uploadCover,
    updateProfile
  }
})
