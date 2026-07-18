<template>
  <div class="page">
    <section class="left-side">
      <div class="chat-layout">
        <DiscussionChatSidebar
          :search-keyword="searchKeyword"
          :filtered-chats="filteredChats"
          :current-chat-id="currentChatId"
          :loading-rooms="loadingRooms"
          :chats-length="chats.length"
          @back="goBack"
          @update:search-keyword="searchKeyword = $event"
          @select-chat="selectChat"
          @room-avatar-error="handleRoomAvatarError"
        />

        <main v-if="currentChat" class="chat-panel">
          <header class="chat-header">
              <div class="chat-user">
                <div class="avatar small" :style="{ background: currentChat.avatarColor }">
                <img
                  v-if="currentChat.avatarUrl"
                  :src="currentChat.avatarUrl"
                  :alt="currentChat.name"
                  class="avatar-image"
                  @error="handleRoomAvatarError(currentChat)"
                />
                <span v-else>{{ currentChat.avatar }}</span>
                </div>
                <div>
                  <div class="chat-user-name-row">
                    <span class="chat-user-name">{{ currentChat.name }}</span>
                    <span v-if="currentChat.displayRolePreset" class="chat-user-role">{{ currentChat.displayRolePreset }}</span>
                  </div>
                  <div class="chat-user-status-row">
                    <span class="chat-user-status">{{ currentChat.baseStatus }}</span>
                    <span
                      class="chat-user-status-badge"
                      :class="`is-${currentChatHeaderStatusMeta.tone}`"
                    >
                      {{ currentChatHeaderStatusMeta.headerLabel }}
                    </span>
                  </div>
                </div>
              </div>

            <div v-if="currentChatSupportsMorePanel" class="chat-header-actions">
              <button
                type="button"
                class="icon-btn chat-more-btn"
                :class="{ active: showChatMorePanel }"
                aria-label="更多"
                @click="toggleChatMorePanel"
              >
                ⋮
              </button>
            </div>
          </header>

          <section
            v-if="!showChatMorePanel || !currentChatSupportsMorePanel"
            ref="messagesPaneRef"
            class="chat-messages"
          >
            <div v-if="loadingMessages" class="chat-empty">正在加载消息...</div>
            <div v-else-if="!currentChat.messages.length" class="chat-empty">暂无消息，发送第一条开始讨论</div>

            <template v-for="(message, index) in currentChatRenderedMessages" :key="message.id">
              <div
                v-if="shouldShowMessageTimeDivider(currentChatRenderedMessages, index)"
                class="message-time-divider"
              >
                {{ formatMessageTimeDivider(message.rawTime) }}
              </div>

              <div
                class="message-row"
                :class="message.from === 'me' ? 'mine' : 'theirs'"
              >
                <div class="message-thread" :class="message.from === 'me' ? 'mine' : 'theirs'">
                  <span class="message-sender-name" :class="message.from === 'me' ? 'mine' : 'theirs'">
                    <template v-if="message.from === 'me'">
                      <span class="message-sender-text">{{ resolveDisplayedMessageSenderName(message) }}</span>
                    </template>
                    <template v-else>
                      <span class="message-sender-text">{{ resolveDisplayedMessageSenderName(message) }}</span>
                    </template>
                  </span>

                  <div class="message-main">
                    <AvatarFriendAction
                      v-if="message.from !== 'me'"
                      :user-id="message.senderUserId"
                      :username="message.senderName"
                      placement="left"
                    >
                      <img
                        class="message-avatar"
                        :src="message.avatarUrl"
                        :alt="message.senderName"
                        @error="handleAvatarError"
                      />
                    </AvatarFriendAction>
                    <div
                      class="message-bubble"
                      :class="{
                        'is-pending-ai': message.isPendingAi,
                        'is-revoked': message.isRevoked,
                        'code-preview-standalone': message.codePreview && !message.text && !message.attachment && !message.documentPreview,
                        'document-preview-standalone': message.documentPreview && !message.text && !message.attachment && !message.codePreview,
                        'image-attachment-standalone': message.attachment?.type === 'image' && !message.text && !message.codePreview
                      }"
                      @contextmenu.stop.prevent="openMessageContextMenu($event, message)"
                    >
                      <div v-if="message.aiTargetLabel || message.aiReplyTokenCount || message.isPendingAi" class="message-ai-meta">
                        <span v-if="message.isPendingAi && message.aiProgressModeLabel" class="message-ai-meta-pill subtle">
                          {{ message.aiProgressModeLabel }}
                        </span>
                        <span v-if="message.isPendingAi && message.aiProgressStageLabel" class="message-ai-meta-pill thinking">
                          {{ message.aiProgressStageLabel }}
                        </span>
                        <span v-if="message.aiTargetLabel" class="message-ai-meta-pill">
                          回复给 {{ message.aiTargetLabel }}
                        </span>
                        <span v-if="message.aiReplyTokenCount" class="message-ai-meta-pill subtle">
                          {{ message.aiReplyTokenCount }} tokens
                        </span>
                      </div>
                      <div v-if="message.isPendingAi" class="message-ai-progress-card">
                        <div class="message-ai-progress-head">
                          <strong>{{ message.senderName || 'AI 助手' }}</strong>
                          <span>{{ message.aiProgressPercent || 0 }}%</span>
                        </div>
                        <div v-if="message.aiTargetLabel" class="message-ai-progress-target">
                          正在回复给 {{ message.aiTargetLabel }}
                        </div>
                        <div class="message-ai-progress-desc">{{ message.text }}</div>
                        <div class="message-ai-progress-track" aria-hidden="true">
                          <span :style="{ width: `${message.aiProgressPercent || 0}%` }"></span>
                        </div>
                      </div>
                      <div v-else-if="message.text" class="message-text">{{ message.text }}</div>
                      <div v-if="message.attachment" class="message-attachment">
                        <img
                          v-if="message.attachment.type === 'image'"
                          :src="message.attachment.url"
                          :alt="message.attachment.name || '图片附件'"
                          class="message-attachment-image"
                          @load="scrollMessagesToBottom"
                        />
                        <video
                          v-else-if="message.attachment.type === 'video'"
                          class="message-attachment-video"
                          controls
                          preload="metadata"
                          @loadedmetadata="scrollMessagesToBottom"
                        >
                          <source :src="message.attachment.url" />
                        </video>
                        <a
                          v-else
                          class="message-attachment-file"
                          :href="message.attachment.url"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <i class="fa fa-code"></i>
                          <span>{{ message.attachment.name || '代码文件' }}</span>
                        </a>
                      </div>
                      <div
                        v-if="message.codePreview"
                        class="message-code-preview message-code-preview-clickable"
                        role="button"
                        tabindex="0"
                        title="点击在右侧代码区查看完整源码"
                        @click="openCodePreviewInRightPanel(message.codePreview)"
                        @keyup.enter.prevent="openCodePreviewInRightPanel(message.codePreview)"
                        @keyup.space.prevent="openCodePreviewInRightPanel(message.codePreview)"
                      >
                        <div class="message-code-preview-head">
                          <img
                            class="code-type-icon"
                            :src="getCodeTypeIconByPath(message.codePreview.path)"
                            alt="code type"
                          />
                          <span class="message-code-preview-path" :title="message.codePreview.path">
                            {{ message.codePreview.path }}
                          </span>
                        </div>
                        <pre class="message-code-preview-snippet">
                          <code class="hljs" v-html="getCodePreviewSnippetHtml(message.codePreview)"></code>
                        </pre>
                      </div>
                      <div
                        v-if="message.documentPreview"
                        class="message-document-preview message-document-preview-clickable"
                        role="button"
                        tabindex="0"
                        title="点击在右侧文档区查看文档"
                        @click="openDocumentPreviewInRightPanel(message.documentPreview)"
                        @keyup.enter.prevent="openDocumentPreviewInRightPanel(message.documentPreview)"
                        @keyup.space.prevent="openDocumentPreviewInRightPanel(message.documentPreview)"
                      >
                        <div class="message-document-preview-head">
                          <i class="fa fa-file-text-o message-document-preview-icon" aria-hidden="true"></i>
                          <span class="message-document-preview-name" :title="message.documentPreview.name">
                            {{ message.documentPreview.name }}
                          </span>
                          <span v-if="message.documentPreview.pageCount" class="message-document-preview-pages">
                            {{ message.documentPreview.pageCount }} 页
                          </span>
                        </div>
                        <div class="message-document-preview-body">
                          {{ message.documentPreview.previewText || '点击右侧文档区查看当前文档内容。' }}
                        </div>
                      </div>
                    </div>
                    <img
                      v-if="message.from === 'me'"
                      class="message-avatar"
                      :src="message.avatarUrl"
                      :alt="message.senderName"
                      @error="handleAvatarError"
                    />
                  </div>
                </div>
              </div>
            </template>

            <div v-if="errorText" class="chat-error">{{ errorText }}</div>
            <div ref="messagesBottomRef" class="messages-bottom-anchor" aria-hidden="true"></div>
          </section>

          <footer v-if="!showChatMorePanel || !currentChatSupportsMorePanel" class="chat-input-bar">
            <div class="chat-input-main">
              <div class="attach-entry" @click.stop>
                <button
                  class="icon-btn light attach-plus-btn"
                  :disabled="uploadingAttachment || !currentChat"
                  @click.stop="toggleAttachmentMenu"
                >
                  <i class="fa fa-plus"></i>
                </button>
              </div>
              <input
                ref="attachmentInputRef"
                type="file"
                class="attachment-input-hidden"
                :accept="attachmentAccept"
                @change="onAttachmentFileChange"
              />
              <input
                ref="draftInputRef"
                v-model="draft"
                type="text"
                :placeholder="chatInputPlaceholder"
                :disabled="sendingMessage || uploadingAttachment"
                @keyup.enter="sendMessage"
              />
              <button class="send-btn" :disabled="sendingMessage || uploadingAttachment || (isDraftMentioningAi && currentRoomAiBusy)" @click="sendMessage" aria-label="发送">
                <i class="fa fa-paper-plane" aria-hidden="true"></i>
              </button>
            </div>

            <transition name="attach-tray">
              <div v-if="showAttachmentMenu" class="attach-menu" @click.stop>
                <button
                  type="button"
                  class="attach-option"
                  title="上传图片"
                  @click="openAttachmentPicker('image')"
                >
                  <i class="fa fa-image"></i>
                </button>
                <button
                  type="button"
                  class="attach-option"
                  title="上传视频"
                  @click="openAttachmentPicker('video')"
                >
                  <i class="fa fa-video-camera"></i>
                </button>
                <button
                  type="button"
                  class="attach-option"
                  title="发送代码预览"
                  @click="openCodePreviewPicker"
                >
                  <i class="fa fa-code"></i>
                </button>
                <button
                  type="button"
                  class="attach-option"
                  title="发送文档预览"
                  @click="openDocumentPreviewPicker"
                >
                  <i class="fa fa-book"></i>
                </button>
              </div>
            </transition>
          </footer>

          <DiscussionChatMorePanel
            v-if="showChatMorePanel && currentChatSupportsMorePanel"
            :menu-items="currentChatMoreMenuItems"
            :active-section="activeChatMoreSection"
            :settings="currentChatMoreSettings"
            :enabled-ai-slots="enabledAiSlots"
            :dual-ai-loop-ready="dualAiLoopReady"
            :room-ai-busy="currentRoomAiBusy"
            :effective-code-game-title="effectiveCodeGameTitle"
            :effective-code-game-id="effectiveCodeGameId"
            :current-chat="currentChat"
            :room-detail="currentRoomDetail"
            :room-avatar-uploading="currentRoomAvatarUploading"
            :invite-friends="currentGroupInviteCandidates"
            :invite-friends-loading="inviteFriendsLoading"
            :invite-friends-error="inviteFriendsError"
            :room-invite-link="currentRoomInviteLink"
            :room-invite-link-generating="currentRoomInviteGenerating"
            :room-invite-expire-minutes="currentRoomInviteExpireMinutes"
            :can-manage-current-group="canManageCurrentGroup"
            :can-invite-current-group-members="canInviteCurrentGroupMembers"
            :group-invite-permission-options="chatMoreGroupInvitePermissionOptions"
            :room-friend-invite-loading-by-user="roomFriendInviteLoadingByUser"
            :builtin-models="chatMoreBuiltinModels"
            :collab-status-options="chatMoreCollabStatusOptions"
            :room-summary="currentRoomSummary"
            :room-memory-items="currentRoomMemoryItems"
            :room-memory-loading="roomMemoryLoading"
            :room-memory-error="roomMemoryError"
            :ai-slot-save-states="currentAiSlotSaveStates"
            :game-library-loading="gameLibraryLoading"
            :game-library-error="gameLibraryError"
            :game-library-games="gameLibraryGames"
            :show-clear-history-confirm="showClearHistoryConfirm"
            :clear-history-warning-text="getClearHistoryWarningText()"
            :show-delete-friend-confirm="showDeleteFriendConfirm"
            :delete-friend-warning-text="getDeleteFriendWarningText()"
            @item-click="handleChatMoreItemClick"
            @open-clear-history-confirm="openClearHistoryConfirm"
            @close-clear-history-confirm="closeClearHistoryConfirm"
            @confirm-clear-history="handleClearHistoryClick"
            @open-delete-friend-confirm="openDeleteFriendConfirm"
            @close-delete-friend-confirm="closeDeleteFriendConfirm"
            @confirm-delete-friend="handleDeleteFriendClick"
            @select-room-code-game="selectRoomCodeGame"
            @reset-room-code-game="resetRoomCodeGame"
            @update-setting="updateCurrentRoomSetting"
            @reset-nickname="resetCurrentRoomNickname"
            @update-ai-slot-field="updateAiSlotField"
            @avatar-file-change="onAiAvatarFileChange"
            @room-avatar-file-change="onRoomAvatarFileChange"
            @reset-room-avatar="resetCurrentRoomAvatar"
            @update-room-invite-expire-minutes="setRoomInviteExpireMinutes(currentChat?.id, $event)"
            @generate-room-invite-link="generateCurrentRoomInviteLink"
            @copy-room-invite-link="copyCurrentRoomInviteLink"
            @invite-room-friend="inviteFriendIntoCurrentRoom"
            @refresh-room-memory="refreshCurrentRoomMemory"
            @open-memory-file="openMemoryFileInCodePanel"
            @toggle-dual-ai-loop="toggleDualAiLoop"
            @generate-dual-ai-loop-round="generateDualAiLoopRound"
            @save-ai-slot="handleSaveAiSlot"
          />

          <div
            v-if="messageContextMenu.visible"
            class="message-context-menu"
            :style="messageContextMenuStyle"
            role="menu"
            @click.stop
          >
            <button
              type="button"
              class="message-context-menu-item"
              :disabled="!messageContextMenu.canRevoke"
              @click="handleRevokeContextMessage"
            >
              {{ messageContextMenu.label }}
            </button>
          </div>

          <DiscussionResourcePicker
            :visible="showCodePicker"
            title="选择当前游戏源码文件"
            :search-keyword="codePickerKeyword"
            placeholder="搜索文件路径..."
            :loading="codePickerLoading"
            loading-text="源码加载中..."
            empty-text="没有可选源码文件"
            :items="filteredCodePickerFiles"
            :disabled="uploadingAttachment"
            item-key-field="path"
            item-primary-field="path"
            item-secondary-field="language"
            @close="closeCodePicker"
            @update:search-keyword="codePickerKeyword = $event.trim()"
            @select="sendCodePreviewFromFile"
          />

          <DiscussionResourcePicker
            :visible="showDocumentPicker"
            title="选择当前房间文档"
            :search-keyword="documentPickerKeyword"
            placeholder="搜索文档名称..."
            :loading="documentPickerLoading"
            loading-text="文档加载中..."
            empty-text="没有可选文档"
            :items="documentPickerPickerItems"
            :disabled="uploadingAttachment"
            item-key-field="id"
            item-primary-field="name"
            item-secondary-field="metaLabel"
            @close="closeDocumentPicker"
            @update:search-keyword="documentPickerKeyword = $event.trim()"
            @select="sendDocumentPreview"
          />
        </main>

        <main v-else class="chat-panel chat-panel-empty">
          <div class="chat-empty">暂无可用房间，请先加入一个讨论房间</div>
        </main>
      </div>
    </section>

    <section class="right-side">
      <div class="right-slider-wrap">
        <div class="right-slider">
          <div class="right-slider-pill" :style="{ transform: `translateX(${rightTabIndex * 100}%)` }"></div>
          <button
            v-for="tab in rightPanelTabs"
            :key="tab.key"
            type="button"
            class="right-slider-tab"
            :class="{ active: activeRightTab === tab.key }"
            @click="switchRightTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="right-panel-stage">
        <KeepAlive :include="['DiscussionDocsPanel', 'DiscussionCodePanel', 'DiscussionTasksPanel']">
          <component
            :is="activeRightPanelComponent"
            :key="activeRightPanelKey"
            class="right-panel-view"
            v-bind="activeRightPanelProps"
            v-on="activeRightPanelListeners"
          />
        </KeepAlive>
      </div>
    </section>
  </div>
