<template>
  <section class="comment-section" :class="{ compact }">
    <h4 class="comment-title">{{ title }}</h4>

    <div class="comment-form-wrap">
      <div v-if="!isLoggedIn" class="comment-login">
        请你先<button type="button" class="comment-link" @click="openLoginModal">登录</button>{{ loginSuffix }}
      </div>

      <form v-else class="comment-form" @submit.prevent="submitComment">
        <div v-if="enableRating" class="rating-field">
          <label class="comment-label">你的评分</label>
          <div class="rating-stars">
            <i
              v-for="star in 5"
              :key="star"
              :class="['fa fa-star rating-star', star <= selectedRating ? 'active' : '']"
              @click="selectedRating = star"
            ></i>
          </div>
        </div>

        <textarea
          v-model="commentText"
          class="comment-textarea"
          rows="3"
          :placeholder="commentPlaceholder"
        ></textarea>

        <button type="submit" class="comment-submit">{{ submitLabel }}</button>
      </form>
    </div>

    <div class="comment-list">
      <div v-if="commentsLoading" class="comment-empty">加载评论...</div>
      <div v-else-if="comments.length === 0" class="comment-empty">{{ emptyText }}</div>

      <article
        v-else
        v-for="comment in comments"
        :key="comment.id"
        :id="`comment-${comment.id}`"
        class="comment-item"
      >
        <div class="comment-header">
          <div class="comment-user comment-user-main">
            <AvatarFriendAction :user-id="comment.user_id" :username="comment.username" placement="left">
              <img
                :src="getAvatarUrl(comment.avatar_url)"
                alt="用户头像"
                class="comment-avatar"
                @error="handleAvatarError"
              />
            </AvatarFriendAction>
            <div class="comment-name-row">
              <div class="comment-username">{{ comment.username }}</div>
            </div>
          </div>

          <div v-if="enableRating" class="comment-rating">
            <i v-for="star in Number(comment.rating || 0)" :key="`on-${star}`" class="fa fa-star"></i>
            <i v-for="star in (5 - Number(comment.rating || 0))" :key="`off-${star}`" class="fa fa-star-o"></i>
          </div>
        </div>

        <div class="comment-body">
          <span v-if="!expandedComments.has(comment.id) && comment.comment_text.length > previewLength">
            {{ comment.comment_text.substring(0, previewLength) }}...
            <button type="button" class="comment-link" @click="toggleCommentExpansion(comment.id)">展开</button>
          </span>
          <span v-else-if="expandedComments.has(comment.id)">
            {{ comment.comment_text }}
            <button
              v-if="comment.comment_text.length > previewLength"
              type="button"
              class="comment-link"
              @click="toggleCommentExpansion(comment.id)"
            >
              收起
            </button>
          </span>
          <span v-else>{{ comment.comment_text }}</span>
        </div>

        <div class="comment-actions">
          <span class="comment-time">{{ getTimeAgo(comment.created_at) }}</span>
          <div class="comment-action-buttons">
            <button
              v-if="comment.replies?.length > 0"
              type="button"
              class="comment-small-button"
              @click="toggleRepliesCollapse(comment.id)"
            >
              <i :class="collapsedReplies.has(comment.id) ? 'fa fa-chevron-down' : 'fa fa-chevron-up'"></i>
              {{ collapsedReplies.has(comment.id) ? '展开' : '折叠' }}回复 ({{ comment.replies.length }})
            </button>
            <button type="button" class="comment-small-button" @click="showReplyForm(comment.id, comment.user_id)">回复</button>
          </div>
        </div>

        <div v-if="comment.replies?.length && !collapsedReplies.has(comment.id)" class="reply-list">
          <div v-for="reply in comment.replies" :key="reply.id" :id="`reply-${reply.id}`" class="reply-item">
            <div class="comment-header">
              <div class="comment-user">
                <AvatarFriendAction :user-id="reply.user_id" :username="reply.username" placement="left">
                  <img
                    :src="getAvatarUrl(reply.avatar_url)"
                    alt="用户头像"
                    class="reply-avatar"
                    @error="handleAvatarError"
                  />
                </AvatarFriendAction>
                <div class="comment-name-row">
                  <div class="comment-username small">{{ reply.username }}</div>
                </div>
              </div>
              <button type="button" class="comment-small-button" @click="showReplyForm(comment.id, reply.user_id, reply.id)">
                回复
              </button>
            </div>

            <div class="reply-body">
              <span v-if="!expandedReplies.has(reply.id) && reply.comment_text.length > previewLength">
                {{ reply.comment_text.substring(0, previewLength) }}...
                <button type="button" class="comment-link" @click="toggleReplyExpansion(reply.id)">展开</button>
              </span>
              <span v-else-if="expandedReplies.has(reply.id)">
                {{ reply.comment_text }}
                <button
                  v-if="reply.comment_text.length > previewLength"
                  type="button"
                  class="comment-link"
                  @click="toggleReplyExpansion(reply.id)"
                >
                  收起
                </button>
              </span>
              <span v-else>{{ reply.comment_text }}</span>
            </div>
            <div class="comment-time">{{ getTimeAgo(reply.created_at) }}</div>

            <div v-if="activeReplyForm === reply.id" class="reply-form">
              <div class="reply-target">
                回复 <span>{{ reply.username }}</span> 的{{ modeLabel }}：
              </div>
              <textarea
                v-model="replyText"
                class="reply-textarea"
                rows="3"
                placeholder="写下你的回复..."
              ></textarea>
              <div class="reply-actions">
                <button type="button" class="reply-button" @click="hideReplyForm">取消</button>
                <button type="button" class="reply-button primary" @click="submitReply">发送</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeReplyForm === comment.id" class="reply-form main-reply-form">
          <div v-if="replyToUserId" class="reply-target">
            回复 <span>{{ getReplyTargetName(comment.id, replyToUserId) }}</span> 的{{ modeLabel }}：
          </div>
          <textarea
            v-model="replyText"
            class="reply-textarea"
            rows="3"
            placeholder="写下你的回复..."
          ></textarea>
          <div class="reply-actions">
            <button type="button" class="reply-button" @click="hideReplyForm">取消</button>
            <button type="button" class="reply-button primary" @click="submitReply">发送</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AvatarFriendAction from './AvatarFriendAction.vue'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'
