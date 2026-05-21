<template>
  <div class="notifications-section" :class="{ compact: props.compact }">
    <div class="section-header">
      <h3 class="text-xl font-bold text-white">通知中心</h3>
      <div class="flex items-center gap-2">
        <span class="text-sm text-white/80">{{ unreadCount }} 条未读</span>
        <button
          v-if="unreadCount > 0"
          @click="markAllAsRead"
          class="text-xs notification-ghost-btn px-2 py-1 rounded transition-colors"
        >
          全部已读
        </button>
      </div>
    </div>

    <div
      :key="notificationsContentVersion"
      ref="notificationsContentRef"
      class="notifications-content"
    >
      <div v-if="notifications.length === 0" class="text-center py-8 text-white/80">
        <i class="fa fa-bell text-4xl mb-4"></i>
        <p>暂无通知</p>
      </div>

      <div v-else class="notifications-stack">
        <div
          v-for="notification in displayedNotifications"
          :key="notification.id"
          :class="[
            'notification-item',
            notification.is_read ? 'is-read' : 'is-unread'
          ]"
          @click="markAsRead(notification)"
        >
          <div class="notification-icon" :class="getNotificationIconToneClass(notification)">
            <i :class="getNotificationIconByNotification(notification)"></i>
          </div>

          <div class="notification-content">
            <div class="notification-header">
              <h4 class="notification-title">{{ notification.title }}</h4>
              <span class="notification-time">{{ formatTime(notification.created_at) }}</span>
            </div>
            <p class="notification-text">{{ displayNotificationText(notification) }}</p>

            <div v-if="shouldShowPrimaryAction(notification) || hasFriendRequestActions(notification)" class="notification-actions">
              <button
                v-if="shouldShowPrimaryAction(notification)"
                type="button"
                @click.stop="handleNotificationClick(notification, $event)"
                class="notification-action-btn px-3 py-1 rounded-md text-sm font-medium transition-colors"
              >
                <i :class="getNotificationActionIcon(notification)" class="mr-1"></i>
                {{ getNotificationActionText(notification) }}
              </button>

              <div v-if="hasFriendRequestActions(notification)" class="friend-request-actions">
                <button
                  type="button"
                  @click.stop="respondFriendRequest(notification, 'accept')"
                  class="notification-action-btn px-3 py-1 rounded-md text-sm font-medium transition-colors"
                  :disabled="isFriendActionLoading(notification, 'accept') || isFriendActionLoading(notification, 'reject')"
                >
                  {{ isFriendActionLoading(notification, 'accept') ? '处理中...' : '同意' }}
                </button>
                <button
                  type="button"
                  @click.stop="respondFriendRequest(notification, 'reject')"
                  class="notification-secondary-btn px-3 py-1 rounded-md text-sm font-medium transition-colors"
                  :disabled="isFriendActionLoading(notification, 'accept') || isFriendActionLoading(notification, 'reject')"
                >
                  {{ isFriendActionLoading(notification, 'reject') ? '处理中...' : '拒绝' }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="!notification.is_read" class="unread-indicator"></div>
        </div>
      </div>
    </div>

    <div v-if="shouldShowToggle" class="text-center mt-4">
      <button
        @click="toggleNotificationVisibility"
        class="notification-ghost-btn px-4 py-2 rounded-lg transition-colors"
      >
        {{ showAllNotifications ? '收起通知' : '展开通知' }}
      </button>
    </div>

    <div v-if="hasMore && !props.compact" class="text-center mt-6">
      <button
        @click="loadMore"
        :disabled="loading"
        class="notification-ghost-btn px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
      >
        <i v-if="loading" class="fa fa-spinner fa-spin mr-2"></i>
        {{ loading ? '加载中...' : '加载更多' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { io } from 'socket.io-client'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'
import { apiCall, API_BASE_URL } from '../utils/api'

const router = useRouter()
const authStore = useAuthStore()
const gameStore = useGameStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
})

const notifications = ref([])
const loading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = ref(props.compact ? 30 : 10)
const DEFAULT_VISIBLE_NOTIFICATION_COUNT = 3
const showAllNotifications = ref(false)
const friendRequestActionLoading = reactive({})
const handledFriendRequestStatus = reactive({})
const socket = ref(null)
const refreshTimer = ref(null)
const notificationsContentRef = ref(null)
const notificationsContentVersion = ref(0)
const scrollResetTimers = []

const displayedNotifications = computed(() => {
  if (props.compact) return notifications.value
  return showAllNotifications.value
    ? notifications.value
    : notifications.value.slice(0, DEFAULT_VISIBLE_NOTIFICATION_COUNT)
})

const shouldShowToggle = computed(() => {
  if (props.compact) return false
  return notifications.value.length > DEFAULT_VISIBLE_NOTIFICATION_COUNT
})

const toggleNotificationVisibility = () => {
  showAllNotifications.value = !showAllNotifications.value
}

const unreadCount = computed(() => {
  return notifications.value.filter((n) => !n.is_read).length
})

const emitNotificationsUpdated = () => {
  window.dispatchEvent(new CustomEvent('notifications:updated'))
}

const getSocketBaseUrl = () => {
  const customSocketBase = import.meta.env.VITE_WS_BASE_URL
  if (customSocketBase) return customSocketBase
  if (/^https?:\/\//.test(API_BASE_URL)) return API_BASE_URL.replace(/\/api\/?$/, '')
  return window.location.origin
}

const mergeNotification = (incoming) => {
  if (!incoming?.id) return
  const index = notifications.value.findIndex((item) => Number(item.id) === Number(incoming.id))
  if (index >= 0) {
    notifications.value.splice(index, 1, {
      ...notifications.value[index],
      ...incoming
    })
  } else {
    notifications.value.unshift(incoming)
  }
  emitNotificationsUpdated()
}

const scheduleNotificationsRefresh = () => {
  if (refreshTimer.value) {
    window.clearTimeout(refreshTimer.value)
  }
  refreshTimer.value = window.setTimeout(() => {
    refreshTimer.value = null
    fetchNotifications(1, true)
  }, 180)
}

const clearScrollResetTimers = () => {
  while (scrollResetTimers.length) {
    window.clearTimeout(scrollResetTimers.pop())
  }
}

const blurNotificationFocus = (event) => {
  const eventTarget = event?.currentTarget
  if (eventTarget && typeof eventTarget.blur === 'function') {
    eventTarget.blur()
  }

  const activeElement = document.activeElement
  if (!activeElement || typeof activeElement.blur !== 'function') return
  const container = notificationsContentRef.value
  if (!container || container.contains(activeElement)) {
    activeElement.blur()
  }
}

const applyNotificationsScrollTop = () => {
  const container = notificationsContentRef.value
  if (!container) return
  container.scrollTop = 0
}

const stabilizeNotificationsScroll = async ({ rebuild = false } = {}) => {
  clearScrollResetTimers()
  if (rebuild) {
    notificationsContentVersion.value += 1
  }

  await nextTick()
  blurNotificationFocus()
  applyNotificationsScrollTop()
  window.requestAnimationFrame(() => {
    blurNotificationFocus()
    applyNotificationsScrollTop()
  })

  ;[60, 160, 320].forEach((delay) => {
    const timer = window.setTimeout(() => {
      blurNotificationFocus()
      applyNotificationsScrollTop()
    }, delay)
    scrollResetTimers.push(timer)
  })
}

const setupNotificationSocket = () => {
  if (socket.value || !authStore.isLoggedIn) return

  socket.value = io(getSocketBaseUrl(), {
    withCredentials: true,
    transports: ['websocket', 'polling']
  })

  socket.value.on('notification:new', (payload) => {
    const notification = payload?.notification
    if (!notification) return
    mergeNotification(notification)
    scheduleNotificationsRefresh()
  })

  socket.value.on('connect_error', () => {
    // 静默回退到普通拉取
  })
}

const teardownNotificationSocket = () => {
  if (refreshTimer.value) {
    window.clearTimeout(refreshTimer.value)
    refreshTimer.value = null
  }
  if (!socket.value) return
  socket.value.removeAllListeners()
  socket.value.disconnect()
  socket.value = null
}

const handleVisibilityChange = () => {
  if (document.hidden) {
    teardownNotificationSocket()
    return
  }
  fetchNotifications(1, true)
  setupNotificationSocket()
}

const fetchNotifications = async (page = 1, reset = false) => {
  if (!authStore.isLoggedIn) return

  try {
    loading.value = true
    const response = await fetch(`/api/notifications?page=${page}&limit=${pageSize.value}`, {
      credentials: 'include'
    })

    if (response.ok) {
      const data = await response.json()
      const nextList = Array.isArray(data.notifications) ? data.notifications : []

      if (reset) {
        notifications.value = nextList
        stabilizeNotificationsScroll({ rebuild: true })
      } else {
        notifications.value.push(...nextList)
      }

      emitNotificationsUpdated()
      hasMore.value = Boolean(data.hasMore ?? data.pagination?.hasMore)
      currentPage.value = page
    } else {
      console.error('获取通知失败')
    }
  } catch (error) {
    console.error('获取通知错误:', error)
  } finally {
    loading.value = false
  }
}

const markAsRead = async (notification) => {
  if (notification.is_read) return

  try {
    const response = await fetch(`/api/notifications/${notification.id}/read`, {
      method: 'POST',
      credentials: 'include'
    })

    if (response.ok) {
      notification.is_read = true
      emitNotificationsUpdated()
    }
  } catch (error) {
    console.error('标记已读失败:', error)
  }
}

const markAllAsRead = async () => {
  try {
    const response = await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      credentials: 'include'
    })

    if (response.ok) {
      notifications.value.forEach((n) => { n.is_read = true })
      emitNotificationsUpdated()
    }
  } catch (error) {
    console.error('全部标记已读失败:', error)
  }
}

