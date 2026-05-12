<template>
  <div v-if="notifications.length > 0" class="notification-container">
    <div class="notification-board">
      <TransitionGroup name="notification" tag="div" class="notification-list">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="['notification-card', `notification-card-${resolveType(notification.type)}`]"
          @click="removeNotification(notification.id)"
        >
          <div class="notification-top">
            <div class="notification-main">
              <span class="notification-icon" aria-hidden="true">
                <i :class="getIconClass(notification.type)"></i>
              </span>
              <div class="notification-copy">
                <div class="notification-title">{{ notification.title || 'Notification' }}</div>
                <div v-if="notification.message" class="notification-message">{{ notification.message }}</div>
              </div>
            </div>

            <button
              type="button"
              class="notification-close"
              aria-label="Close"
              @click.stop="removeNotification(notification.id)"
            >
              <i class="fa fa-times"></i>
            </button>
          </div>

          <img src="/logo.png" alt="Brand" class="notification-brand" />
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNotificationStore } from '../stores/notification'

const notificationStore = useNotificationStore()
const notifications = computed(() => notificationStore.notifications)

const resolveType = (type) => {
  const normalized = String(type || '').toLowerCase()
  if (normalized === 'error') return 'error'
  if (normalized === 'warning') return 'warning'
  if (normalized === 'success') return 'success'
  if (normalized === 'info') return 'information'
  return 'feature'
}

const getIconClass = (type) => {
  const resolved = resolveType(type)
  const icons = {
    error: 'fa fa-exclamation-circle',
    warning: 'fa fa-exclamation-triangle',
    success: 'fa fa-check-circle',
    information: 'fa fa-info-circle',
    feature: 'fa fa-star'
  }
  return icons[resolved] || icons.feature
}

const removeNotification = (id) => {
  notificationStore.removeNotification(id)
}
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  width: min(92vw, 431px);
}

.notification-board {
  background: transparent;
  border: none;
  border-radius: 4px;
  padding: 0;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 19px;
}

.notification-card {
  position: relative;
  width: 100%;
  border-radius: 4px;
  min-height: 80px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #ffffff;
  cursor: pointer;
  border: none;
}

.notification-card-error {
  background: #ad1028;
}

.notification-card-warning {
  background: #e18340;
}

.notification-card-success {
  background: #67bd95;
}

.notification-card-information {
  background: #4c63d6;
}

.notification-card-feature {
  background: #000000;
}

.notification-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.notification-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.notification-icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.notification-copy {
  min-width: 0;
}

.notification-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: #ffffff;
}

.notification-message {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.92);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notification-close {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: rgba(35, 35, 35, 0.9);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
}

.notification-card-feature .notification-close {
  color: rgba(255, 255, 255, 0.96);
}

.notification-brand {
  width: 15px;
  height: 15px;
  object-fit: contain;
  position: absolute;
  right: 12px;
  bottom: 12px;
}

.notification-card-error .notification-icon {
  color: #ff243f;
}

.notification-card-warning .notification-icon {
  color: #ffd92f;
}

.notification-card-success .notification-icon {
  color: #00ea63;
}

.notification-card-information .notification-icon {
  color: #1729ff;
}

.notification-card-feature .notification-icon {
  color: #ffffff;
}

.notification-enter-active,
.notification-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateY(-22px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}

.notification-move {
  transition: transform 0.24s ease;
}

@media (max-width: 540px) {
  .notification-container {
    top: 10px;
    width: min(94vw, 431px);
  }

  .notification-title {
    font-size: 14px;
  }

  .notification-message {
    font-size: 11px;
  }

  .notification-action-btn {
    font-size: 12px;
  }
}
</style>