import { apiCall } from '../utils/api'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import { getCommentEndpoint } from '../utils/commentTarget'

const props = defineProps({
  targetType: { type: String, required: true },
  targetId: { type: [String, Number], required: true },
  title: { type: String, default: '评论&评价' },
  modeLabel: { type: String, default: '评论' },
  enableRating: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  closeBeforeLogin: { type: Boolean, default: false },
  listenForScrollEvents: { type: Boolean, default: false },
  previewLength: { type: Number, default: 24 }
})

const authStore = useAuthStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()

const isLoggedIn = computed(() => authStore.isLoggedIn)
const comments = ref([])
const commentsLoading = ref(false)
const selectedRating = ref(0)
const commentText = ref('')
const activeReplyForm = ref(null)
const replyText = ref('')
const replyToUserId = ref(null)
const expandedComments = ref(new Set())
const expandedReplies = ref(new Set())
const collapsedReplies = ref(new Set())
const targetCommentId = ref(null)

const endpoint = computed(() => getCommentEndpoint(props.targetType, props.targetId))
const isDiscussionMode = computed(() => props.modeLabel === '讨论')
const loginSuffix = computed(() => isDiscussionMode.value ? '才能参与讨论' : '才能评论')
const commentPlaceholder = computed(() => isDiscussionMode.value ? '写下你的想法...' : '请写下您的评论...')
const submitLabel = computed(() => isDiscussionMode.value ? '发布讨论' : '发布评论')
const emptyText = computed(() => (
  isDiscussionMode.value
    ? '暂无讨论，成为第一个发起讨论的人吧！'
    : '暂无评论，成为第一个评论者吧！'
))

const loadComments = async () => {
  if (!props.targetId) return
  commentsLoading.value = true
  try {
    comments.value = await apiCall(endpoint.value)
  } catch (error) {
    console.error('Failed to load comments:', error)
    comments.value = []
  } finally {
    commentsLoading.value = false
  }
}

const submitComment = async () => {
  if (!isLoggedIn.value) return
  if (props.enableRating && selectedRating.value === 0) {
    notificationStore.warning('请选择评分', '请为内容选择一个评分')
    return
  }
  if (!commentText.value.trim()) {
    notificationStore.warning(`请输入${props.modeLabel}内容`, `${props.modeLabel}内容不能为空`)
    return
  }

  try {
    await apiCall(endpoint.value, {
      method: 'POST',
      body: JSON.stringify({
        rating: props.enableRating ? selectedRating.value : undefined,
        commentText: commentText.value
      })
    })
    commentText.value = ''
    selectedRating.value = 0
    await loadComments()
    notificationStore.success('发布成功', `${props.modeLabel}发布成功！`)
  } catch (error) {
    notificationStore.error('发布失败', error.message || `${props.modeLabel}发布失败`)
  }
}

const showReplyForm = (commentId, userId = null, replyId = null) => {
  activeReplyForm.value = replyId || commentId
  replyToUserId.value = userId
  replyText.value = ''
}

const hideReplyForm = () => {
  activeReplyForm.value = null
  replyToUserId.value = null
  replyText.value = ''
}