</template>

<script>
import { h, defineAsyncComponent } from 'vue'
import { apiCall } from '../utils/api'
import { getAvatarUrl, handleAvatarError as fallbackAvatar } from '../utils/avatar'
import AvatarFriendAction from '../components/AvatarFriendAction.vue'
import DiscussionChatSidebar from '../components/discussion/DiscussionChatSidebar.vue'
import {
  escapeCodeHtml,
  highlightCodeAsync,
  warmupCodeHighlighter
} from '../utils/asyncCodeHighlighter'
import { getChatMoreMenuItems, normalizeChatMoreSettings } from '../utils/discussionChatMore'
import {
  toDiscussionInt,
  parseDiscussionMetadata,
  formatDiscussionMessageTimeDivider,
  shouldShowDiscussionMessageTimeDivider,
  getDiscussionCodeTypeIconByPath,
  normalizeDiscussionCodeFile,
  createDiscussionChatFromRoom
} from '../utils/discussionModeCore'
import discussionChatMoreMixin from '../mixins/discussionChatMoreMixin'
import discussionMessagesMixin from '../mixins/discussionMessagesMixin'
import discussionRealtimeMixin from '../mixins/discussionRealtimeMixin'

const loadDiscussionDocsPanel = () => import('../components/discussion/DiscussionDocsPanel.vue')
const loadDiscussionCodePanel = () => import('../components/discussion/DiscussionCodePanel.vue')
const loadDiscussionTasksPanel = () => import('../components/discussion/DiscussionTasksPanel.vue')
const loadDiscussionChatMorePanel = () => import('../components/discussion/DiscussionChatMorePanel.vue')
const loadDiscussionResourcePicker = () => import('../components/discussion/DiscussionResourcePicker.vue')