const loadMore = () => {
  if (!loading.value && hasMore.value) {
    fetchNotifications(currentPage.value + 1, false)
  }
}

const getNotificationIcon = (type) => {
  const icons = {
    game_approved: 'fa fa-check-circle',
    game_rejected: 'fa fa-times-circle',
    comment_reply: 'fa fa-reply'
  }
  return icons[type] || 'fa fa-bell'
}

const extractDiscussionRoomId = (content = '') => {
  const matched = String(content).match(/\[discussion-room:(\d+)\]/i)
  if (!matched) return null
  const roomId = Number.parseInt(matched[1], 10)
  return Number.isNaN(roomId) ? null : roomId
}

const extractFriendRequestId = (content = '') => {
  const matched = String(content).match(/\[friend-request:(\d+)\]/i)
  if (!matched) return null
  const requestId = Number.parseInt(matched[1], 10)
  return Number.isNaN(requestId) ? null : requestId
}

const isDiscussionNotification = (notification) => {
  if (!notification) return false
  if (notification.title === '讨论新消息') return true
  return extractDiscussionRoomId(notification.content) !== null
}

const isFriendRequestNotification = (notification) => {
  if (!notification) return false
  return extractFriendRequestId(notification.content) !== null
}

const getNotificationIconByNotification = (notification) => {
  if (isFriendRequestNotification(notification)) return 'fa fa-user-plus'
  if (isDiscussionNotification(notification)) return 'fa fa-comments'
  return getNotificationIcon(notification?.type)
}