const submitReply = async () => {
  if (!isLoggedIn.value) return
  if (!replyText.value.trim()) {
    notificationStore.warning('回复内容不能为空', '请输入回复内容')
    return
  }

  const targetId = activeReplyForm.value
  let parentCommentId = null
  for (const comment of comments.value) {
    if (comment.id === targetId) {
      parentCommentId = targetId
      break
    }
    if (comment.replies?.some(reply => reply.id === targetId)) {
      parentCommentId = comment.id
      break
    }
  }

  if (!parentCommentId) return

  try {
    const revealParentId = parentCommentId
    await apiCall(`${endpoint.value}/${parentCommentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({
        commentText: replyText.value,
        replyToUserId: replyToUserId.value
      })
    })
    hideReplyForm()
    await loadComments()
    collapsedReplies.value.delete(revealParentId)
    notificationStore.success('回复成功', '回复发布成功！')
  } catch (error) {
    notificationStore.error('回复失败', error.message || '回复发布失败')
  }
}

const openLoginModal = () => {
  if (props.closeBeforeLogin) {
    modalStore.closeModal()
    setTimeout(() => modalStore.openModal('login'), 300)
    return
  }
  modalStore.openModal('login')
}

const getTimeAgo = (dateString) => {
  const now = new Date()
  const date = new Date(dateString)
  const diffInSeconds = Math.floor((now - date) / 1000)
  if (diffInSeconds < 60) return '刚刚'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}天前`
  return `${Math.floor(diffInSeconds / 2592000)}个月前`
}

const getReplyTargetName = (commentId, userId) => {
  const comment = comments.value.find(c => c.id === commentId)
  if (!comment) return '未知用户'
  if (comment.user_id === userId) return comment.username
  const reply = comment.replies?.find(r => r.user_id === userId)
  return reply ? reply.username : '未知用户'
}

const toggleCommentExpansion = (commentId) => {
  expandedComments.value.has(commentId)
    ? expandedComments.value.delete(commentId)
    : expandedComments.value.add(commentId)
}

const toggleReplyExpansion = (replyId) => {
  expandedReplies.value.has(replyId)
    ? expandedReplies.value.delete(replyId)
    : expandedReplies.value.add(replyId)
}

const toggleRepliesCollapse = (commentId) => {
  collapsedReplies.value.has(commentId)
    ? collapsedReplies.value.delete(commentId)
    : collapsedReplies.value.add(commentId)
}

const scrollToComment = (commentId) => {
  nextTick(() => {
    let parentCommentId = null
    let isReply = false

    for (const comment of comments.value) {
      if (comment.replies?.some(reply => reply.id === commentId)) {
        parentCommentId = comment.id
        isReply = true
        break
      }
    }

    if (isReply && parentCommentId) {
      collapsedReplies.value.delete(parentCommentId)
      nextTick(() => highlightComment(`reply-${commentId}`))
      return
    }

    highlightComment(`comment-${commentId}`)
  })
}

const highlightComment = (elementId) => {
  const targetElement = document.getElementById(elementId)
  if (!targetElement) return
  targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => {
    targetElement.classList.add('highlight-comment')
    setTimeout(() => targetElement.classList.remove('highlight-comment'), 5000)
  }, 500)
}

const handleScrollToComment = (event) => {
  if (!props.listenForScrollEvents) return
  targetCommentId.value = event.detail?.commentId || null
  if (targetCommentId.value && comments.value.length > 0) {
    scrollToComment(targetCommentId.value)
  }
}

watch(endpoint, () => {
  comments.value = []
  activeReplyForm.value = null
  collapsedReplies.value = new Set()
  loadComments()
}, { immediate: true })

watch(comments, (newComments) => {
  newComments.forEach((comment) => {
    if (comment.replies?.length > 0 && !collapsedReplies.value.has(comment.id)) {
      collapsedReplies.value.add(comment.id)
    }
  })

  if (targetCommentId.value) {
    scrollToComment(targetCommentId.value)
    setTimeout(() => {
      targetCommentId.value = null
    }, 1000)
  }
}, { deep: true })

onMounted(() => {
  window.addEventListener('scroll-to-comment', handleScrollToComment)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll-to-comment', handleScrollToComment)
})
</script>

<style scoped>
.comment-section {
  --comment-bg: #ffffff;
  --comment-text: #111111;
  --comment-muted: rgba(17, 17, 17, 0.62);
  --comment-soft: rgba(17, 17, 17, 0.1);
  --comment-panel: rgba(17, 17, 17, 0.045);
  --comment-panel-strong: rgba(17, 17, 17, 0.08);
  --comment-focus: rgba(17, 17, 17, 0.18);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--comment-text);
}

[data-theme='dark'] .comment-section {
  --comment-bg: #000000;
  --comment-text: #f5f5f5;
  --comment-muted: rgba(245, 245, 245, 0.66);
  --comment-soft: rgba(245, 245, 245, 0.16);
  --comment-panel: rgba(245, 245, 245, 0.08);
  --comment-panel-strong: rgba(245, 245, 245, 0.12);
  --comment-focus: rgba(245, 245, 245, 0.28);
}