const DiscussionAsyncLoadingPanel = {
  name: 'DiscussionAsyncLoadingPanel',
  render() {
    return h('div', { class: 'right-fallback-shell' }, [
      h('h3', '面板加载中'),
      h('p', '正在按需加载当前区域资源...')
    ])
  }
}

const createDiscussionAsyncComponent = (loader) => defineAsyncComponent({
  loader,
  delay: 120,
  loadingComponent: DiscussionAsyncLoadingPanel
})

const AsyncDiscussionDocsPanel = createDiscussionAsyncComponent(loadDiscussionDocsPanel)
const AsyncDiscussionCodePanel = createDiscussionAsyncComponent(loadDiscussionCodePanel)
const AsyncDiscussionTasksPanel = createDiscussionAsyncComponent(loadDiscussionTasksPanel)
const AsyncDiscussionChatMorePanel = createDiscussionAsyncComponent(loadDiscussionChatMorePanel)
const AsyncDiscussionResourcePicker = createDiscussionAsyncComponent(loadDiscussionResourcePicker)

const DiscussionPlaceholderPanel = {
  name: 'DiscussionPlaceholderPanel',
  props: {
    activeTab: {
      type: String,
      default: 'task'
    }
  },
  render() {
    const title = this.activeTab === 'task' ? '任务区' : '文件区'
    return h('div', { class: 'right-fallback-shell' }, [
      h('h3', title),
      h('p', '该区域正在完善中，当前版本优先支持文档区与代码区。')
    ])
  }
}

