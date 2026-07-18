<template>
  <div class="account-page">
    <div class="content-wrapper">
      <div class="container mx-auto px-4 pt-5 pb-3 account-container">
        <div
          class="max-w-6xl mx-auto h-full"
          :class="{ 'account-main-guest': !isLoggedIn }"
        >
          <div v-if="!isLoggedIn" class="account-login-shell">
            <section class="glass-card account-login-state">
              <div class="account-login-brand">
                <div class="account-login-logo-wrap">
                  <img src="/logo_light.png" alt="DpccGaming" class="account-login-logo account-login-logo-dark" />
                  <img src="/logo.png" alt="DpccGaming" class="account-login-logo account-login-logo-light" />
                </div>
                <h2 class="text-2xl font-bold text-white">账户中心</h2>
                <p class="text-white/80">登录后可管理头像、查看游戏库、处理好友与通知</p>
              </div>

              <div class="account-login-actions">
                <button
                  @click="openLoginModal"
                  class="account-primary-btn account-login-primary-btn"
                >
                  立即登录
                </button>
                <button
                  @click="openRegisterModal"
                  class="account-login-secondary-btn"
                >
                  注册新账户
                </button>
              </div>

              <div class="account-login-highlights">
                <span>游戏库同步</span>
                <span>好友互动</span>
                <span>通知提醒</span>
              </div>
            </section>
          </div>

          <div v-else class="account-dashboard">
            <div class="left-stack">
              <section class="glass-card widget widget-profile p-6">
                <div class="text-center">
                  <div class="avatar-wrap mx-auto mb-4">
                    <img
                      :src="getAvatarUrl(currentUser?.avatar_url)"
                      alt="用户头像"
                      class="user-avatar-image"
                      @error="handleAvatarError"
                    />
                  </div>
                  <h3 class="text-xl font-bold text-white mb-2 profile-name-row">
                    <span>{{ currentUser.username }}</span>
                  </h3>
                  <p class="text-white/80 text-sm mb-4">{{ currentUser.email || '未设置邮箱' }}</p>
                  <input
                    ref="avatarInputRef"
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="onAvatarFileChange"
                  />
                  <button
                    type="button"
                    @click="openAvatarPicker"
                    :disabled="avatarUploading"
                    class="upload-avatar-btn mb-3"
                  >
                    {{ avatarUploading ? '上传中...' : '上传头像' }}
                  </button>
                  <div class="bind-oauth-row mb-3">
                    <button
                      type="button"
                      title="绑定微信"
                      @click="startWechatBind"
                      :disabled="wechatBinding || wechatBound"
                      class="wechat-bind-btn"
                    >
                      <img src="/Ai/WeChat.png" alt="WeChat" class="wechat-bind-logo" />
                    </button>
                    <button
                      type="button"
                      title="绑定 Google"
                      @click="startGoogleBind"
                      :disabled="googleBinding || googleBound"
                      class="google-bind-btn"
                    >
                       <img src="/Ai/Google.png" alt="Google" class="wechat-bind-logo" />
                    </button>
                    <button
                      type="button"
                      title="绑定 GitHub"
                      class="github-bind-btn"
                    >
                      <i class="fa-brands fa-github oauth-font-icon"></i>
                    </button>
                  </div>
                  <p v-if="wechatBoundLabel" class="wechat-bind-hint mb-3">{{ wechatBoundLabel }}</p>
                  <p v-if="googleBoundLabel" class="wechat-bind-hint mb-3">{{ googleBoundLabel }}</p>
                  <button
                    @click="logout"
                    class="account-logout-btn text-sm font-medium">
                    {{ logoutConfirmPending ? '再次点击确认退出' : '退出登录' }}
                  </button>
                </div>
              </section>

              <section class="glass-card widget widget-library p-6">
                <div class="widget-title-row">
                  <h3 class="text-xl font-bold text-white">游戏库</h3>
                  <span class="text-xs text-white/80">{{ libraryGames.length }} 个</span>
                </div>

                <div class="library-scroll">
                  <div v-if="libraryLoading" class="text-sm text-white/80 py-3">加载中...</div>
                  <div v-else-if="!libraryGames.length" class="text-sm text-white/80 py-3">库里还没有游戏</div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="game in libraryGames"
                      :key="`library-${game.game_id || game.id}`"
                      class="library-row"
                      role="button"
                      tabindex="0"
                      @click="openLibraryGame(game)"
                      @keyup.enter="openLibraryGame(game)"
                      @keyup.space.prevent="openLibraryGame(game)"
                    >
                      <div class="recent-game-media">
                        <video
                          v-if="hasPlayableVideo(game)"
                          :src="getGameVideoUrl(game)"
                          :poster="getGameCoverUrl(game) || '/GameImg.jpg'"
                          class="recent-game-media-el"
                          autoplay
                          muted
                          loop
                          playsinline
                          preload="metadata"
                        ></video>
                        <img
                          v-else-if="getGameCoverUrl(game)"
                          :src="getGameCoverUrl(game)"
                          :alt="game.title"
                          class="recent-game-media-el"
                        />
                        <div v-else class="recent-game-media-fallback">
                          <i class="fa fa-laptop account-icon-glyph"></i>
                        </div>
                      </div>
                      <div class="library-meta">
                        <strong>{{ game.title }}</strong>
                        <small>{{ categoryToZh(game.category || 'action') }} · {{ game.play_count || 0 }} 次</small>
                      </div>
                      <div
                        v-if="getGameCodeTypeIcon(game) || getGameEngineIcon(game)"
                        class="library-icons"
                      >
                        <img
                          v-if="getGameCodeTypeIcon(game)"
                          :src="getGameCodeTypeIcon(game)"
                          alt="游戏代码类型"
                          class="library-meta-icon"
                        />
                        <img
                          v-if="getGameEngineIcon(game)"
                          :src="getGameEngineIcon(game)"
                          alt="游戏引擎"
                          class="library-meta-icon"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="glass-card widget widget-doc-stars p-6">
                <div class="widget-title-row">
                  <h3 class="text-xl font-bold text-white">Star 文档</h3>
                  <span class="text-xs text-white/80">{{ starredDocs.length }} 个</span>
                </div>

                <div class="doc-stars-scroll">
                  <div v-if="docStarsLoading" class="text-sm text-white/80 py-3">加载中...</div>
                  <div v-else-if="!starredDocs.length" class="text-sm text-white/80 py-3">还没有 Star 文档</div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="doc in starredDocs"
                      :key="`doc-star-${doc.id}`"
                      class="doc-star-row"
                      role="button"
                      tabindex="0"
                      @click="openStarDoc(doc)"
                      @keyup.enter="openStarDoc(doc)"
                      @keyup.space.prevent="openStarDoc(doc)"
                    >
                      <img
                        v-if="doc.cover"
                        :src="doc.cover"
                        :alt="doc.title"
                        class="doc-star-cover"
                        loading="lazy"
                      />
                      <div v-else class="doc-star-cover doc-star-cover-fallback">
                        <i class="fa fa-file-lines account-icon-glyph"></i>
                      </div>
                      <div class="doc-star-meta">
                        <strong>{{ doc.title }}</strong>
                        <small>{{ doc.tag }} · {{ doc.summary }}</small>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section class="glass-card widget widget-notifications p-0">
              <NotificationsSection compact />
            </section>

            <div class="middle-panels">
              <section class="glass-card widget widget-friends p-6">
                <div class="widget-title-row">
                  <h3 class="text-xl font-bold text-white">好友</h3>
                  <div class="friend-widget-actions">
                    <span class="text-xs text-white/80">{{ friends.length }} 人</span>
                    <button
                      type="button"
                      class="friend-add-open-btn secondary"
                      @click="openGroupModal"
                    >
                      <i class="fa fa-users"></i>
                      <span>拉群</span>
                    </button>
                    <button
                      type="button"
                      class="friend-add-open-btn secondary"
                      @click="openGroupInviteModal"
                    >
                      <i class="fa fa-link"></i>
                      <span>群邀请</span>
                    </button>
                    <button
                      type="button"
                      class="friend-add-open-btn"
                      @click="openFriendModal"
                    >
                      <i class="fa fa-user-plus"></i>
                      <span>添加好友</span>
                    </button>
                  </div>
                </div>

                <div class="friends-scroll">
                  <div v-if="friendsLoading" class="text-sm text-white/80 py-3">加载中...</div>
                  <div v-else-if="!friends.length" class="text-sm text-white/80 py-3">暂无好友</div>
                  <div v-else class="friends-grid">
                    <div
                      v-for="friend in friends"
                      :key="friend.id"
                      class="friend-row"
                      :class="{ 'is-opening': isOpeningFriendChat(friend.id) }"
                      role="button"
                      tabindex="0"
                      @click="openFriendDiscussion(friend)"
                      @keyup.enter="openFriendDiscussion(friend)"
                      @keyup.space.prevent="openFriendDiscussion(friend)"
                    >
                      <AccountUserIdentity
                        :avatar-url="getAvatarUrl(friend.avatar_url)"
                        :avatar-alt="friend.username"
                        :name="friend.username"
                        :subtitle="friend.email || '未设置邮箱'"
                        @avatar-error="handleAvatarError"
                      />
                      <div class="friend-chat-indicator" :title="isOpeningFriendChat(friend.id) ? '正在打开协作聊天' : '进入协作聊天'">
                        <i class="fa" :class="isOpeningFriendChat(friend.id) ? 'fa-spinner fa-spin' : 'fa-comments'"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section class="widget widget-player-data p-0">
              <AccountHistoryPanel :is-logged-in="isLoggedIn" />
            </section>

            <AccountModalShell
              v-if="friendModalVisible"
              title="添加好友"
              @close="closeFriendModal"
            >
                  <section class="friend-modal-section">
                    <div class="friend-modal-title-row">
                      <h4>搜索用户名</h4>
                    </div>
                    <div class="friend-search-row">
                      <input
                        v-model.trim="friendSearchKeyword"
                        type="text"
                        placeholder="输入用户名"
                        @keyup.enter="searchFriendUsers"
                      />
                      <button
                        type="button"
                        class="friend-primary-btn"
                        :disabled="friendSearching"
                        @click="searchFriendUsers"
                      >
                        {{ friendSearching ? '搜索中...' : '搜索' }}
                      </button>
                    </div>

                    <div v-if="friendSearchResults.length" class="friend-search-results">
                      <div
                        v-for="user in friendSearchResults"
                        :key="`friend-search-${user.id}`"
                        class="friend-result-row"
                      >
                        <AccountUserIdentity
                          class="friend-result-user"
                          :avatar-url="getAvatarUrl(user.avatar_url)"
                          :avatar-alt="user.username"
                          :name="user.username"
                          :subtitle="user.email || '未设置邮箱'"
                          @avatar-error="handleAvatarError"
                        />
                        <div class="friend-result-actions">
                          <button
                            v-if="user.friend_status === 'none'"
                            type="button"
                            class="friend-primary-btn small"
                            :disabled="friendActionLoading[user.id]"
                            @click="sendFriendRequestByUser(user)"
                          >
                            {{ friendActionLoading[user.id] ? '发送中...' : '添加' }}
                          </button>
                          <button
                            v-else-if="user.friend_status === 'incoming_pending' && user.incoming_request_id"
                            type="button"
                            class="friend-primary-btn small"
                            :disabled="friendActionLoading[user.id]"
                            @click="respondFriendRequest(user.incoming_request_id, 'accept')"
                          >
                            同意
                          </button>
                          <span v-else-if="user.friend_status === 'accepted'" class="friend-state-text">已是好友</span>
                          <span v-else-if="user.friend_status === 'outgoing_pending'" class="friend-state-text">已发送</span>
                          <span v-else class="friend-state-text">不可添加</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section class="friend-modal-section">
                    <div class="friend-modal-title-row">
                      <h4>邀请链接</h4>
                    </div>
                    <div class="friend-invite-generate">
                      <select v-model.number="inviteExpireMinutes">
                        <option :value="30">30 分钟</option>
                        <option :value="60">1 小时</option>
                        <option :value="360">6 小时</option>
                        <option :value="1440">24 小时</option>
                      </select>
                      <button
                        type="button"
                        class="friend-primary-btn"
                        :disabled="inviteGenerating"
                        @click="generateFriendInvite"
                      >
                        {{ inviteGenerating ? '生成中...' : '生成链接' }}
                      </button>
                    </div>
                    <div v-if="generatedInviteLink" class="friend-invite-output">
                      <input :value="generatedInviteLink" type="text" readonly />
                      <button type="button" class="friend-primary-btn" @click="copyInviteLink">复制</button>
                    </div>

                    <div class="friend-redeem-row">
                      <input
                        v-model.trim="inviteCodeInput"
                        type="text"
                        placeholder="输入邀请码或邀请链接"
                        @keyup.enter="redeemFriendInvite"
                      />
                      <button
                        type="button"
                        class="friend-primary-btn"
                        :disabled="inviteRedeeming"
                        @click="redeemFriendInvite"
                      >
                        {{ inviteRedeeming ? '处理中...' : '加入好友' }}
                      </button>
                    </div>
                  </section>

                  <section class="friend-modal-section">
                    <div class="friend-modal-title-row">
                      <h4>待处理申请</h4>
                    </div>
                    <div v-if="friendRequestsLoading" class="friend-muted-text">加载中...</div>
                    <div v-else-if="!incomingRequests.length" class="friend-muted-text">暂无待处理申请</div>
                    <div v-else class="friend-request-list">
                      <div
                        v-for="request in incomingRequests"
                        :key="`incoming-${request.id}`"
                        class="friend-request-row"
                      >
                        <AccountUserIdentity
                          class="friend-result-user"
                          :avatar-url="getAvatarUrl(request.requester_avatar_url)"
                          :avatar-alt="request.requester_name"
                          :name="request.requester_name"
                          :subtitle="formatSavedDate(request.created_at)"
                          @avatar-error="handleAvatarError"
                        />
                        <div class="friend-request-actions">
                          <button type="button" class="friend-primary-btn small" @click="respondFriendRequest(request.id, 'accept')">同意</button>
                          <button type="button" class="friend-secondary-btn small" @click="respondFriendRequest(request.id, 'reject')">拒绝</button>
                        </div>
                      </div>
                    </div>
                  </section>
            </AccountModalShell>

            <AccountModalShell
              v-if="groupInviteModalVisible"
              title="填写群邀请链接"
              modal-class="group-invite-modal"
              body-class="group-invite-modal-body"
              @close="closeGroupInviteModal"
            >
              <section class="friend-modal-section">
                <div class="friend-modal-title-row">
                  <h4>加入群聊</h4>
                </div>
                <div class="friend-muted-text">
                  粘贴完整的群邀请链接后即可加入，对应房间会在验证成功后自动打开。
                </div>
                <div class="friend-redeem-row group-invite-redeem-row">
                  <input
                    v-model.trim="groupInviteInput"
                    type="text"
                    placeholder="输入完整群邀请链接"
                    @keyup.enter="redeemGroupInvite"
                  />
                  <button
                    type="button"
                    class="friend-primary-btn"
                    :disabled="groupInviteRedeeming"
                    @click="redeemGroupInvite"
                  >
                    {{ groupInviteRedeeming ? '加入中...' : '加入群聊' }}
                  </button>
                </div>
              </section>
            </AccountModalShell>

            <AccountModalShell
              v-if="groupModalVisible"
              title="创建多人群聊"
              modal-class="group-modal"
              body-class="group-modal-body"
              @close="closeGroupModal"
            >
                  <section class="friend-modal-section">
                    <div class="friend-modal-title-row">
                      <h4>群聊信息</h4>
                      <span class="friend-muted-text">{{ selectedGroupFriendIds.length + 1 }} / 4 人</span>
                    </div>
                    <div class="group-modal-field">
                      <span>群聊名称</span>
                      <input
                        v-model.trim="groupTitle"
                        type="text"
                        maxlength="40"
                        placeholder="可选，留空会自动生成"
                      />
                    </div>
                    <div class="friend-muted-text">
                      创建后会自动把已选好友加入群聊，并跳转到 discussion 页面。
                    </div>
                    <div class="group-modal-actions">
                      <button
                        type="button"
                        class="friend-secondary-btn"
                        @click="closeGroupModal"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        class="friend-primary-btn"
                        :disabled="groupCreating || !selectedGroupFriendIds.length"
                        @click="createGroupDiscussion"
                      >
                        {{ groupCreating ? '创建中...' : '立即拉群' }}
                      </button>
                    </div>
                  </section>

                  <section class="friend-modal-section">
                    <div class="friend-modal-title-row">
                      <h4>选择好友</h4>
                      <span class="friend-muted-text">可多选</span>
                    </div>
                    <div v-if="friendsLoading" class="friend-muted-text">好友列表加载中...</div>
                    <div v-else-if="!friends.length" class="friend-muted-text">暂无好友，先添加好友后再拉群</div>
                    <div v-else class="group-friend-picker-list">
                      <label
                        v-for="friend in friends"
                        :key="`group-friend-${friend.id}`"
                        class="group-friend-picker-item"
                        :class="{ active: selectedGroupFriendIds.includes(friend.id) }"
                      >
                        <div class="group-friend-picker-main">
                          <AccountUserIdentity
                            size="sm"
                            :avatar-url="getAvatarUrl(friend.avatar_url)"
                            :avatar-alt="friend.username"
                            :name="friend.username"
                            :subtitle="friend.email || '未设置邮箱'"
                            @avatar-error="handleAvatarError"
                          />
                        </div>
                        <input
                          type="checkbox"
                          :checked="selectedGroupFriendIds.includes(friend.id)"
                          @change="toggleGroupFriend(friend.id)"
                        />
                      </label>
                    </div>
                  </section>
            </AccountModalShell>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'
