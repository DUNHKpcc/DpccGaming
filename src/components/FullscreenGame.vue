<template>
  <div v-if="isFullscreen" class="fullscreen-game-container active">
    <div class="fullscreen-game-content">
      <div
        v-if="currentGame && (getEngineLogo(currentGame) || getCodeLogo(currentGame))"
        class="absolute top-4 left-4 z-20 flex items-center gap-4 rounded-full bg-black/45 backdrop-blur-sm px-4 py-2 text-sm text-white"
      >
        <span v-if="getEngineLogo(currentGame)" class="inline-flex items-center gap-2">
          <img :src="getEngineLogo(currentGame)" alt="游戏引擎" class="w-4 h-4 object-contain" />
          <span>{{ currentGame.engine || currentGame.game_engine || '未知引擎' }}</span>
        </span>
        <span v-if="getCodeLogo(currentGame)" class="inline-flex items-center gap-2">
          <img :src="getCodeLogo(currentGame)" alt="游戏代码" class="w-4 h-4 object-contain" />
          <span>{{ currentGame.code_type || currentGame.codeType || '未知代码' }}</span>
        </span>
      </div>
      <iframe 
        ref="gameFrame"
        frameborder="0" 
        class="game-vertical-container"
        :style="gameFrameStyle"
        :src="gameLaunchUrl"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation"
        allow="fullscreen; autoplay; microphone; camera; gamepad"
        @load="onGameFrameLoad"
        @click="focusGameFrame"
        tabindex="0">
      </iframe>
    </div>
    
    <!-- 全屏评论面板 -->
    <div v-if="showComments" class="fullscreen-comments-panel active">
      <div class="comments-header">
        <div class="comments-drag-bar" @click="hideComments"></div>
        <h3 class="text-xl font-bold text-white">游戏评论</h3>
        <button @click="hideComments" class="text-white hover:text-white/80 text-2xl transition-colors duration-300">
          <i class="fa fa-times"></i>
        </button>
      </div>
      
      <div class="comments-content">
        <!-- 评论表单 -->
        <div class="mb-6">
          <div v-if="!isLoggedIn" class="text-center py-4 text-white/80">
            请你先<button @click="openLoginModal" class="text-white hover:text-white/80 hover:underline transition-colors duration-300">登录</button>才能评论
          </div>

          <form v-else @submit.prevent="submitComment" class="space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1 text-white">你的评分</label>
              <div class="flex text-2xl">
                <i v-for="star in 5" :key="star"
                  :class="['fa fa-star cursor-pointer fullscreen-rating-star', star <= selectedRating ? 'text-yellow-400' : 'text-white/30']"
                  @click="selectedRating = star">
                </i>
              </div>
            </div>
            <div>
              <textarea v-model="commentText" rows="3"
                class="w-full px-3 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300"
                placeholder="请写下您的评论..."></textarea>
            </div>
            <button type="submit"
              class="w-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/30 text-white py-2 rounded-xl transition-all duration-300">
              发布评论
            </button>
          </form>
        </div>

        <!-- 评论列表 -->
        <div class="space-y-4">
          <div v-if="commentsLoading" class="text-center py-4 text-white/80">加载评论...</div>
          <div v-else-if="comments.length === 0" class="text-center py-4 text-white/80">暂无评论，成为第一个评论者吧！</div>
          <div v-else v-for="comment in comments" :key="comment.id" class="mb-4 pb-4 border-b border-white/20">
            <div class="comment-header">
              <div class="comment-user comment-user-main">
                <AvatarFriendAction
                  :user-id="comment.user_id"
                  :username="comment.username"
                  placement="left"
                >
                  <img
                    :src="getAvatarUrl(comment.avatar_url)"
                    alt="用户头像"
                    class="comment-avatar"
                    @error="handleAvatarError"
                  />
                </AvatarFriendAction>
                <div class="comment-name-row">
                  <div class="comment-username font-medium text-white">{{ comment.username }}</div>
                </div>
              </div>
              <div class="comment-rating text-yellow-400 text-sm">
                <i v-for="star in comment.rating" :key="star" class="fa fa-star"></i>
                <i v-for="star in (5 - comment.rating)" :key="star" class="fa fa-star-o"></i>
              </div>
            </div>
            <div class="text-sm text-white/80 mb-1">
              <span v-if="!expandedComments.has(comment.id) && comment.comment_text.length > 24">
                {{ comment.comment_text.substring(0, 24) }}...
                <button @click="toggleCommentExpansion(comment.id)" class="text-white hover:text-white/80 underline ml-1 transition-colors duration-300">
                  展开
                </button>
              </span>
              <span v-else-if="expandedComments.has(comment.id)">
                {{ comment.comment_text }}
                <button v-if="comment.comment_text.length > 24" @click="toggleCommentExpansion(comment.id)" class="text-white hover:text-white/80 underline ml-1 transition-colors duration-300">
                  收起
                </button>
              </span>
              <span v-else>{{ comment.comment_text }}</span>
            </div>
            <div class="flex justify-between items-center">
              <div class="text-xs text-white/60">{{ getTimeAgo(comment.created_at) }}</div>
              <div class="flex items-center gap-2">
                <!-- 折叠/展开回复按钮 -->
                <button 
                  v-if="comment.replies?.length > 0" 
                  @click="toggleRepliesCollapse(comment.id)" 
                  class="text-xs text-white/80 hover:text-white transition-colors duration-300 flex items-center gap-1">
                  <i :class="collapsedReplies.has(comment.id) ? 'fa fa-chevron-down' : 'fa fa-chevron-up'"></i>
                  {{ collapsedReplies.has(comment.id) ? '展开' : '折叠' }}回复 ({{ comment.replies.length }})
                </button>
                <button @click="showReplyForm(comment.id, comment.user_id)" class="text-xs text-white/80 hover:text-white transition-colors duration-300">
                  回复
                </button>
              </div>
            </div>
            
            <!-- 回复列表 -->
            <div v-if="comment.replies?.length && !collapsedReplies.has(comment.id)" class="mt-3 ml-4 space-y-2">
              <div v-for="reply in comment.replies" :key="reply.id" class="mb-2 pb-2 border-l-2 border-white/20 pl-3">
                <div class="comment-header">
                  <div class="comment-user">
                    <AvatarFriendAction
                      :user-id="reply.user_id"
                      :username="reply.username"
                      placement="left"
                    >
                      <img
                        :src="getAvatarUrl(reply.avatar_url)"
                        alt="用户头像"
                        class="reply-avatar"
                        @error="handleAvatarError"
                      />
                    </AvatarFriendAction>
                    <div class="comment-name-row">
                      <div class="comment-username font-medium text-sm text-white">{{ reply.username }}</div>
                    </div>
                  </div>
                  <button @click="showReplyForm(comment.id, reply.user_id, reply.id)" class="text-xs text-white/80 hover:text-white transition-colors duration-300">
                    回复
                  </button>
                </div>
                <div class="text-xs text-white/80 mb-1">
                  <span v-if="!expandedReplies.has(reply.id) && reply.comment_text.length > 24">
                    {{ reply.comment_text.substring(0, 24) }}...
                    <button @click="toggleReplyExpansion(reply.id)" class="text-white hover:text-white/80 underline ml-1 transition-colors duration-300">
                      展开
                    </button>
                  </span>
                  <span v-else-if="expandedReplies.has(reply.id)">
                    {{ reply.comment_text }}
                    <button v-if="reply.comment_text.length > 24" @click="toggleReplyExpansion(reply.id)" class="text-white hover:text-white/80 underline ml-1 transition-colors duration-300">
                      收起
                    </button>
                  </span>
                  <span v-else>{{ reply.comment_text }}</span>
                </div>
                <div class="text-xs text-white/60">{{ getTimeAgo(reply.created_at) }}</div>
                
                <!-- 回复表单 - 显示在具体回复下面 -->
                <div v-if="activeReplyForm === reply.id" class="mt-3">
                  <div class="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                    <!-- 显示回复目标 -->
                    <div v-if="replyToUserId" class="mb-2 text-xs text-white/80">
                      回复 <span class="text-white font-medium">{{ reply.username }}</span> 的评论：
                    </div>
                    <textarea v-model="replyText" class="w-full p-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300" placeholder="写下你的回复..." rows="2"></textarea>
                    <div class="flex justify-end mt-2 space-x-2">
                      <button @click="hideReplyForm" class="px-3 py-1 text-xs bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-lg hover:bg-white/30 transition-all duration-300">取消</button>
                      <button @click="submitReply(comment.id)" class="px-3 py-1 text-xs bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-lg hover:bg-white/30 transition-all duration-300">发送</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 回复表单 -->
            <div v-if="activeReplyForm === comment.id" class="mt-3 ml-4">
              <div class="bg-white/10 backdrop-blur-sm p-3 rounded-xl border border-white/20">
                <!-- 显示回复目标 -->
                <div v-if="replyToUserId" class="mb-2 text-xs text-white/80">
                  回复 <span class="text-white font-medium">{{ getReplyTargetName(comment.id, replyToUserId) }}</span> 的评论：
                </div>
                <textarea v-model="replyText" class="w-full p-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg text-white placeholder-white/60 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all duration-300" placeholder="写下你的回复..." rows="2"></textarea>
                <div class="flex justify-end mt-2 space-x-2">
                  <button @click="hideReplyForm" class="px-3 py-1 text-xs bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-lg hover:bg-white/30 transition-all duration-300">取消</button>
                  <button @click="submitReply(comment.id)" class="px-3 py-1 text-xs bg-white/20 backdrop-blur-sm border border-white/30 text-white rounded-lg hover:bg-white/30 transition-all duration-300">发送</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="fullscreen-controls">
      <button @click="exitFullscreen" class="fullscreen-control-btn" title="退出全屏">
        <i class="fa fa-times"></i>
      </button>
      <button @click="toggleComments" class="fullscreen-control-btn" title="查看评论">
        <i class="fa fa-comments"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useModalStore } from '../stores/modal'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useNotificationStore } from '../stores/notification'