.comment-title {
  margin: 0 0 1rem;
  font-size: 1.08rem;
  font-weight: 700;
  color: var(--comment-text);
}

.comment-form-wrap {
  margin-bottom: 1.35rem;
}

.comment-login,
.comment-empty {
  padding: 1rem 0;
  text-align: center;
  color: var(--comment-muted);
}

.comment-link,
.comment-small-button {
  border: 0;
  background: transparent;
  color: var(--comment-text);
  cursor: pointer;
}

.comment-link {
  padding: 0 0.2rem;
  text-decoration: underline;
}

.comment-form {
  display: grid;
  gap: 0.75rem;
}

.comment-label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.rating-stars {
  display: flex;
  gap: 0.16rem;
  font-size: 1.45rem;
}

.rating-star {
  color: var(--comment-soft);
  cursor: pointer;
}

.rating-star.active,
.comment-rating {
  color: #facc15;
}

.comment-textarea,
.reply-textarea {
  width: 100%;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--comment-soft);
  border-radius: 12px;
  outline: none;
  resize: vertical;
  background: var(--comment-panel);
  color: var(--comment-text);
}

.comment-textarea::placeholder,
.reply-textarea::placeholder {
  color: var(--comment-muted);
}

.comment-textarea:focus,
.reply-textarea:focus {
  border-color: var(--comment-focus);
  box-shadow: 0 0 0 2px var(--comment-focus);
}

.comment-submit,
.reply-button {
  border: 1px solid var(--comment-soft);
  border-radius: 12px;
  background: var(--comment-panel-strong);
  color: var(--comment-text);
  cursor: pointer;
  transition: background 0.2s ease;
}

.comment-submit {
  width: 100%;
  padding: 0.62rem 0.8rem;
}

.comment-submit:hover,
.reply-button:hover {
  background: var(--comment-panel);
}

.comment-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.4rem;
}

.compact .comment-list {
  max-height: 560px;
  overflow-y: auto;
}

.comment-item {
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--comment-soft);
}

.comment-header,
.comment-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.comment-user,
.comment-name-row,
.comment-action-buttons {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.comment-user-main {
  flex: 1;
}

.comment-name-row {
  flex-wrap: wrap;
}

.comment-username {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.comment-username.small {
  font-size: 0.88rem;
}

.comment-rating {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 0.88rem;
}

.comment-avatar,
.reply-avatar {
  border-radius: 9999px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--comment-soft);
}

.comment-avatar {
  width: 28px;
  height: 28px;
}

.reply-avatar {
  width: 22px;
  height: 22px;
}

.comment-body {
  margin: 0.45rem 0 0.4rem;
  font-size: 0.92rem;
  color: var(--comment-muted);
  overflow-wrap: anywhere;
}

.reply-body {
  margin: 0.35rem 0;
  font-size: 0.82rem;
  color: var(--comment-muted);
  overflow-wrap: anywhere;
}

.comment-time {
  font-size: 0.75rem;
  color: var(--comment-muted);
}

.comment-small-button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  font-size: 0.75rem;
}

.reply-list {
  display: grid;
  gap: 0.65rem;
  margin: 0.8rem 0 0 1rem;
}

.reply-item {
  padding-left: 0.75rem;
  border-left: 2px solid var(--comment-soft);
}

.reply-form {
  margin-top: 0.85rem;
  display: grid;
  gap: 0.55rem;
  background: transparent;
}

.main-reply-form {
  margin-left: 1rem;
}

.reply-target {
  margin-bottom: 0.5rem;
  font-size: 0.78rem;
  color: var(--comment-muted);
}

.reply-target span {
  color: var(--comment-text);
  font-weight: 600;
}

.reply-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  margin-top: -0.05rem;
}

.reply-button {
  min-width: 5.2rem;
  min-height: 2.5rem;
  padding: 0.42rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
}

.reply-button.primary {
  background: var(--comment-text);
  color: var(--comment-bg, #ffffff);
  border-color: var(--comment-text);
}

.highlight-comment {
  background: rgba(108, 92, 231, 0.22) !important;
  border-radius: 12px !important;
  box-shadow: 0 0 20px rgba(108, 92, 231, 0.35) !important;
  animation: highlight-pulse 2s ease-in-out;
  transition: all 0.3s ease !important;
}

@keyframes highlight-pulse {
  0% { transform: scale(1); }
  25% { transform: scale(1.03); }
  50% { transform: scale(1.01); }
  75% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

@media (max-width: 640px) {
  .comment-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .comment-action-buttons {
    flex-wrap: wrap;
  }
}
</style>