import { docsList } from '../data/docsList'
import NotificationsSection from '../components/NotificationsSection.vue'
import AccountModalShell from '../components/account/AccountModalShell.vue'
import AccountHistoryPanel from '../components/account/AccountHistoryPanel.vue'
import AccountUserIdentity from '../components/account/AccountUserIdentity.vue'
import { useAccountFriends } from '../composables/useAccountFriends'
import { useAccountProfile } from '../composables/useAccountProfile'
import { categoryToZh } from '../utils/category'
import { apiCall } from '../utils/api'
import { fetchPublicDocs } from '../utils/contentApi'
import { normalizeDocs } from '../utils/contentCatalog'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import { getGameCodeTypeIcon, getGameEngineIcon } from '../utils/gameMetadata.js'

const authStore = useAuthStore()
const gameStore = useGameStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const route = useRoute()
const router = useRouter()

const currentUser = computed(() => authStore.currentUser)
const isLoggedIn = computed(() => authStore.isLoggedIn)
const docStars = ref([])
const docStarsLoading = ref(false)
const accountDocs = ref(import.meta.env.DEV ? normalizeDocs(docsList) : [])
const docsCatalogLoaded = ref(false)
const docsById = computed(() => new Map(accountDocs.value.map(doc => [String(doc.id), doc])))