import { setupGameEventHandling, focusGameIframe } from '../utils/gameEvents'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import AvatarFriendAction from './AvatarFriendAction.vue'

const modalStore = useModalStore()
const authStore = useAuthStore()
const gameStore = useGameStore()
const notificationStore = useNotificationStore()

const isFullscreen = computed(() => modalStore.isFullscreen)
const currentGame = computed(() => modalStore.currentGame)
const isLoggedIn = computed(() => authStore.isLoggedIn)
const comments = computed(() => gameStore.comments)
const getEngineLogo = (game) => {
  const engine = String(game?.engine || game?.game_engine || '').trim().toLowerCase()
  if (engine.includes('cocos')) return '/engineType/cocos.webp'
  if (engine.includes('unity')) return '/engineType/unity.webp'
  if (engine.includes('godot')) return '/engineType/godot.webp'
  return ''
}

const getCodeLogo = (game) => {
  const codeType = String(game?.code_type || game?.codeType || '').trim().toLowerCase()
  if (codeType === 'typescript' || codeType === 'ts') return '/codeType/typescript.jpg'
  if (codeType === 'javascript' || codeType === 'js') return '/codeType/js.webp'
  if (codeType === 'c#' || codeType === 'csharp' || codeType === 'cs') return '/codeType/csharp.webp'
  return ''
}

