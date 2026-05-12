import { io } from 'socket.io-client'
import { API_BASE_URL, apiCall } from '../utils/api'
import { normalizeChatMoreSettings } from '../utils/discussionChatMore'

const MESSAGE_POLL_INTERVAL_MS = 15000

export default {
  data() {
    return {
      socket: null,
      subscribedRoomIds: {},
      messagePollTimer: null,
      messagePollPending: false,
      messageVisibilityHandler: null
    }
  },
  methods: {
    startMessagePolling() {
      this.ensureMessageVisibilityHandler()
      if (!this.shouldUseMessagePolling()) return
      if (this.messagePollTimer) return
      this.messagePollTimer = window.setInterval(() => {
        this.pollLatestMessages()
      }, MESSAGE_POLL_INTERVAL_MS)
    },
    stopMessagePolling() {
      if (!this.messagePollTimer) return
      window.clearInterval(this.messagePollTimer)
      this.messagePollTimer = null
    },
    ensureMessageVisibilityHandler() {
      if (this.messageVisibilityHandler) return
      this.messageVisibilityHandler = () => {
        this.refreshMessagePolling()
        if (!document.hidden) {
          this.pollLatestMessages({ force: true })
        }
      }
      document.addEventListener('visibilitychange', this.messageVisibilityHandler)
    },
    removeMessageVisibilityHandler() {
      if (!this.messageVisibilityHandler) return
      document.removeEventListener('visibilitychange', this.messageVisibilityHandler)
      this.messageVisibilityHandler = null
    },
    refreshMessagePolling() {
      this.stopMessagePolling()
      this.startMessagePolling()
    },
    getActivePollingRoom() {
      const activeRoomId = Number(this.currentChatId)
      if (!activeRoomId) return null
      return this.chats.find((item) => Number(item?.id) === activeRoomId) || null
    },
    isActiveRoomRealtimeHealthy() {
      const activeRoom = this.getActivePollingRoom()
      if (!activeRoom) return false
      return Boolean(this.socket?.connected && this.isSocketRoomSubscribed(activeRoom.id))
    },
    shouldUseMessagePolling() {
      if (document.hidden) return false
      return Boolean(this.getActivePollingRoom()) && !this.isActiveRoomRealtimeHealthy()
    },
    isSocketRoomSubscribed(roomId) {
      const key = String(Number(roomId) || '')
      if (!key) return false
      return this.subscribedRoomIds[key] === true
    },
    async pollRoomLatestMessages(chat, options = {}) {
      const roomId = Number(chat?.id)
      if (!roomId) return

      const realtimeHealthy = this.socket?.connected && this.isSocketRoomSubscribed(roomId)
      if (realtimeHealthy && !options.force) return

      const afterId = this.getLastMessageId(chat)
      const query = new URLSearchParams()
      query.set('limit', '100')
      if (afterId > 0) query.set('afterId', String(afterId))

      const data = await apiCall(`/discussion/rooms/${roomId}/messages?${query.toString()}`)
      const rawMessages = Array.isArray(data?.messages) ? data.messages : []
      if (!rawMessages.length) {
        if (!chat.messagesLoaded) chat.messagesLoaded = true
        return
      }

      let appendedCount = 0
      let updatedLatest = false
      let unreadAdded = 0
      rawMessages.forEach((rawItem) => {
        const result = this.appendMessageIfNeeded(chat, rawItem)
        if (result.action === 'ignored') return
        if (result.action === 'appended') {
          appendedCount += 1
        }
        if (Number(rawItem?.id || 0) === this.getLastMessageId(chat)) {
          updatedLatest = true
        }
        if (result.action === 'appended' && Number(this.currentChatId) !== roomId && this.shouldCountAsUnread(rawItem)) {
          unreadAdded += 1
        }
      })
      if (!appendedCount && !updatedLatest) return

      chat.messagesLoaded = true
      const latestRawMessage = rawMessages[rawMessages.length - 1]
      if (Number(latestRawMessage?.id || 0) === this.getLastMessageId(chat)) {
        this.updateChatSummary(chat, latestRawMessage)
      } else {
        this.refreshChatSummaryFromMessages(chat)
      }
      if (Number(this.currentChatId) === roomId) {
        chat.unread = 0
        this.$nextTick(() => this.scrollMessagesToBottom())
      } else if (unreadAdded > 0) {
        chat.unread = Number(chat.unread || 0) + unreadAdded
      }
    },
    async pollLatestMessages(options = {}) {
      if (this.messagePollPending) return
      if (document.hidden) return
      const activeRoom = this.getActivePollingRoom()
      if (!activeRoom) return

      if (this.isActiveRoomRealtimeHealthy() && !options.force) {
        this.stopMessagePolling()
        return
      }

      this.messagePollPending = true
      try {
        await this.pollRoomLatestMessages(activeRoom, options)
      } catch {
        // 静默失败，下一轮继续补拉。
      } finally {
        this.messagePollPending = false
      }
    },
    getSocketBaseUrl() {
      const customSocketBase = import.meta.env.VITE_WS_BASE_URL
      if (customSocketBase) return customSocketBase
      if (/^https?:\/\//.test(API_BASE_URL)) return API_BASE_URL.replace(/\/api\/?$/, '')
      return window.location.origin
    },
    getAuthToken() {
      return localStorage.getItem('token') || localStorage.getItem('authToken') || ''
    },
    setupSocket() {
      if (this.socket) return
      const token = this.getAuthToken()
      if (!token) return

      this.socket = io(this.getSocketBaseUrl(), {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        auth: {
          token: `Bearer ${token}`
        }
      })

      this.socket.on('connect', () => {
        this.subscribedRoomIds = {}
        this.syncSocketSubscriptions()
        this.pollLatestMessages({ force: true })
        this.stopMessagePolling()
      })

      this.socket.on('discussion:message', (payload) => {
        this.handleSocketMessage(payload)
      })

      this.socket.on('discussion:documents', (payload) => {
        this.handleSocketDocuments(payload)
      })

      this.socket.on('discussion:tasks', (payload) => {
        this.handleSocketTasks(payload)
      })

      this.socket.on('discussion:room-settings', (payload) => {
        this.handleSocketRoomSettings(payload)
      })

      this.socket.on('discussion:room-history-cleared', (payload) => {
        this.handleSocketRoomHistoryCleared(payload)
      })

      this.socket.on('discussion:room-memory', (payload) => {
        this.handleSocketRoomMemory(payload)
      })

      this.socket.on('discussion:ai-progress', (payload) => {
        this.handleSocketAiProgress(payload)
      })

      this.socket.on('discussion:room-removed', (payload) => {
        this.handleSocketRoomRemoved(payload)
      })

      this.socket.on('disconnect', () => {
        this.subscribedRoomIds = {}
        this.startMessagePolling()
      })

      this.socket.on('connect_error', () => {
        this.subscribedRoomIds = {}
        this.startMessagePolling()
      })
    },
    teardownSocket() {
      if (!this.socket) return
      Object.keys(this.subscribedRoomIds).forEach((roomId) => {
        this.socket.emit('discussion:leave', { roomId: Number(roomId) })
      })
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
      this.subscribedRoomIds = {}
      this.removeMessageVisibilityHandler()
    },
    joinSocketRoom(roomId) {
      const parsedRoomId = Number(roomId)
      if (!this.socket || !this.socket.connected || !parsedRoomId) {
        return Promise.resolve(false)
      }
      if (this.isSocketRoomSubscribed(parsedRoomId)) {
        return Promise.resolve(true)
      }

      return new Promise((resolve) => {
        this.socket.emit('discussion:join', { roomId: parsedRoomId }, (response) => {
          if (!response?.ok) {
            resolve(false)
            return
          }
          this.subscribedRoomIds = {
            ...this.subscribedRoomIds,
            [String(parsedRoomId)]: true
          }
          resolve(true)
        })
      })
    },
    leaveSocketRoom(roomId) {
      const parsedRoomId = Number(roomId)
      if (!this.socket || !this.socket.connected || !parsedRoomId) return
      if (!this.isSocketRoomSubscribed(parsedRoomId)) return

      this.socket.emit('discussion:leave', { roomId: parsedRoomId })
      const nextMap = { ...this.subscribedRoomIds }
      delete nextMap[String(parsedRoomId)]
      this.subscribedRoomIds = nextMap
    },
    async syncSocketSubscriptions() {
      if (!this.socket || !this.socket.connected) return

      const desiredRoomIds = [...new Set(
        this.chats
          .map((item) => Number(item?.id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )]

      const subscribedRoomIds = Object.keys(this.subscribedRoomIds)
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)

      subscribedRoomIds
        .filter((id) => !desiredRoomIds.includes(id))
        .forEach((id) => this.leaveSocketRoom(id))

      await Promise.all(desiredRoomIds.map((id) => this.joinSocketRoom(id)))
      this.refreshMessagePolling()
    },
    handleSocketMessage(payload) {
      const roomId = Number(payload?.roomId)
      const rawMessage = payload?.message
      if (!roomId || !rawMessage) return

      const chat = this.chats.find((item) => item.id === roomId)
      if (!chat) return
      const result = this.appendMessageIfNeeded(chat, rawMessage)
      if (result.action === 'ignored') return
      chat.messagesLoaded = true
      if (Number(rawMessage?.id || 0) === this.getLastMessageId(chat)) {
        this.updateChatSummary(chat, rawMessage)
      } else if (result.action === 'updated') {
        this.refreshChatSummaryFromMessages(chat)
      }

      if (Number(this.currentChatId) === roomId) {
        chat.unread = 0
        this.$nextTick(() => this.scrollMessagesToBottom())
      } else if (result.action === 'appended' && this.shouldCountAsUnread(rawMessage)) {
        chat.unread = Number(chat.unread || 0) + 1
      }
    },
    handleSocketAiProgress(payload) {
      const roomId = Number(payload?.roomId)
      const requestId = this.normalizeAiRequestId(payload?.requestId)
      if (!roomId || !requestId) return

      const stage = String(payload?.stage || '').trim()
      if (stage === 'error') {
        this.removePendingAiMessage(roomId, requestId)
        if (Number(this.currentChatId) === roomId) {
          this.errorText = payload?.message || 'AI 回复失败'
        }
        return
      }

      this.upsertPendingAiMessage(roomId, payload)
      if (Number(this.currentChatId) === roomId) {
        this.$nextTick(() => this.scrollMessagesToBottom())
      }
    },
    dispatchRoomPanelEvent(name, detail = {}) {
      if (typeof window === 'undefined') return
      window.dispatchEvent(new CustomEvent(name, { detail }))
    },
    handleSocketDocuments(payload) {
      const roomId = Number(payload?.roomId)
      if (!roomId) return
      this.dispatchRoomPanelEvent('discussion-documents-sync', {
        roomId,
        action: String(payload?.action || '').trim(),
        document: payload?.document || null,
        documentId: payload?.documentId ?? null,
        selectedDocumentId: payload?.selectedDocumentId ?? null,
        updatedByUserId: Number(payload?.updatedByUserId || 0) || null
      })
    },
    handleSocketTasks(payload) {
      const roomId = Number(payload?.roomId)
      if (!roomId) return
      this.dispatchRoomPanelEvent('discussion-tasks-sync', {
        roomId,
        action: String(payload?.action || '').trim(),
        task: payload?.task || null,
        taskId: payload?.taskId ?? null,
        updatedByUserId: Number(payload?.updatedByUserId || 0) || null
      })
    },
    handleSocketRoomSettings(payload) {
      const roomId = Number(payload?.roomId)
      if (!roomId) return
      const previousSettings = this.getRoomSettings(roomId)
      const previousCutoff = Math.max(0, Number(previousSettings?.clearedBeforeMessageId || 0) || 0)
      const hasPendingEdits = this.hasPendingRoomSettingsEdits(roomId)
      const nextSettings = this.mergeIncomingRoomSettings(roomId, normalizeChatMoreSettings(payload?.settings || {}))
      const previousGameId = String(previousSettings?.sourceGameId || '').trim()
      const nextGameId = String(nextSettings?.sourceGameId || '').trim()
      this.setRoomSettings(roomId, nextSettings)
      if (!hasPendingEdits) {
        this.markRoomSettingsSynced(roomId, this.getRoomSettingsLocalRevision(roomId))
        this.clearRoomSettingsDirtyFields(roomId)
      }
      this.applyRoomSettingsToLoadedChats()
      if (nextSettings.clearedBeforeMessageId > previousCutoff) {
        this.applyRoomHistoryClear(roomId, nextSettings.clearedBeforeMessageId, { updateSettings: false })
      }

      if (Number(this.currentChatId) === roomId && previousGameId !== nextGameId) {
        this.currentCodePath = ''
        this.syncCurrentRoomCode({ force: true })
      }
    },
    handleSocketRoomHistoryCleared(payload) {
      const roomId = Number(payload?.roomId)
      const clearedBeforeMessageId = Number(payload?.clearedBeforeMessageId || 0) || 0
      if (!roomId) return
      this.applyRoomHistoryClear(roomId, clearedBeforeMessageId)
    },
    handleSocketRoomMemory(payload) {
      const roomId = Number(payload?.roomId)
      if (!roomId) return
      this.setRoomMemoryPayload(roomId, payload || {})
    },
    async handleSocketRoomRemoved(payload) {
      const roomId = Number(payload?.roomId)
      if (!roomId) return
      const roomExists = this.chats.some((chat) => Number(chat?.id) === roomId)
      if (!roomExists) return
      await this.initializeDiscussion()
    }
  }
}
