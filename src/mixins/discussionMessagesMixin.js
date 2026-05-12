import { apiCall } from '../utils/api'
import {
  parseDiscussionMetadata,
  normalizeDiscussionDocumentPickerItem,
  buildDiscussionCodePreview,
  mapDiscussionMessage,
  buildDiscussionChatSummary,
  shouldCountDiscussionMessageAsUnread
} from '../utils/discussionModeCore'

const AI_PROGRESS_STAGE_META = {
  queued: {
    label: '接收请求',
    percent: 18
  },
  memory: {
    label: '读取记忆',
    percent: 58
  },
  generating: {
    label: '生成回复',
    percent: 78
  },
  finalizing: {
    label: '整理发送',
    percent: 92
  },
  error: {
    label: '处理失败',
    percent: 100
  }
}

const AI_PROGRESS_MODE_LABELS = {
  single: '单 AI 回复',
  mention: '@AI 回复',
  'dual-loop': '双 AI 轮询'
}

const MAX_ROOM_MESSAGES = 500

export default {
  data() {
    return {
      loadingMessages: false,
      sendingMessage: false,
      sendingAi: false,
      uploadingAttachment: false,
      attachmentKind: '',
      attachmentAccept: '',
      pendingAiByRoom: {}
    }
  },
  methods: {
    normalizeAiRequestId(rawId) {
      return String(rawId || '').trim()
    },
    getPendingAiMessages(roomId) {
      const roomKey = String(Number(roomId) || '').trim()
      if (!roomKey) return []
      return Array.isArray(this.pendingAiByRoom[roomKey]) ? this.pendingAiByRoom[roomKey] : []
    },
    isRoomAiBusy(roomId) {
      return this.getPendingAiMessages(roomId).length > 0
    },
    upsertPendingAiMessage(roomId, payload = {}) {
      const roomKey = String(Number(roomId) || '').trim()
      const requestId = this.normalizeAiRequestId(payload.requestId)
      if (!roomKey || !requestId) return
      const currentList = this.getPendingAiMessages(roomKey)
      const stage = String(payload.stage || 'queued').trim() || 'queued'
      const stageMeta = AI_PROGRESS_STAGE_META[stage] || AI_PROGRESS_STAGE_META.queued
      const mode = String(payload.mode || 'single').trim() || 'single'
      const nextMessage = {
        id: `pending-ai-${requestId}`,
        requestId,
        from: 'theirs',
        senderType: 'ai',
        senderUserId: null,
        senderName: String(payload.slotName || 'AI 助手').trim() || 'AI 助手',
        avatarUrl: String(payload.slotAvatarUrl || '').trim(),
        attachment: null,
        codePreview: null,
        documentPreview: null,
        text: String(payload.message || 'AI 正在思考…').trim() || 'AI 正在思考…',
        time: '思考中',
        rawTime: new Date().toISOString(),
        aiTargetLabel: String(payload.targetUsername || '').trim(),
        aiReplyTokenCount: 0,
        aiReplyCharLimit: 80,
        aiProgressStage: stage,
        aiProgressStageLabel: stageMeta.label,
        aiProgressPercent: stageMeta.percent,
        aiProgressMode: mode,
        aiProgressModeLabel: AI_PROGRESS_MODE_LABELS[mode] || AI_PROGRESS_MODE_LABELS.single,
        isPendingAi: true
      }
      const index = currentList.findIndex((item) => item.requestId === requestId)
      const nextList = [...currentList]
      if (index >= 0) {
        nextList.splice(index, 1, {
          ...nextList[index],
          ...nextMessage
        })
      } else {
        nextList.push(nextMessage)
      }
      this.pendingAiByRoom = {
        ...this.pendingAiByRoom,
        [roomKey]: nextList
      }
    },
    removePendingAiMessage(roomId, requestId = '') {
      const roomKey = String(Number(roomId) || '').trim()
      const normalizedRequestId = this.normalizeAiRequestId(requestId)
      if (!roomKey) return
      const currentList = this.getPendingAiMessages(roomKey)
      if (!currentList.length) return
      const nextList = normalizedRequestId
        ? currentList.filter((item) => item.requestId !== normalizedRequestId)
        : []
      this.pendingAiByRoom = {
        ...this.pendingAiByRoom,
        [roomKey]: nextList
      }
    },
    clearPendingAiForRawMessage(roomId, rawMessage = null) {
      const metadata = parseDiscussionMetadata(rawMessage?.metadata_json) || null
      const requestId = this.normalizeAiRequestId(metadata?.ai_request_id)
      if (!requestId && rawMessage?.sender_type !== 'ai') return
      this.removePendingAiMessage(roomId, requestId)
    },
    mapMessage(item) {
      return mapDiscussionMessage(item, {
        currentUserId: this.currentUserId,
        currentUsername: this.currentUsername,
        currentUserAvatarUrl: this.currentUserAvatarUrl
      })
    },
    normalizeMessageId(rawId) {
      if (rawId === null || rawId === undefined) return ''
      const text = String(rawId).trim()
      if (!text) return ''
      if (/^\d+$/.test(text)) return String(Number(text))
      return text
    },
    findMessageIndexById(chat, rawId) {
      if (!chat || !Array.isArray(chat.messages)) return -1
      const targetId = this.normalizeMessageId(rawId)
      if (!targetId) return -1
      return chat.messages.findIndex((item) => this.normalizeMessageId(item?.id) === targetId)
    },
    getRoomHistoryClearCutoff(roomId) {
      return Math.max(0, Number(this.getRoomSettings(roomId)?.clearedBeforeMessageId || 0) || 0)
    },
    isMessageClearedForChat(chat, rawId) {
      const cutoff = this.getRoomHistoryClearCutoff(chat?.id)
      const messageId = Number(this.normalizeMessageId(rawId) || 0) || 0
      return cutoff > 0 && messageId > 0 && messageId <= cutoff
    },
    appendMessageIfNeeded(chat, rawMessage) {
      if (!chat || !rawMessage) {
        return {
          action: 'ignored',
          message: null
        }
      }
      const nextMessage = this.mapMessage(rawMessage)
      const index = this.findMessageIndexById(chat, rawMessage.id)
      this.clearPendingAiForRawMessage(chat.id, rawMessage)
      if (index < 0 && this.isMessageClearedForChat(chat, rawMessage.id)) {
        return {
          action: 'ignored',
          message: null
        }
      }
      if (index >= 0) {
        chat.messages.splice(index, 1, nextMessage)
        return {
          action: 'updated',
          message: nextMessage
        }
      }
      chat.messages.push(nextMessage)
      this.trimChatMessages(chat)
      return {
        action: 'appended',
        message: nextMessage
      }
    },
    trimChatMessages(chat) {
      if (!Array.isArray(chat?.messages) || chat.messages.length <= MAX_ROOM_MESSAGES) return
      chat.messages.splice(0, chat.messages.length - MAX_ROOM_MESSAGES)
    },
    buildChatPreviewFromMessage(message) {
      if (!message) {
        return {
          preview: '暂无消息，发送第一条开始讨论',
          time: '--:--'
        }
      }

      const prefix = message.senderType === 'ai'
        ? 'AI: '
        : message.senderType === 'system'
          ? '系统: '
          : message.from === 'me'
            ? 'You: '
            : ''

      const content = message.isRevoked
        ? (message.text || '消息已撤回')
        : message.text
          || (message.attachment?.type === 'image'
            ? '[图片]'
            : message.attachment?.type === 'video'
              ? '[视频]'
              : message.attachment?.name
                ? `[附件] ${message.attachment.name}`
                : message.codePreview?.path
                  ? `代码预览：${message.codePreview.path}`
                  : message.documentPreview?.name
                    ? `文档预览：${message.documentPreview.name}`
                    : '')

      const preview = `${prefix}${content}`.slice(0, 120)
      return {
        preview: preview || '暂无消息，发送第一条开始讨论',
        time: message.time || '--:--'
      }
    },
    refreshChatSummaryFromMessages(chat) {
      if (!chat) return
      const latestMessage = Array.isArray(chat.messages) ? chat.messages[chat.messages.length - 1] || null : null
      const nextSummary = this.buildChatPreviewFromMessage(latestMessage)
      chat.preview = nextSummary.preview
      chat.time = nextSummary.time
    },
    applyRoomHistoryClear(roomId, clearedBeforeMessageId, options = {}) {
      const normalizedRoomId = Number(roomId || 0)
      if (!normalizedRoomId) return

      const nextCutoff = Math.max(0, Number(clearedBeforeMessageId || 0) || 0)
      if (options.updateSettings !== false) {
        const settings = this.getRoomSettings(normalizedRoomId)
        this.setRoomSettings(normalizedRoomId, {
          ...settings,
          clearedBeforeMessageId: nextCutoff
        })
      }

      const chat = this.chats.find((item) => Number(item?.id) === normalizedRoomId)
      if (!chat) return
      chat.messages = Array.isArray(chat.messages)
        ? chat.messages.filter((item) => Number(item?.id || 0) > nextCutoff)
        : []
      chat.messagesLoaded = true
      chat.unread = 0
      this.removePendingAiMessage(normalizedRoomId)
      this.refreshChatSummaryFromMessages(chat)
      if (Number(this.currentChatId) === normalizedRoomId) {
        this.$nextTick(() => this.scrollMessagesToBottom())
      }
    },
    canRevokeMessage(message = null) {
      if (!message || message.from !== 'me' || message.senderType !== 'user' || message.isPendingAi || message.isRevoked) {
        return false
      }
      const sentAt = new Date(message.rawTime || '').getTime()
      if (!sentAt || Number.isNaN(sentAt)) return false
      return Date.now() - sentAt <= 60 * 1000
    },
    async revokeMessage(message = null) {
      const roomId = Number(this.currentChat?.id || 0)
      const messageId = Number(message?.id || 0)
      if (!roomId || !messageId || !this.canRevokeMessage(message)) return

      this.errorText = ''
      try {
        const response = await apiCall(`/discussion/rooms/${roomId}/messages/${messageId}/revoke`, {
          method: 'POST'
        })
        const rawMessage = response?.message || null
        const result = this.appendMessageIfNeeded(this.currentChat, rawMessage)
        if (result.action === 'updated' || result.action === 'appended') {
          if (Number(rawMessage?.id || 0) === this.getLastMessageId(this.currentChat)) {
            this.updateChatSummary(this.currentChat, rawMessage)
          } else {
            this.refreshChatSummaryFromMessages(this.currentChat)
          }
        }
      } catch (error) {
        this.errorText = error.message || '撤回消息失败'
      }
    },
    getAttachmentAccept(kind) {
      if (kind === 'image') return 'image/*'
      if (kind === 'video') return 'video/*'
      return ''
    },
    openAttachmentPicker(kind) {
      if (!this.currentChat || this.uploadingAttachment) return
      if (!['image', 'video'].includes(kind)) return
      this.attachmentKind = kind
      this.attachmentAccept = this.getAttachmentAccept(kind)
      this.showAttachmentMenu = false
      this.showDocumentPicker = false
      this.$nextTick(() => {
        const input = this.$refs.attachmentInputRef
        if (!input) return
        input.value = ''
        input.click()
      })
    },
    async onAttachmentFileChange(event) {
      const file = event?.target?.files?.[0]
      if (!file || !this.currentChat || this.uploadingAttachment) return

      const kind = this.attachmentKind
      if (!['image', 'video'].includes(kind)) {
        this.errorText = '附件类型无效，请重试'
        event.target.value = ''
        return
      }

      this.uploadingAttachment = true
      this.errorText = ''

      try {
        const rawMessage = await this.uploadAttachment(file, kind)
        this.appendMessageIfNeeded(this.currentChat, rawMessage)
        this.currentChat.messagesLoaded = true
        this.updateChatSummary(this.currentChat, rawMessage)
        this.$nextTick(() => this.scrollMessagesToBottom())
      } catch (error) {
        this.errorText = error.message || '附件上传失败'
      } finally {
        this.uploadingAttachment = false
        this.attachmentKind = ''
        if (event?.target) event.target.value = ''
      }
    },
    async uploadAttachment(file, kind) {
      const roomId = this.currentChat?.id
      if (!roomId) throw new Error('当前没有可用房间')

      const formData = new FormData()
      formData.append('file', file)
      const data = await apiCall(
        `/discussion/rooms/${roomId}/attachments/${kind}`,
        {
          method: 'POST',
          body: formData
        }
      )
      if (!data?.message) {
        throw new Error('上传成功但消息写入失败')
      }
      return data.message
    },
    updateChatSummary(chat, rawMessage) {
      if (!chat || !rawMessage) return
      const summary = buildDiscussionChatSummary(rawMessage, {
        currentUserId: this.currentUserId
      })
      chat.preview = summary.preview
      chat.time = summary.time
    },
    async fetchMessages(roomId) {
      this.loadingMessages = true
      this.errorText = ''

      try {
        const data = await apiCall(`/discussion/rooms/${roomId}/messages?limit=100`)
        const chat = this.chats.find((item) => item.id === roomId)
        if (!chat) return

        const rawMessages = Array.isArray(data?.messages) ? data.messages : []
        chat.messages = rawMessages.map((item) => this.mapMessage(item))
        this.trimChatMessages(chat)
        chat.messagesLoaded = true
        if (Number(roomId) === Number(this.currentChatId)) {
          chat.unread = 0
        }

        if (rawMessages.length) {
          this.updateChatSummary(chat, rawMessages[rawMessages.length - 1])
        }
      } catch (error) {
        this.errorText = error.message || '加载消息失败'
      } finally {
        this.loadingMessages = false
        this.$nextTick(() => this.scrollMessagesToBottom())
      }
    },
    async sendMessage() {
      const value = this.draft.trim()
      if (!value || !this.currentChat || this.sendingMessage) return
      if (this.currentRoomAiBusy && this.isDraftMentioningAi) {
        this.errorText = '当前房间已有 AI 正在回复，请等待本轮完成后再 @AI'
        return
      }

      this.sendingMessage = true
      this.errorText = ''

      try {
        if (this.isDraftMentioningAi) {
          const saved = await this.flushRoomSettingsSave(this.currentChat.id)
          if (saved === false) {
            throw new Error(this.errorText || 'AI 设置保存失败，请稍后重试')
          }
        }

        const response = await apiCall(`/discussion/rooms/${this.currentChat.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: value })
        })

        const rawMessage = response.message
        this.appendMessageIfNeeded(this.currentChat, rawMessage)
        this.currentChat.messagesLoaded = true
        this.updateChatSummary(this.currentChat, rawMessage)
        this.draft = ''
        this.$nextTick(() => this.scrollMessagesToBottom())
      } catch (error) {
        this.errorText = error.message || '发送消息失败'
      } finally {
        this.sendingMessage = false
        this.$nextTick(() => this.focusDraftInput())
      }
    },
    async sendAiMessage() {
      if (!this.currentChat || this.sendingAi || this.isRoomAiBusy(this.currentChat.id)) return

      const prompt = this.draft.trim() || '请结合当前讨论内容，给出下一步可执行建议。'
      this.sendingAi = true
      this.errorText = ''

      try {
        const saved = await this.flushRoomSettingsSave(this.currentChat.id)
        if (saved === false) {
          throw new Error(this.errorText || 'AI 设置保存失败，请稍后重试')
        }

        const response = await apiCall(`/discussion/rooms/${this.currentChat.id}/ai-message`, {
          method: 'POST',
          body: JSON.stringify({ prompt })
        })

        const rawMessage = response.message
        this.appendMessageIfNeeded(this.currentChat, rawMessage)
        this.currentChat.messagesLoaded = true
        this.updateChatSummary(this.currentChat, rawMessage)
        this.$nextTick(() => this.scrollMessagesToBottom())
      } catch (error) {
        this.errorText = error.message || 'AI 回复失败'
      } finally {
        this.sendingAi = false
      }
    },
    async openDocumentPreviewPicker() {
      if (!this.currentChat || this.uploadingAttachment) return

      this.showAttachmentMenu = false
      this.showDocumentPicker = true
      this.documentPickerLoading = true
      this.documentPickerKeyword = ''
      this.errorText = ''

      try {
        const data = await apiCall(`/discussion/rooms/${this.currentChat.id}/documents`)
        this.documentPickerDocuments = Array.isArray(data?.documents)
          ? data.documents.map((doc) => normalizeDiscussionDocumentPickerItem(doc)).filter(Boolean)
          : []
      } catch (error) {
        this.documentPickerDocuments = []
        this.errorText = error.message || '文档加载失败'
      } finally {
        this.documentPickerLoading = false
      }
    },
    async sendCodePreviewFromFile(file) {
      if (!file || !this.currentChat || this.uploadingAttachment) return

      const codePreview = buildDiscussionCodePreview(file)
      if (!codePreview.path || !codePreview.snippet) {
        this.errorText = '该文件内容为空，无法发送预览'
        return
      }

      this.uploadingAttachment = true
      this.errorText = ''
      try {
        const response = await apiCall(`/discussion/rooms/${this.currentChat.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: `代码预览：${codePreview.path}`,
            metadata: {
              code_preview: {
                ...codePreview,
                game_id: this.effectiveCodeGameId || this.currentChat?.gameId || ''
              }
            }
          })
        })

        const rawMessage = response.message
        this.appendMessageIfNeeded(this.currentChat, rawMessage)
        this.currentChat.messagesLoaded = true
        this.updateChatSummary(this.currentChat, rawMessage)
        this.closeCodePicker()
        this.$nextTick(() => this.scrollMessagesToBottom())
      } catch (error) {
        this.errorText = error.message || '代码预览发送失败'
      } finally {
        this.uploadingAttachment = false
      }
    },
    async sendDocumentPreview(document) {
      if (!document || !this.currentChat || this.uploadingAttachment) return
      if (!document.id || !document.name) {
        this.errorText = '文档数据无效，无法发送预览'
        return
      }

      this.uploadingAttachment = true
      this.errorText = ''
      try {
        const response = await apiCall(`/discussion/rooms/${this.currentChat.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: `文档预览：${document.name}`,
            metadata: {
              document_preview: {
                document_id: document.id,
                name: document.name,
                preview_text: document.previewText || '',
                page_count: document.pageCount,
                mime_type: document.mimeType || ''
              }
            }
          })
        })

        const rawMessage = response.message
        this.appendMessageIfNeeded(this.currentChat, rawMessage)
        this.currentChat.messagesLoaded = true
        this.updateChatSummary(this.currentChat, rawMessage)
        this.closeDocumentPicker()
        this.$nextTick(() => this.scrollMessagesToBottom())
      } catch (error) {
        this.errorText = error.message || '文档预览发送失败'
      } finally {
        this.uploadingAttachment = false
      }
    },
    getLastMessageId(chat) {
      if (!chat || !Array.isArray(chat.messages) || !chat.messages.length) return 0
      return chat.messages.reduce((maxId, message) => {
        const nextId = Number(message?.id || 0)
        return nextId > maxId ? nextId : maxId
      }, 0)
    },
    markChatAsRead(roomId) {
      const chat = this.chats.find((item) => Number(item.id) === Number(roomId))
      if (!chat) return
      chat.unread = 0
    },
    shouldCountAsUnread(rawMessage) {
      return shouldCountDiscussionMessageAsUnread(rawMessage, this.currentUserId)
    }
  }
}