const gameLaunchUrl = computed(() => {
  if (!currentGame.value) return ''
  const rawUrl =
    currentGame.value.launch_url ||
    currentGame.value.game_url ||
    `games/${currentGame.value.game_id || currentGame.value.id}/index.html`
  return resolveMediaUrl(rawUrl)
})

const gameFrame = ref(null)
const showComments = ref(false)
const commentsLoading = ref(false)
const selectedRating = ref(0)
const commentText = ref('')
const activeReplyForm = ref(null)
const replyText = ref('')
const replyToUserId = ref(null)
const expandedComments = ref(new Set()) // 存储展开的评论ID
const expandedReplies = ref(new Set()) // 存储展开的回复ID
const collapsedReplies = ref(new Set()) // 存储折叠的回复列表ID
const fetchedDesignResolution = ref(null)
const getInitialViewportSize = () => ({
  width: typeof window !== 'undefined' ? window.innerWidth : defaultGameDimensions.width,
  height: typeof window !== 'undefined' ? window.innerHeight : defaultGameDimensions.height
})
const viewportSize = ref(getInitialViewportSize())

const defaultGameDimensions = { width: 960, height: 540 }
const dimensionKeyMap = {
  width: ['width', 'game_width', 'resolution_width', 'design_width', 'canvas_width'],
  height: ['height', 'game_height', 'resolution_height', 'design_height', 'canvas_height']
}