const starredDocs = computed(() => docStars.value
  .map((star) => {
    const doc = docsById.value.get(String(star.docId))
    return doc ? { ...doc, starredAt: star.starredAt } : null
  })
  .filter(Boolean))

const loadAccountDocsCatalog = async () => {
  if (docsCatalogLoaded.value) return

  const apiDocs = await fetchPublicDocs()
  const normalizedDocs = normalizeDocs(apiDocs)
  if (normalizedDocs.length) {
    accountDocs.value = normalizedDocs
  }
  docsCatalogLoaded.value = true
}

const openLoginModal = () => {
  modalStore.openModal('login')
}

const openRegisterModal = () => {
  modalStore.openModal('register')
}

const loadAccountDocStars = async () => {
  if (!isLoggedIn.value) {
    docStars.value = []
    return
  }

  docStarsLoading.value = true

  try {
    const [data] = await Promise.all([
      apiCall('/user/doc-stars'),
      loadAccountDocsCatalog()
    ])
    docStars.value = Array.isArray(data.stars) ? data.stars : []
  } catch (error) {
    docStars.value = []
    notificationStore.error('加载失败', error.message || 'Star 文档加载失败')
  } finally {
    docStarsLoading.value = false
  }
}

const openStarDoc = (doc) => {
  router.push({
    name: 'AiDocs',
    query: { doc: doc.id }
  })
}