export default {
  name: 'DiscussionMode',
  mixins: [discussionChatMoreMixin, discussionMessagesMixin, discussionRealtimeMixin],
  components: {
    AvatarFriendAction,
    DiscussionChatSidebar,
    DiscussionDocsPanel: AsyncDiscussionDocsPanel,
    DiscussionCodePanel: AsyncDiscussionCodePanel,
    DiscussionTasksPanel: AsyncDiscussionTasksPanel,
    DiscussionChatMorePanel: AsyncDiscussionChatMorePanel,
    DiscussionResourcePicker: AsyncDiscussionResourcePicker,
    DiscussionPlaceholderPanel
  },
  props: {
    id: {
      type: [String, Number],
      default: null
    }
  },
  data() {
    return {
      currentUserId: null,
      currentUsername: 'You',
      currentUserAvatarUrl: getAvatarUrl(''),
      currentChatId: null,
      draft: '',
      searchKeyword: '',
      chats: [],
      loadingRooms: false,
      showAttachmentMenu: false,
      showCodePicker: false,
      showDocumentPicker: false,
      codePickerLoading: false,
      codePickerKeyword: '',
      codePickerFiles: [],
      documentPickerLoading: false,
      documentPickerKeyword: '',
      documentPickerDocuments: [],
      documentPreviewRequest: null,
      codeFilesByGame: {},
      memoryPreviewItem: null,
      highlightedCodeText: '',
      highlightedMemoryText: '',
      codePreviewSnippetHtmlByKey: {},
      codeHighlightTaskId: 0,
      memoryHighlightTaskId: 0,
      messagePreviewHighlightTaskId: 0,
      codePanelLoading: false,
      codePanelError: '',
      currentCodePath: '',
      errorText: '',
      showChatMorePanel: false,
      messageContextMenu: {
        visible: false,
        x: 0,
        y: 0,
        messageId: null,
        canRevoke: false,
        label: '撤回消息'
      },
      rightPanelTabs: [
        { key: 'docs', label: '文档区' },
        { key: 'code', label: '代码区' },
        { key: 'task', label: '任务区' },
        { key: 'file', label: '文件区' }
      ],
      activeRightTab: 'code'
    }
  },
  computed: {
    currentChat() {
      return this.chats.find(item => item.id === this.currentChatId) || null
    },
    filteredChats() {
      const keyword = this.searchKeyword.toLowerCase()
      if (!keyword) return this.chats
      return this.chats.filter((item) => {
        return (
          item.name.toLowerCase().includes(keyword)
          || item.preview.toLowerCase().includes(keyword)
          || item.status.toLowerCase().includes(keyword)
        )
      })
    },
    currentChatSupportsMorePanel() {
      return this.isChatMoreAvailable(this.currentChat)
    },
    currentChatMoreMenuItems() {
      return getChatMoreMenuItems(this.currentChat)
    },
    currentChatMoreSettings() {
      return this.getRoomSettings(this.currentChat?.id)
    },
    currentRoomDetail() {
      return this.getRoomDetail(this.currentChat?.id)
    },
    currentRoomAvatarUploading() {
      return this.isRoomAvatarUploading(this.currentChat?.id)
    },
    currentChatHeaderStatusMeta() {
      return this.getChatHeaderStatusMeta(this.currentChat)
    },
    effectiveCodeGameId() {
      const settingsGameId = String(this.currentChatMoreSettings?.sourceGameId || '').trim()
      if (settingsGameId) return settingsGameId
      return String(this.currentChat?.gameId || '').trim()
    },
    effectiveCodeGameTitle() {
      const settingsTitle = String(this.currentChatMoreSettings?.sourceGameTitle || '').trim()
      if (settingsTitle) return settingsTitle
      return String(this.currentChat?.gameTitle || '').trim()
    },
    currentRoomSummary() {
      return this.getRoomSummary(this.currentChat?.id)
    },
    currentRoomMemoryItems() {
      return this.getRoomMemory(this.currentChat?.id)
    },
    currentAiSlotSaveStates() {
      return this.getAiSlotSaveStateMap(this.currentChat?.id)
    },
    enabledAiSlots() {
      const slots = Array.isArray(this.currentChatMoreSettings?.aiSlots) ? this.currentChatMoreSettings.aiSlots : []
      return slots.filter((slot) => slot && slot.enabled)
    },
    currentRoomInviteLink() {
      return this.getRoomInviteLink(this.currentChat?.id)
    },
    currentRoomInviteGenerating() {
      return this.roomInviteLinkGeneratingByRoom[String(this.currentChat?.id || '')] === true
    },
    currentRoomInviteExpireMinutes() {
      return this.getRoomInviteExpireMinutes(this.currentChat?.id)
    },
    currentGroupInviteCandidates() {
      const currentMemberIds = new Set(
        (Array.isArray(this.currentRoomDetail?.members) ? this.currentRoomDetail.members : [])
          .filter((member) => String(member?.status || '') === 'joined')
          .map((member) => Number(member?.user_id || 0))
          .filter((id) => id > 0)
      )
      return this.inviteFriends.filter((friend) => !currentMemberIds.has(Number(friend?.id || 0)))
    },
    canManageCurrentGroup() {
      return this.currentChat?.mode === 'room' && this.currentChat?.isHost === true
    },
    canInviteCurrentGroupMembers() {
      if (this.currentChat?.mode !== 'room') return false
      if (this.currentChat?.isHost) return true
      return this.currentChatMoreSettings?.invitePermission === 'all-members'
    },
    currentRoomPendingAiMessages() {
      return this.getPendingAiMessages(this.currentChat?.id)
    },
    currentRoomAiBusy() {
      return this.isRoomAiBusy(this.currentChat?.id)
    },
    currentChatRenderedMessages() {
      const persisted = Array.isArray(this.currentChat?.messages) ? this.currentChat.messages : []
      const pending = this.currentRoomPendingAiMessages
      if (!pending.length) return persisted
      return [...persisted, ...pending].sort((left, right) => {
        const leftTime = new Date(left?.rawTime || 0).getTime()
        const rightTime = new Date(right?.rawTime || 0).getTime()
        return leftTime - rightTime
      })
    },
    dualAiLoopReady() {
      return this.currentChatSupportsMorePanel && this.enabledAiSlots.length >= 2
    },
    enabledAiMentionNames() {
      return this.enabledAiSlots
        .map((slot) => String(slot?.name || '').trim())
        .filter(Boolean)
    },
    isDraftMentioningAi() {
      const source = String(this.draft || '').trim()
      if (!source) return false
      return this.enabledAiMentionNames.some((name) => source.includes(`@${name}`))
    },
    chatInputPlaceholder() {
      if (this.sendingMessage) return '发送中...'
      if (this.uploadingAttachment) return '上传中...'
      if (this.currentRoomAiBusy) return 'AI 正在思考，请等待本轮完成'
      if (this.enabledAiMentionNames.length) {
        return `Message · 使用 @${this.enabledAiMentionNames[0]} 提问 AI`
      }
      return 'Message'
    },
    currentChatScrollSignature() {
      const lastMessage = this.currentChatRenderedMessages[this.currentChatRenderedMessages.length - 1]
      return [
        Number(this.currentChatId || 0) || 0,
        this.currentChatRenderedMessages.length,
        String(lastMessage?.id || ''),
        String(lastMessage?.rawTime || '')
      ].join(':')
    },
    messageContextMenuStyle() {
      return {
        left: `${this.messageContextMenu.x}px`,
        top: `${this.messageContextMenu.y}px`
      }
    },
    currentRoomCodeFiles() {
      const gameKey = this.effectiveCodeGameId
      if (!gameKey) return []
      return Array.isArray(this.codeFilesByGame[gameKey]) ? this.codeFilesByGame[gameKey] : []
    },
    currentCodeFile() {
      if (!this.currentRoomCodeFiles.length) return null
      return this.currentRoomCodeFiles.find((file) => file.path === this.currentCodePath) || this.currentRoomCodeFiles[0] || null
    },
    currentFileName() {
      if (this.currentCodeFile?.path) return this.currentCodeFile.path
      if (!this.effectiveCodeGameId) return '未绑定游戏源码'
      return `${this.effectiveCodeGameTitle || `game-${this.effectiveCodeGameId}`} 无源码`
    },
    codeText() {
      if (this.currentCodeFile) {
        return String(this.currentCodeFile.content || '')
      }
      if (this.codePanelError) return this.codePanelError
      return '// 当前房间暂无可展示源码'
    },
    filteredCodePickerFiles() {
      const keyword = String(this.codePickerKeyword || '').toLowerCase()
      if (!keyword) return this.codePickerFiles
      return this.codePickerFiles.filter((file) => file.path.toLowerCase().includes(keyword))
    },
    filteredDocumentPickerDocuments() {
      const keyword = String(this.documentPickerKeyword || '').toLowerCase()
      if (!keyword) return this.documentPickerDocuments
      return this.documentPickerDocuments.filter((doc) => doc.name.toLowerCase().includes(keyword))
    },
    documentPickerPickerItems() {
      return this.filteredDocumentPickerDocuments.map((doc) => ({
        ...doc,
        metaLabel: doc.pageCount ? `${doc.pageCount}页` : '文档'
      }))
    },
    rightTabIndex() {
      const index = this.rightPanelTabs.findIndex((tab) => tab.key === this.activeRightTab)
      return index >= 0 ? index : 1
    },
    activeRightPanelKey() {
      return `right-panel-${this.activeRightTab}`
    },
    activeRightPanelComponent() {
      if (this.activeRightTab === 'docs') return AsyncDiscussionDocsPanel
      if (this.activeRightTab === 'code') return AsyncDiscussionCodePanel
      if (this.activeRightTab === 'task') return AsyncDiscussionTasksPanel
      return DiscussionPlaceholderPanel
    },
    activeRightPanelProps() {
      if (this.activeRightTab === 'docs') {
        return {
          currentChat: this.currentChat,
          isActive: true,
          documentPreviewRequest: this.documentPreviewRequest
        }
      }
      if (this.activeRightTab === 'code') {
        return {
          currentChat: this.currentChat,
          currentRoomCodeFiles: this.currentRoomCodeFiles,
          currentCodePath: this.currentCodePath,
          currentFileName: this.currentFileName,
          currentCodeSourceGameId: this.effectiveCodeGameId,
          currentCodeSourceGameTitle: this.effectiveCodeGameTitle,
          codePanelLoading: this.codePanelLoading,
          codePanelError: this.codePanelError,
          highlightedCodeText: this.highlightedCodeText,
          memoryPreviewItem: this.memoryPreviewItem,
          highlightedMemoryText: this.highlightedMemoryText
        }
      }
      if (this.activeRightTab === 'task') {
        return {
          currentChat: this.currentChat,
          isActive: true
        }
      }
      return {
        activeTab: this.activeRightTab
      }
    },
    activeRightPanelListeners() {
      if (this.activeRightTab !== 'code') return {}
      return {
        refresh: this.refreshCurrentRoomCode,
        'update:currentCodePath': this.handleCodePathUpdate
      }
    }
  },
  watch: {
    id() {
      this.initializeDiscussion()
    },
    activeRightTab(nextTab) {
      this.preloadRightPanelChunk(nextTab)
      if (nextTab === 'code') {
        warmupCodeHighlighter()
        this.refreshRightPanelCodeHighlight()
        this.refreshMemoryHighlight()
      }
    },
    currentCodeFile() {
      this.refreshRightPanelCodeHighlight()
    },
    currentChatSupportsMorePanel(nextValue) {
      if (!nextValue && this.showChatMorePanel) {
        this.closeChatMorePanel()
      }
    },
    currentChatId() {
      this.activeChatMoreSection = ''
      this.closeMessageContextMenu()
      this.refreshCurrentChatPreviewHighlights()
      this.refreshMessagePolling()
    },
    codeText() {
      this.refreshRightPanelCodeHighlight()
    },
    memoryPreviewItem: {
      deep: true,
      handler() {
        this.refreshMemoryHighlight()
      }
    },
    currentChatScrollSignature() {
      this.closeMessageContextMenu()
      this.refreshCurrentChatPreviewHighlights()
      this.$nextTick(() => this.scrollMessagesToBottom())
    },
    showChatMorePanel(nextValue) {
      if (nextValue) {
        this.preloadChatMorePanel()
      }
    },
    showCodePicker(nextValue) {
      if (nextValue) {
        this.preloadResourcePicker()
      }
    },
    showDocumentPicker(nextValue) {
      if (nextValue) {
        this.preloadResourcePicker()
      }
    }
  },
  mounted() {
    this.currentUserId = this.readCurrentUserId()
    this.preloadRightPanelChunk(this.activeRightTab)
    if (this.activeRightTab === 'code') {
      warmupCodeHighlighter()
      this.refreshRightPanelCodeHighlight()
    }
    this.setupSocket()
    this.startMessagePolling()
    this.initializeDiscussion()
    window.addEventListener('click', this.closeAttachmentMenu)
    window.addEventListener('click', this.closeMessageContextMenu)
    window.addEventListener('scroll', this.closeMessageContextMenu, true)
    window.addEventListener('keydown', this.handleGlobalKeydown)
  },
  beforeUnmount() {
    window.removeEventListener('click', this.closeAttachmentMenu)
    window.removeEventListener('click', this.closeMessageContextMenu)
    window.removeEventListener('scroll', this.closeMessageContextMenu, true)
    window.removeEventListener('keydown', this.handleGlobalKeydown)
    Object.values(this.roomSettingsSaveTimers).forEach((timerId) => window.clearTimeout(timerId))
    this.stopMessagePolling()
    this.teardownSocket()
  },
  methods: {
    goBack() {
      const hasHistory = typeof window !== 'undefined' && window.history.length > 1
      if (hasHistory) {
        this.$router.back()
        return
      }
      this.$router.push('/')
    },
    readCurrentUserId() {
      try {
        const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
        this.currentUsername = user?.username || 'You'
        this.currentUserAvatarUrl = getAvatarUrl(user?.avatar_url || '')
        return toDiscussionInt(user?.id)
      } catch (error) {
        this.currentUsername = 'You'
        this.currentUserAvatarUrl = getAvatarUrl('')
        return null
      }
    },
    resolveDisplayedMessageSenderName(message = {}) {
      if (this.currentChat?.mode === 'friend' && message?.from !== 'me' && message?.senderType === 'user' && this.currentChat?.name) {
        return this.currentChat.name
      }
      if (this.currentChat?.mode === 'room' && message?.from === 'me' && message?.senderType === 'user') {
        return this.currentChatMoreSettings?.customNickname || message?.senderName || this.currentUsername
      }
      return message?.senderName || '成员'
    },
    parseRoomId(value) {
      const roomId = toDiscussionInt(value)
      return roomId && roomId > 0 ? roomId : null
    },
    parseRoomInviteCode(rawValue) {
      const directCode = String(rawValue || '').trim()
      if (directCode) return directCode
      return ''
    },
    formatMessageTimeDivider(rawTime) {
      return formatDiscussionMessageTimeDivider(rawTime)
    },
    shouldShowMessageTimeDivider(messages = [], index = 0) {
      return shouldShowDiscussionMessageTimeDivider(messages, index)
    },
    getCodeTypeIconByPath(filePath = '') {
      return getDiscussionCodeTypeIconByPath(filePath)
    },
    getCodePreviewCacheKey(codePreview = {}) {
      return `${String(codePreview.path || '')}::${String(codePreview.snippet || '')}`
    },
    getCodePreviewSnippetHtml(codePreview) {
      if (!codePreview) return ''
      const cacheKey = this.getCodePreviewCacheKey(codePreview)
      return this.codePreviewSnippetHtmlByKey[cacheKey] || escapeCodeHtml(codePreview.snippet || '')
    },
    preloadRightPanelChunk(tabKey = this.activeRightTab) {
      if (tabKey === 'docs') {
        void loadDiscussionDocsPanel()
        return
      }
      if (tabKey === 'code') {
        void loadDiscussionCodePanel()
        return
      }
      if (tabKey === 'task') {
        void loadDiscussionTasksPanel()
      }
    },
    preloadChatMorePanel() {
      void loadDiscussionChatMorePanel()
    },
    preloadResourcePicker() {
      void loadDiscussionResourcePicker()
    },
    async refreshRightPanelCodeHighlight() {
      const taskId = ++this.codeHighlightTaskId
      const content = String(this.codeText || '')
      const filePath = this.currentCodeFile?.path || ''
      const language = this.currentCodeFile?.language || ''

      this.highlightedCodeText = escapeCodeHtml(content)
      if (!content) return

      try {
        const html = await highlightCodeAsync(content, { filePath, language })
        if (taskId !== this.codeHighlightTaskId) return
        this.highlightedCodeText = html
      } catch {
        if (taskId !== this.codeHighlightTaskId) return
        this.highlightedCodeText = escapeCodeHtml(content)
      }
    },
    async refreshMemoryHighlight() {
      const taskId = ++this.memoryHighlightTaskId
      const content = String(this.memoryPreviewItem?.content || '')
      const filePath = this.memoryPreviewItem?.filePath || this.memoryPreviewItem?.title || 'memory.md'

      this.highlightedMemoryText = escapeCodeHtml(content)
      if (!content) return

      try {
        const html = await highlightCodeAsync(content, { filePath, language: 'markdown' })
        if (taskId !== this.memoryHighlightTaskId) return
        this.highlightedMemoryText = html
      } catch {
        if (taskId !== this.memoryHighlightTaskId) return
        this.highlightedMemoryText = escapeCodeHtml(content)
      }
    },
    async refreshCurrentChatPreviewHighlights() {
      const previews = this.currentChatRenderedMessages
        .map((message) => message?.codePreview)
        .filter(Boolean)

      const nextSnippetHtmlByKey = {}
      previews.forEach((preview) => {
        nextSnippetHtmlByKey[this.getCodePreviewCacheKey(preview)] = escapeCodeHtml(preview.snippet || '')
      })
      this.codePreviewSnippetHtmlByKey = nextSnippetHtmlByKey

      if (!previews.length) return

      const batchId = ++this.messagePreviewHighlightTaskId
      try {
        const results = await Promise.all(previews.map(async (preview) => {
          const html = await highlightCodeAsync(preview.snippet || '', {
            filePath: preview.path || '',
            language: preview.language || ''
          })
          return {
            cacheKey: this.getCodePreviewCacheKey(preview),
            html
          }
        }))

        if (batchId !== this.messagePreviewHighlightTaskId) return

        const merged = { ...this.codePreviewSnippetHtmlByKey }
        results.forEach(({ cacheKey, html }) => {
          merged[cacheKey] = html
        })
        this.codePreviewSnippetHtmlByKey = merged
      } catch {
        if (batchId !== this.messagePreviewHighlightTaskId) return
      }
    },
    switchRightTab(nextTab, options = {}) {
      if (!nextTab || this.activeRightTab === nextTab) return
      this.preloadRightPanelChunk(nextTab)
      this.activeRightTab = nextTab

      const shouldPrefetchCode = options.prefetchCode !== false
      if (shouldPrefetchCode && nextTab === 'code' && this.currentChat && !this.codePanelLoading && !this.currentRoomCodeFiles.length) {
        warmupCodeHighlighter()
        this.syncCurrentRoomCode()
      }
    },
    handleCodePathUpdate(nextPath) {
      this.memoryPreviewItem = null
      this.currentCodePath = String(nextPath || '')
    },
    async openCodePreviewInRightPanel(codePreview) {
      const previewPath = String(codePreview?.path || '').trim()
      if (!previewPath || !this.currentChat) return

      this.preloadRightPanelChunk('code')
      warmupCodeHighlighter()
      this.switchRightTab('code', { prefetchCode: false })
      this.memoryPreviewItem = null
      this.codePanelError = ''
      this.errorText = ''

      const gameId = this.effectiveCodeGameId
      if (!gameId) {
        this.codePanelError = '当前房间没有可用源码'
        return
      }

      const gameKey = String(gameId).trim()
      const hasCachedFiles = Array.isArray(this.codeFilesByGame[gameKey]) && this.codeFilesByGame[gameKey].length > 0
      if (!hasCachedFiles) {
        this.codePanelLoading = true
      }

      try {
        const files = await this.loadGameCodeFiles(gameId)
        if (!files.length) {
          this.currentCodePath = ''
          this.codePanelError = '当前房间游戏暂无可浏览源码'
          return
        }

        const targetFile = files.find((file) => file.path === previewPath)
        if (targetFile) {
          this.currentCodePath = targetFile.path
          return
        }

        this.currentCodePath = files[0].path
        this.codePanelError = `未找到对应源码文件：${previewPath}`
      } catch (error) {
        this.codePanelError = error.message || '加载源码失败'
      } finally {
        this.codePanelLoading = false
      }
    },
    async openDocumentPreviewInRightPanel(documentPreview) {
      const documentId = Number(documentPreview?.documentId || 0)
      if (!documentId || !this.currentChat) return

      this.preloadRightPanelChunk('docs')
      this.documentPreviewRequest = {
        key: `${documentId}-${Date.now()}`,
        roomId: Number(this.currentChat.id || 0),
        documentId
      }
      this.switchRightTab('docs', { prefetchCode: false })
    },
    closeCodePicker() {
      this.showCodePicker = false
      this.codePickerKeyword = ''
    },
    closeDocumentPicker() {
      this.showDocumentPicker = false
      this.documentPickerKeyword = ''
    },
    async loadGameCodeFiles(gameId, options = {}) {
      const gameKey = String(gameId || '').trim()
      if (!gameKey) return []
      const force = options?.force === true

      if (!force && Array.isArray(this.codeFilesByGame[gameKey])) {
        return this.codeFilesByGame[gameKey]
      }

      const data = await apiCall(`/games/${encodeURIComponent(gameKey)}/code`)
      const files = Array.isArray(data?.files)
        ? data.files.map((file) => normalizeDiscussionCodeFile(file)).filter(Boolean)
        : []
      this.codeFilesByGame[gameKey] = files
      return files
    },
    async syncCurrentRoomCode(options = {}) {
      if (options?.keepMemoryPreview !== true) {
        this.memoryPreviewItem = null
      }
      const gameId = this.effectiveCodeGameId
      this.codePanelError = ''

      if (!gameId) {
        this.currentCodePath = ''
        return
      }

      this.codePanelLoading = true
      try {
        const files = await this.loadGameCodeFiles(gameId, options)
        if (!files.length) {
          this.currentCodePath = ''
          return
        }
        if (!files.some((file) => file.path === this.currentCodePath)) {
          this.currentCodePath = files[0].path
        }
      } catch (error) {
        this.currentCodePath = ''
        this.codePanelError = error.message || '加载源码失败'
      } finally {
        this.codePanelLoading = false
      }
    },
    async refreshCurrentRoomCode() {
      if (!this.effectiveCodeGameId || this.codePanelLoading) return
      await this.syncCurrentRoomCode({ force: true })
    },
    async openCodePreviewPicker() {
      if (!this.currentChat || this.uploadingAttachment) return
      this.memoryPreviewItem = null
      this.preloadResourcePicker()
      const gameId = this.effectiveCodeGameId
      if (!gameId) {
        this.errorText = '当前房间没有可用的游戏源码'
        return
      }

      this.showAttachmentMenu = false
      this.showCodePicker = true
      this.codePickerLoading = true
      this.codePickerKeyword = ''
      this.errorText = ''

      try {
        this.codePickerFiles = await this.loadGameCodeFiles(gameId)
      } catch (error) {
        this.codePickerFiles = []
        this.errorText = error.message || '源码加载失败'
      } finally {
        this.codePickerLoading = false
      }
    },
    mapRoomToChat(room) {
      const parsedSettings = normalizeChatMoreSettings({
        ...(parseDiscussionMetadata(room.room_settings_json) || {}),
        roomTitle: room.title || '',
        roomMaxMembers: room.max_members || 4,
        customNickname: room.member_custom_nickname || '',
        clearedBeforeMessageId: room.cleared_before_message_id || 0
      })
      this.setRoomSettings(room.id, parsedSettings)
      const chat = createDiscussionChatFromRoom(room, {
        currentUserId: this.currentUserId
      })
      this.applyRoomSettingsToChat(chat)
      return chat
    },
    handleAvatarError(event) {
      fallbackAvatar(event)
    },
    handleRoomAvatarError(chat) {
      if (!chat || typeof chat !== 'object') return
      chat.avatarUrl = ''
    },
    isChatMoreAvailable(chat) {
      if (!chat || typeof chat !== 'object') return false
      return chat.mode === 'friend' || chat.mode === 'room'
    },
    closeAttachmentMenu() {
      this.showAttachmentMenu = false
    },
    closeMessageContextMenu() {
      this.messageContextMenu = {
        visible: false,
        x: 0,
        y: 0,
        messageId: null,
        canRevoke: false,
        label: '撤回消息'
      }
    },
    handleGlobalKeydown(event) {
      if (event?.key === 'Escape') {
        this.closeMessageContextMenu()
      }
    },
    openMessageContextMenu(event, message) {
      if (!message || message.senderType !== 'user' || message.from !== 'me') {
        this.closeMessageContextMenu()
        return
      }

      const canRevoke = this.canRevokeMessage(message)
      this.messageContextMenu = {
        visible: true,
        x: Number(event?.clientX || 0),
        y: Number(event?.clientY || 0),
        messageId: message.id,
        canRevoke,
        label: canRevoke ? '撤回消息' : (message.isRevoked ? '消息已撤回' : '超过 1 分钟不可撤回')
      }
    },
    async handleRevokeContextMessage() {
      if (!this.messageContextMenu.visible || !this.messageContextMenu.canRevoke || !this.currentChat) {
        this.closeMessageContextMenu()
        return
      }
      const targetMessage = this.currentChat.messages.find((item) => String(item?.id || '') === String(this.messageContextMenu.messageId || '')) || null
      this.closeMessageContextMenu()
      await this.revokeMessage(targetMessage)
    },
    toggleAttachmentMenu() {
      if (!this.currentChat || this.uploadingAttachment) return
      this.closeMessageContextMenu()
      this.showChatMorePanel = false
      this.showCodePicker = false
      this.showDocumentPicker = false
      this.showAttachmentMenu = !this.showAttachmentMenu
    },
    async initializeDiscussion() {
      this.loadingRooms = true
      this.errorText = ''
      this.chats = []
      this.currentChatId = null
      this.showChatMorePanel = false
      this.activeChatMoreSection = ''
      this.closeMessageContextMenu()
      this.currentCodePath = ''
      this.memoryPreviewItem = null
      this.codePanelError = ''
      this.codePanelLoading = false

      const preferredRoomId = this.parseRoomId(this.id)
      const inviteCode = this.parseRoomInviteCode(this.$route?.query?.roomInvite || this.$route?.query?.invite || this.$route?.query?.code)
      if (preferredRoomId) {
        if (inviteCode) {
          await this.tryRedeemRoomInvite(preferredRoomId, inviteCode)
        } else {
          await this.tryJoinRoom(preferredRoomId)
        }
      }

      try {
        const data = await apiCall('/discussion/rooms/mine')
        this.chats = (data.rooms || []).map(room => this.mapRoomToChat(room))
        await this.syncSocketSubscriptions()

        if (!this.chats.length) return

        const hasPreferred = preferredRoomId && this.chats.some(item => item.id === preferredRoomId)
        const targetRoomId = hasPreferred ? preferredRoomId : this.chats[0].id
        await this.selectChat(targetRoomId, { force: true })
      } catch (error) {
        this.errorText = error.message || '加载讨论房间失败'
      } finally {
        this.loadingRooms = false
      }
    },
    async tryJoinRoom(roomId) {
      try {
        await apiCall(`/discussion/rooms/${roomId}/join`, { method: 'POST' })
      } catch (error) {
        // 非成员或房间不存在时，继续展示当前用户已有房间
        console.warn('尝试加入指定房间失败:', error)
      }
    },
    async tryRedeemRoomInvite(roomId, inviteCode) {
      try {
        await apiCall(`/discussion/rooms/${roomId}/invite-links/redeem`, {
          method: 'POST',
          body: JSON.stringify({ code: inviteCode })
        })
      } catch (error) {
        console.warn('尝试通过群邀请链接加入房间失败:', error)
      }
    },
    async selectChat(chatId, options = {}) {
      if (!chatId) return
      if (this.currentChatId) {
        await this.flushRoomSettingsSave(this.currentChatId)
      }
      this.showAttachmentMenu = false
      this.showChatMorePanel = false
      this.activeChatMoreSection = ''
      this.memoryPreviewItem = null
      this.closeCodePicker()
      this.closeMessageContextMenu()
      this.currentChatId = chatId
      this.markChatAsRead(chatId)
      this.syncSocketSubscriptions()

      const chat = this.chats.find(item => item.id === chatId)
      if (!chat) return
      if (chat.messagesLoaded && !options.force) {
        const syncTasks = []
        if (this.currentChatSupportsMorePanel) {
          syncTasks.push(this.fetchRoomSettings(chatId))
          if (chat.mode === 'room') {
            syncTasks.push(this.fetchRoomDetail(chatId, { force: true }))
          }
        }
        if (this.activeRightTab === 'code') {
          syncTasks.push(this.syncCurrentRoomCode())
        }
        if (syncTasks.length) {
          await Promise.all(syncTasks)
        }
        this.$nextTick(() => this.scrollMessagesToBottom())
        return
      }

      const loadingTasks = [this.fetchMessages(chatId)]
      if (this.currentChatSupportsMorePanel) {
        loadingTasks.push(this.fetchRoomSettings(chatId))
        loadingTasks.push(this.fetchRoomMemory(chatId))
        if (chat.mode === 'room') {
          loadingTasks.push(this.fetchRoomDetail(chatId, { force: true }))
        }
      }
      if (this.activeRightTab === 'code') {
        loadingTasks.push(this.syncCurrentRoomCode())
      }
      await Promise.all(loadingTasks)
    },
    scrollMessagesToBottom() {
      const anchor = this.$refs.messagesBottomRef
      const container = this.$refs.messagesPaneRef
      if (anchor && typeof anchor.scrollIntoView === 'function') {
        requestAnimationFrame(() => {
          anchor.scrollIntoView({ block: 'end' })
        })
      } else if (container) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight
        })
      }
    },
    focusDraftInput() {
      const input = this.$refs.draftInputRef
      if (!input || typeof input.focus !== 'function') return
      input.focus({ preventScroll: true })
    },
    handleSaveAiSlot(slotId) {
      this.saveAiSlot(slotId)
    }
  }
}
</script>

<style src="../styles/discussion-mode.css"></style>