const getContentPadding = () => {
  const viewportWidth = viewportSize.value.width
  if (viewportWidth <= 480) return 6
  if (viewportWidth <= 768) return 10
  return 20
}

const getCommentsPanelWidth = () => {
  if (!showComments.value) return 0
  const viewportWidth = viewportSize.value.width
  if (viewportWidth <= 480) return Math.min(viewportWidth, 300)
  if (viewportWidth <= 768) return Math.min(viewportWidth, 350)
  return 400
}

const parseDimensionValue = (value) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const match = value.match(/(\d+(\.\d+)?)/)
    if (match) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
  }
  return null
}

const deriveDimensionsFromGame = (game) => {
  if (!game) return { ...defaultGameDimensions }
  const widthCandidate = dimensionKeyMap.width
    .map(key => parseDimensionValue(game[key]))
    .find(Boolean)
  const heightCandidate = dimensionKeyMap.height
    .map(key => parseDimensionValue(game[key]))
    .find(Boolean)

  const width = widthCandidate || (heightCandidate ? Math.round(heightCandidate * (defaultGameDimensions.width / defaultGameDimensions.height)) : defaultGameDimensions.width)
  const height = heightCandidate || (widthCandidate ? Math.round(widthCandidate * (defaultGameDimensions.height / defaultGameDimensions.width)) : defaultGameDimensions.height)

  return {
    width,
    height
  }
}

const gameDimensions = ref(deriveDimensionsFromGame(currentGame.value))

const gameFrameStyle = computed(() => {
  const { width, height } = gameDimensions.value
  const designWidth = Math.max(width || defaultGameDimensions.width, 1)
  const designHeight = Math.max(height || defaultGameDimensions.height, 1)
  const viewportWidth = viewportSize.value.width || designWidth
  const viewportHeight = viewportSize.value.height || designHeight

  const horizontalPadding = getContentPadding() * 2
  const verticalPadding = getContentPadding() * 2
  const availableWidth = Math.max(viewportWidth - getCommentsPanelWidth() - horizontalPadding, 120)
  const availableHeight = Math.max(viewportHeight - verticalPadding, 120)

  const widthScale = availableWidth / designWidth
  const heightScale = availableHeight / designHeight
  const scale = Math.min(widthScale, heightScale, 1)

  const finalWidth = Math.max(designWidth * scale, 1)
  const finalHeight = Math.max(designHeight * scale, 1)

  return {
    width: `${finalWidth}px`,
    height: `${finalHeight}px`,
    maxWidth: '100%',
    maxHeight: '100%'
  }
})

let measureTimer = null
const designResolutionCache = new Map()

const loadComments = async () => {
  if (!currentGame.value) return
  
  commentsLoading.value = true
  try {
    await gameStore.loadComments(currentGame.value.game_id || currentGame.value.id)
  } finally {
    commentsLoading.value = false
  }
}