const {
  libraryGames,
  libraryLoading,
  avatarInputRef,
  avatarUploading,
  wechatBinding,
  wechatBound,
  wechatBoundLabel,
  googleBinding,
  googleBound,
  googleBoundLabel,
  logoutConfirmPending,
  startWechatBind,
  startGoogleBind,
  logout,
  openAvatarPicker,
  onAvatarFileChange,
  getGameCoverUrl,
  getGameVideoUrl,
  hasPlayableVideo,
  formatSavedDate,
  openLibraryGame
} = useAccountProfile({
  authStore,
  gameStore,
  modalStore,
  notificationStore,
  currentUser,
  isLoggedIn,
  openLoginModal
})

const {
  friends,
  friendsLoading,
  friendModalVisible,
  groupModalVisible,
  groupInviteModalVisible,
  groupTitle,
  selectedGroupFriendIds,
  friendSearchKeyword,
  friendSearching,
  friendSearchResults,
  friendActionLoading,
  inviteExpireMinutes,
  inviteGenerating,
  generatedInviteLink,
  inviteCodeInput,
  inviteRedeeming,
  groupInviteInput,
  groupInviteRedeeming,
  friendRequestsLoading,
  incomingRequests,
  outgoingRequests,
  groupCreating,
  openFriendModal,
  closeFriendModal,
  openGroupInviteModal,
  closeGroupInviteModal,
  openGroupModal,
  closeGroupModal,
  toggleGroupFriend,
  searchFriendUsers,
  sendFriendRequestByUser,
  respondFriendRequest,
  generateFriendInvite,
  copyInviteLink,
  redeemGroupInvite,
  redeemFriendInvite,
  isOpeningFriendChat,
  createGroupDiscussion,
  openFriendDiscussion
} = useAccountFriends({
  route,
  router,
  isLoggedIn,
  notificationStore,
  openLoginModal
})

watch(isLoggedIn, () => {
  loadAccountDocStars()
}, { immediate: true })
</script>

<style scoped src="../styles/account.css"></style>