const isRejectedReviewNotification = (notification) => {
  const type = String(notification?.type || '').toLowerCase()
  if (type === 'game_rejected') return true
  const text = `${notification?.title || ''} ${notification?.content || ''}`
  return /审核未通过|未通过审核|已拒绝|拒绝通过/.test(text)
}

const isWarningNotification = (notification) => {
  const type = String(notification?.type || '').toLowerCase()
  if (['warning', 'error', 'danger', 'risk_warning'].includes(type)) return true
  const text = `${notification?.title || ''} ${notification?.content || ''}`
  return /警告|风险|违规|异常|封禁/.test(text)
}

const isMessageNotification = (notification) => {
  if (!notification) return false
  if (isDiscussionNotification(notification) || isFriendRequestNotification(notification)) return true
  const type = String(notification?.type || '').toLowerCase()
  return ['comment_reply', 'message', 'chat_message'].includes(type)
}

const getNotificationIconToneClass = (notification) => {
  if (isRejectedReviewNotification(notification)) return 'icon-tone-rejected'
  if (isWarningNotification(notification)) return 'icon-tone-warning'
  if (isMessageNotification(notification)) return 'icon-tone-message'
  return ''
}

const displayNotificationText = (notification) => {
  return String(notification?.content || '')
    .replace(/\[discussion-room:\d+\]\s*/i, '')
    .replace(/\[friend-request:\d+\]\s*/i, '')
}