const submitComment = async () => {
  if (!currentGame.value || !isLoggedIn.value) return
  
  if (selectedRating.value === 0) {
    notificationStore.warning('请选择评分', '请为游戏选择一个评分')
    return
  }
  
  if (!commentText.value.trim()) {
    notificationStore.warning('请输入评论内容', '评论内容不能为空')
    return
  }

  const result = await gameStore.submitComment(currentGame.value.game_id || currentGame.value.id, selectedRating.value, commentText.value)
  
  if (result.success) {
    commentText.value = ''
    selectedRating.value = 0
    notificationStore.success('评论成功', result.message)
  } else {
    notificationStore.error('评论失败', result.message)
  }
}

const showReplyForm = (commentId, userId = null, replyId = null) => {
  // 如果replyId存在，说明是回复某个具体的回复
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
  if (!currentGame.value || !isLoggedIn.value) return
  
  if (!replyText.value.trim()) {
    notificationStore.warning('回复内容不能为空', '请输入回复内容')
    return
  }

  // 确定要回复的评论ID
  let targetCommentId = activeReplyForm.value
  
  // 如果activeReplyForm是回复的ID，需要找到对应的主评论ID
  const comments = gameStore.comments
  let parentCommentId = null
  
  for (const comment of comments) {
    if (comment.id === targetCommentId) {
      // 直接回复主评论
      parentCommentId = targetCommentId
      break
    } else if (comment.replies?.some(reply => reply.id === targetCommentId)) {
      // 回复某个回复，需要回复到主评论
      parentCommentId = comment.id
      break
    }
  }

  if (!parentCommentId) {
    console.error('Could not find parent comment for reply')
    return
  }

  const result = await gameStore.submitReply(
    currentGame.value.game_id || currentGame.value.id, 
    parentCommentId, 
    replyText.value, 
    replyToUserId.value
  )
  
  if (result.success) {
    hideReplyForm()
    notificationStore.success('回复成功', result.message)
  } else {
    notificationStore.error('回复失败', result.message)
  }
}

const toggleComments = () => {
  showComments.value = !showComments.value
  if (showComments.value) {
    loadComments()
  }
}

const hideComments = () => {
  showComments.value = false
}

const exitFullscreen = () => {
  modalStore.exitFullscreen()
}

const openLoginModal = () => {
  modalStore.exitFullscreen()
  setTimeout(() => {
    modalStore.openModal('login')
  }, 300)
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
  
  // 如果是回复主评论
  if (comment.user_id === userId) {
    return comment.username
  }
  
  // 如果是回复回复
  const reply = comment.replies?.find(r => r.user_id === userId)
  return reply ? reply.username : '未知用户'
}

// 折叠功能方法
const toggleCommentExpansion = (commentId) => {
  if (expandedComments.value.has(commentId)) {
    expandedComments.value.delete(commentId)
  } else {
    expandedComments.value.add(commentId)
  }
}

const toggleReplyExpansion = (replyId) => {
  if (expandedReplies.value.has(replyId)) {
    expandedReplies.value.delete(replyId)
  } else {
    expandedReplies.value.add(replyId)
  }
}

// 折叠/展开回复列表
const toggleRepliesCollapse = (commentId) => {
  if (collapsedReplies.value.has(commentId)) {
    collapsedReplies.value.delete(commentId)
  } else {
    collapsedReplies.value.add(commentId)
  }
}

const extractDesignResolution = (data) => {
  if (!data || typeof data !== 'object') return null
  const candidates = [
    data.screen?.designResolution,
    data.designResolution,
    data.project?.designResolution
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const width = parseDimensionValue(candidate.width ?? candidate[0])
    const height = parseDimensionValue(candidate.height ?? candidate[1])
    if (width && height) {
      const orientation = data.screen?.orientation || data.orientation
      if (orientation === 'portrait' && width > height) {
        return { width: height, height: width }
      }
      if (orientation === 'landscape' && height > width) {
        return { width: height, height: width }
      }
      return { width, height }
    }
  }
  return null
}

const getGameBaseUrl = (url) => {
  if (!url) return null
  if (typeof window === 'undefined') return null
  try {
    const absolute = new URL(url, window.location.origin)
    absolute.hash = ''
    absolute.search = ''
    absolute.pathname = absolute.pathname.replace(/\/[^/]*$/, '/') || '/'
    return absolute.toString()
  } catch {
    return null
  }
}

const fetchDesignResolution = async (launchUrl) => {
  const baseUrl = getGameBaseUrl(launchUrl)
  if (!baseUrl) return null

  if (designResolutionCache.has(baseUrl)) {
    return designResolutionCache.get(baseUrl)
  }

  const candidates = [
    'src/settings.json',
    'settings.json',
    'project.json',
    'game.json',
    'config.json'
  ]

  for (const candidate of candidates) {
    const targetUrl = new URL(candidate, baseUrl).toString()
    try {
      const response = await fetch(targetUrl, { method: 'GET' })
      if (!response.ok) continue
      const data = await response.json()
      const resolution = extractDesignResolution(data)
      if (resolution) {
        designResolutionCache.set(baseUrl, resolution)
        return resolution
      }
    } catch {
      /* ignore fetch errors */
    }
  }

  designResolutionCache.set(baseUrl, null)
  return null
}

const applyDesignResolution = (resolution) => {
  if (!resolution) return
  gameDimensions.value = {
    width: resolution.width,
    height: resolution.height
  }
  fetchedDesignResolution.value = resolution
}

const ensureDesignResolution = async () => {
  if (!gameLaunchUrl.value) return
  const resolution = await fetchDesignResolution(gameLaunchUrl.value)
  if (resolution) {
    applyDesignResolution(resolution)
  }
}

const syncGameDimensionsFromIframe = () => {
  const frame = gameFrame.value
  if (!frame) return

  try {
    const doc = frame.contentDocument || frame.contentWindow?.document
    if (!doc) return

    const target =
      doc.getElementById('GameDiv') ||
      doc.getElementById('GameCanvas') ||
      doc.querySelector('#GameDiv canvas') ||
      doc.querySelector('canvas') ||
      doc.body

    if (!target) return

    const intrinsicWidth = parseDimensionValue(target.getAttribute?.('width')) || target.width
    const intrinsicHeight = parseDimensionValue(target.getAttribute?.('height')) || target.height

    const rect = target.getBoundingClientRect()
    const measuredWidth = Math.round(intrinsicWidth || rect.width || target.scrollWidth || defaultGameDimensions.width)
    const measuredHeight = Math.round(intrinsicHeight || rect.height || target.scrollHeight || defaultGameDimensions.height)

    if (measuredWidth > 0 && measuredHeight > 0) {
      gameDimensions.value = {
        width: measuredWidth,
        height: measuredHeight
      }
    }
  } catch (error) {
    console.warn('自动测量游戏尺寸失败:', error)
  }
}

const scheduleGameDimensionMeasure = (delay = 120) => {
  if (typeof window === 'undefined') return
  if (measureTimer) {
    window.clearTimeout(measureTimer)
  }
  measureTimer = window.setTimeout(() => {
    syncGameDimensionsFromIframe()
  }, Math.max(delay, 16))
}

const updateViewportSize = () => {
  if (typeof window === 'undefined') return
  viewportSize.value = {
    width: window.innerWidth,
    height: window.innerHeight
  }
}

const handleViewportResize = () => {
  updateViewportSize()
  scheduleGameDimensionMeasure(0)
}

watch(currentGame, (newGame) => {
  gameDimensions.value = deriveDimensionsFromGame(newGame)
  scheduleGameDimensionMeasure(200)
})

watch(gameLaunchUrl, (newUrl) => {
  if (!newUrl) return
  fetchedDesignResolution.value = null
  ensureDesignResolution()
}, { immediate: true })

watch(showComments, () => {
  scheduleGameDimensionMeasure(0)
})