const shouldShowPrimaryAction = (notification) => {
  if (isFriendRequestNotification(notification)) return false
  return Boolean(notification?.related_game_id || isDiscussionNotification(notification))
}

const hasFriendRequestActions = (notification) => {
  const requestId = extractFriendRequestId(notification?.content)
  if (!requestId) return false
  return !handledFriendRequestStatus[requestId]
}

const isFriendActionLoading = (notification, action) => {
  const requestId = extractFriendRequestId(notification?.content)
  if (!requestId) return false
  return friendRequestActionLoading[`${requestId}:${action}`] === true
}

const respondFriendRequest = async (notification, action) => {
  const requestId = extractFriendRequestId(notification?.content)
  if (!requestId) return
  if (!['accept', 'reject'].includes(action)) return

  const loadingAcceptKey = `${requestId}:accept`
  const loadingRejectKey = `${requestId}:reject`
  friendRequestActionLoading[loadingAcceptKey] = true
  friendRequestActionLoading[loadingRejectKey] = true

  try {
    await apiCall(`/discussion/friends/requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action })
    })
    handledFriendRequestStatus[requestId] = action
    notification.is_read = true
    const statusText = action === 'accept' ? '已同意' : '已拒绝'
    notification.content = `${displayNotificationText(notification)}（${statusText}）`
    notificationStore.success('好友申请已处理', statusText)
    emitNotificationsUpdated()
    window.dispatchEvent(new CustomEvent('friends:changed'))
  } catch (error) {
    notificationStore.error('处理好友申请失败', error.message || '请稍后重试')
  } finally {
    friendRequestActionLoading[loadingAcceptKey] = false
    friendRequestActionLoading[loadingRejectKey] = false
  }
}

const handleNotificationClick = async (notification, event) => {
  blurNotificationFocus(event)
  if (isFriendRequestNotification(notification)) return
  await markAsRead(notification)

  if (isDiscussionNotification(notification)) {
    const roomId = extractDiscussionRoomId(notification.content)
    if (roomId) {
      router.push(`/discussion/${roomId}`)
      return
    }
  }

  if (notification.type === 'comment_reply') {
    const gameId = notification.related_game_id
    const commentId = notification.related_comment_id
    await openGameModalWithComment(gameId, commentId)
  } else {
    const gameId = notification.related_game_id
    await openGameModal(gameId)
  }
}

const openGameModal = async (gameId) => {
  try {
    const game = gameStore.games.find((g) => g.game_id === gameId || g.id === gameId)

    if (game) {
      modalStore.openGameModal(game)
    } else {
      await gameStore.loadGames()
      const foundGame = gameStore.games.find((g) => g.game_id === gameId || g.id === gameId)
      if (foundGame) {
        modalStore.openGameModal(foundGame)
      } else {
        console.error('找不到游戏:', gameId)
      }
    }
  } catch (error) {
    console.error('打开游戏模态框失败:', error)
  }
}

const openGameModalWithComment = async (gameId, commentId) => {
  try {
    await openGameModal(gameId)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('scroll-to-comment', {
        detail: { commentId }
      }))
    }, 500)
  } catch (error) {
    console.error('打开游戏模态框并定位评论失败:', error)
  }
}

const getActionIcon = (type) => {
  const icons = {
    game_approved: 'fa fa-external-link',
    game_rejected: 'fa fa-external-link',
    comment_reply: 'fa fa-comment'
  }
  return icons[type] || 'fa fa-external-link'
}

const getActionText = (type) => {
  const texts = {
    game_approved: '查看游戏',
    game_rejected: '查看游戏',
    comment_reply: '查看评论'
  }
  return texts[type] || '查看游戏'
}

const getNotificationActionIcon = (notification) => {
  if (isDiscussionNotification(notification)) return 'fa fa-comments'
  return getActionIcon(notification.type)
}

const getNotificationActionText = (notification) => {
  if (isDiscussionNotification(notification)) return '进入讨论'
  return getActionText(notification.type)
}

const formatTime = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

onMounted(() => {
  stabilizeNotificationsScroll({ rebuild: true })
  fetchNotifications(1, true)
  if (!document.hidden) {
    setupNotificationSocket()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  clearScrollResetTimers()
  teardownNotificationSocket()
})
</script>

<style scoped>
.notifications-section {
  --notify-card-bg: #111113;
  --notify-card-border: rgba(255, 255, 255, 0.2);
  --notify-card-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
  --notify-item-bg: rgba(255, 255, 255, 0.08);
  --notify-item-bg-hover: rgba(255, 255, 255, 0.12);
  --notify-item-border: rgba(255, 255, 255, 0.18);
  --notify-unread-bg: rgba(255, 255, 255, 0.14);
  --notify-unread-accent: #9ca3af;
  --notify-icon-bg: #ffffff;
  --notify-icon-text: #111111;
  --notify-icon-message-bg: #16a34a;
  --notify-icon-message-text: #ffffff;
  --notify-icon-rejected-bg: #f59e0b;
  --notify-icon-rejected-text: #111111;
  --notify-icon-warning-bg: #dc2626;
  --notify-icon-warning-text: #ffffff;
  --notify-title: #ffffff;
  --notify-text: rgba(255, 255, 255, 0.82);
  --notify-time: rgba(255, 255, 255, 0.68);
  --notify-ghost-bg: rgba(255, 255, 255, 0.12);
  --notify-ghost-bg-hover: rgba(255, 255, 255, 0.2);
  --notify-ghost-text: #ffffff;
  --notify-action-bg: #ffffff;
  --notify-action-bg-hover: #ececec;
  --notify-action-text: #111111;
  background: var(--notify-card-bg);
  border: 1px solid var(--notify-card-border);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: var(--notify-card-shadow);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.notifications-section.compact {
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: inherit;
  padding: 1rem;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 0.75rem;
  flex-shrink: 0;
}

.notifications-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  scroll-behavior: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
}

.notifications-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex-shrink: 0;
  overflow-anchor: none;
}

.notifications-section.compact .notifications-content {
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.2rem;
  overflow-anchor: none;
}

[data-theme='light'] .notifications-section {
  --notify-card-bg: #ffffff;
  --notify-card-border: rgba(17, 17, 17, 0.16);
  --notify-card-shadow: 0 8px 24px rgba(17, 17, 17, 0.08);
  --notify-item-bg: #f5f5f5;
  --notify-item-bg-hover: #efefef;
  --notify-item-border: rgba(17, 17, 17, 0.12);
  --notify-unread-bg: #ececec;
  --notify-unread-accent: #6b7280;
  --notify-icon-bg: #111111;
  --notify-icon-text: #ffffff;
  --notify-icon-message-bg: #16a34a;
  --notify-icon-message-text: #ffffff;
  --notify-icon-rejected-bg: #f59e0b;
  --notify-icon-rejected-text: #111111;
  --notify-icon-warning-bg: #dc2626;
  --notify-icon-warning-text: #ffffff;
  --notify-title: #111111;
  --notify-text: rgba(17, 17, 17, 0.8);
  --notify-time: rgba(17, 17, 17, 0.62);
  --notify-ghost-bg: rgba(17, 17, 17, 0.08);
  --notify-ghost-bg-hover: rgba(17, 17, 17, 0.14);
  --notify-ghost-text: #111111;
  --notify-action-bg: #111111;
  --notify-action-bg-hover: #2a2a2a;
  --notify-action-text: #ffffff;
}

.notifications-section .text-white {
  color: var(--notify-title) !important;
}

.notifications-section .text-white\/80 {
  color: var(--notify-text) !important;
}

.notification-item {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  flex: 0 0 auto;
  gap: 1rem;
  padding: 1rem;
  background: var(--notify-item-bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 88px;
  box-sizing: border-box;
}

.notification-item,
.notification-item > * {
  min-width: 0;
}

.notifications-section.compact .notification-item {
  min-height: unset;
}

.notification-item:hover {
  background: var(--notify-item-bg-hover);
  border-color: var(--notify-item-border);
}

.notification-item.is-unread {
  background: var(--notify-unread-bg);
  padding-right: 2rem;
}

.notification-icon {
  width: 2.5rem;
  height: 2.5rem;
  background: var(--notify-icon-bg);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.notification-icon i {
  font-size: 1.25rem;
  color: var(--notify-icon-text);
}

.notification-icon.icon-tone-message {
  background: var(--notify-icon-message-bg);
}

.notification-icon.icon-tone-message i {
  color: var(--notify-icon-message-text);
}

.notification-icon.icon-tone-rejected {
  background: var(--notify-icon-rejected-bg);
}

.notification-icon.icon-tone-rejected i {
  color: var(--notify-icon-rejected-text);
}

.notification-icon.icon-tone-warning {
  background: var(--notify-icon-warning-bg);
}

.notification-icon.icon-tone-warning i {
  color: var(--notify-icon-warning-text);
}

.notification-content {
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
  gap: 0.75rem;
  min-width: 0;
  width: 100%;
}

.notification-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--notify-title);
  margin: 0;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.notification-time {
  color: var(--notify-time);
  font-size: 0.8rem;
  white-space: nowrap;
  margin-left: 1rem;
}

.notification-text {
  color: var(--notify-text);
  font-size: 0.9rem;
  line-height: 1.4;
  margin: 0 0 0.5rem 0;
  overflow-wrap: anywhere;
}

.notification-actions {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.friend-request-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.unread-indicator {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 0.5rem;
  height: 0.5rem;
  background: var(--notify-unread-accent);
  border-radius: 50%;
  pointer-events: none;
}

.notification-ghost-btn {
  background: var(--notify-ghost-bg);
  color: var(--notify-ghost-text);
  border: 1px solid var(--notify-item-border);
}

.notification-ghost-btn:hover {
  background: var(--notify-ghost-bg-hover);
}

.notification-action-btn {
  background: var(--notify-action-bg);
  color: var(--notify-action-text);
  border: 1px solid var(--notify-item-border);
  white-space: nowrap;
}

.notification-action-btn:hover {
  background: var(--notify-action-bg-hover);
}

.notification-secondary-btn {
  background: transparent;
  color: var(--notify-time);
  border: 1px solid var(--notify-item-border);
}

.notification-secondary-btn:hover {
  background: var(--notify-ghost-bg-hover);
}

@media (max-width: 640px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .notification-item {
    padding: 0.75rem;
    gap: 0.75rem;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .notification-item.is-unread {
    padding-right: 1.5rem;
  }

  .notification-icon {
    width: 2rem;
    height: 2rem;
  }

  .notification-icon i {
    font-size: 1rem;
  }

  .notification-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .notification-time {
    margin-left: 0;
    margin-top: 0.25rem;
  }

  .unread-indicator {
    display: none;
  }
}
</style>