const handleKeydown = (e) => {
  // 如果游戏iframe有焦点，不拦截键盘事件
  if (gameFrame.value && document.activeElement === gameFrame.value) {
    return
  }
  
  // 只有ESC键用于退出全屏
  if (e.key === 'Escape' && isFullscreen.value) {
    exitFullscreen()
  }
}

// 游戏iframe加载完成后的处理
const onGameFrameLoad = () => {
  if (gameFrame.value) {
    // 设置游戏事件处理
    setupGameEventHandling(gameFrame.value, {
      enableKeyboardEvents: true,
      enableMouseEvents: true,
      enableGamepadEvents: true,
      debugMode: false // 生产环境设为false
    })
    
    // 确保iframe获得焦点
    setTimeout(() => {
      focusGameIframe(gameFrame.value)
    }, 100)

    scheduleGameDimensionMeasure(180)
  }
}

// 让游戏iframe获得焦点
const focusGameFrame = () => {
  focusGameIframe(gameFrame.value)
}

// 监听评论变化，确保所有有回复的评论默认都是折叠状态
watch(comments, (newComments) => {
  if (newComments.length > 0) {
    newComments.forEach(comment => {
      if (comment.replies?.length > 0 && !collapsedReplies.value.has(comment.id)) {
        collapsedReplies.value.add(comment.id)
      }
    })
  }
}, { deep: true })

// iframe的src现在通过:src绑定自动更新，无需手动设置

onMounted(() => {
  updateViewportSize()
  document.addEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleViewportResize)
  }
  // 监听全屏状态变化，确保游戏获得焦点
  watch(isFullscreen, (newValue) => {
    if (newValue && gameFrame.value) {
      setTimeout(() => {
        focusGameFrame()
        scheduleGameDimensionMeasure(0)
      }, 200)
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleViewportResize)
    if (measureTimer) {
      window.clearTimeout(measureTimer)
      measureTimer = null
    }
  }
})
</script>

<style scoped>
.game-vertical-container {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  outline: none;
  /* 确保iframe可以接收焦点和事件 */
  pointer-events: auto;
}

.fullscreen-game-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgb(25, 25, 31);
  z-index: 9999;
  display: flex;
  flex-direction: column;
}

.fullscreen-game-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.fullscreen-controls {
  position: absolute;
  top: 50%;
  right: 20px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 15px;
  z-index: 10000;
}

.fullscreen-control-btn {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 18px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.fullscreen-control-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}

.fullscreen-control-btn:active {
  transform: scale(0.95);
}

.fullscreen-comments-panel {
  position: absolute;
  right: 0;
  top: 0;
  width: 400px;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 10001;
}

.fullscreen-comments-panel.active {
  transform: translateX(0);
}

.comments-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.comments-content {
  padding: 20px;
  height: calc(100% - 80px);
  overflow-y: auto;
}

.comment-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.comment-user {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.comment-user-main {
  flex: 1;
}

.comment-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-width: 0;
}

.comment-username {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-rating {
  flex-shrink: 0;
  white-space: nowrap;
}

.comment-avatar,
.reply-avatar {
  border-radius: 9999px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.comment-avatar {
  width: 28px;
  height: 28px;
}

.reply-avatar {
  width: 22px;
  height: 22px;
}

.comments-drag-bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
}

.comments-drag-bar:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .fullscreen-controls {
    right: 15px;
    gap: 12px;
  }
  
  .fullscreen-control-btn {
    width: 50px;
    height: 50px;
    font-size: 16px;
  }
  
  .fullscreen-comments-panel {
    width: 100%;
    max-width: 350px;
  }

  .fullscreen-game-content {
    padding: 10px;
  }
}

@media (max-width: 480px) {
  .fullscreen-controls {
    right: 10px;
    gap: 10px;
  }
  
  .fullscreen-control-btn {
    width: 45px;
    height: 45px;
    font-size: 14px;
  }
  
  .fullscreen-comments-panel {
    width: 100%;
    max-width: 300px;
  }

  .fullscreen-game-content {
    padding: 6px;
  }
}
</style>
