<template>
  <div class="coding-mode-page">
    <header class="coding-mode-header">
      <div class="header-left">
        <p class="text-xs uppercase tracking-[0.3em] text-white/60 mb-1">Coding 模式</p>
        <div class="title-row">
          <h1 class="text-2xl font-bold text-white">{{ codingGame?.title || '加载中…' }}</h1>
        </div>
      </div>
      <div class="header-meta">
        <div class="creator-badge">
          <img
            class="creator-avatar"
            :src="creatorAvatarUrl"
            :alt="creatorName"
            @error="onAvatarError"
          />
          <span class="creator-name">
            <span class="creator-name-text">制作人：{{ creatorName }}</span>
            <UserLevelBadge :user-id="creatorUserId" />
          </span>
        </div>
        <div class="meta-chip">
          <img v-if="engineIcon" :src="engineIcon" alt="游戏引擎" class="meta-icon" />
          <span>游戏引擎: {{ engineLabel }}</span>
        </div>
        <div class="meta-chip">
          <img v-if="codeTypeIcon" :src="codeTypeIcon" alt="游戏代码" class="meta-icon" />
          <span>游戏代码: {{ codeTypeLabel }}</span>
        </div>
         <div class="meta-chip">
          <i class="fa-brands fa-github"></i>
          <span>GitHub</span>
        </div>
      </div>
      <div class="header-actions flex items-center gap-3">
        <select v-model="selectedFilePath" class="code-file-selector header-file-selector">
          <option
            v-for="file in filteredFiles"
            :key="file.path"
            :value="file.path"
          >
            {{ file.path }}
          </option>
        </select>
        <button
          class="soft-btn-Chinese"
          @click="reloadCodeBundle"
          :disabled="codeLoading"
        >
          <i :class="codeLoading ? 'fa fa-spinner fa-spin' : 'fa fa-rotate-right'"></i>
          <span>刷新源码</span>
        </button>
        <button class="soft-btn-Chinese" @click="goBack">
          <i class="fa fa-arrow-left"></i>
          <span>返回</span>
        </button>
      </div>
    </header>

    <div class="coding-mode-grid">
      <section class="coding-panel game-panel">
        <div class="panel-header">
          <div>
            <p class="panel-label">游戏运行</p>
          </div>
          <span class="panel-subtle">竖屏窗口 • 自适应缩放</span>
        </div>
        <div class="game-stage">
          <div class="game-frame-box">
            <div v-if="gameLoading" class="game-placeholder">
              <i class="fa fa-spinner fa-spin text-2xl mb-2"></i>
              <p>正在加载游戏…</p>
            </div>
            <div
              v-else-if="gameLaunchUrl"
              class="game-frame-inner"
            >
              <iframe
                :src="gameLaunchUrl"
                ref="gameFrameRef"
                class="coding-game-frame"
                frameborder="0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
                allowfullscreen
                @load="onGameFrameLoad"
              ></iframe>
            </div>
            <div v-else class="game-placeholder">
              <i class="fa fa-exclamation-circle text-2xl mb-2"></i>
              <p>尚未配置游戏运行地址</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 中间：源码浏览 -->
      <section class="coding-panel code-panel">
        <div class="panel-header">
          <div>
            <p class="panel-label">源码浏览</p>
          </div>
        </div>
        <div class="code-content">
          <div class="code-content-header">
            <span
              class="file-name"
              :title="selectedFile?.path || '未选择源码文件'"
            >
              {{ selectedFile?.path || '未选择源码文件' }}
            </span>
            <div class="code-actions">
              <button
                class="soft-btn icon-only"
                type="button"
                @click="openSearchPrompt"
                :aria-label="codeSearch.trim() ? `当前搜索：${codeSearch}` : '搜索源码文件'"
                :title="codeSearch.trim() ? `搜索中：${codeSearch}` : '搜索源码文件'"
              >
                <i class="fa-solid fa-magnifying-glass"></i>
              </button>
              <button
                class="soft-btn icon-only"
                :disabled="!selectedFile"
                @click="copyCode"
                aria-label="复制当前文件代码"
                title="复制当前文件代码"
              >
                <i class="fa-solid fa-copy"></i>
              </button>
              <button
                class="soft-btn icon-only"
                :disabled="!codingGame?.codePackageUrl"
                @click="downloadFullCode"
                aria-label="下载源码压缩包"
                title="下载源码压缩包"
              >
                <i class="fa-solid fa-download"></i>
              </button>
            </div>
          </div>
          <div class="code-body" v-if="codeLoading">
            <div class="code-placeholder">
              <i class="fa fa-spinner fa-spin text-2xl mb-2"></i>
              <p>正在加载源码…</p>
            </div>
          </div>
          <template v-else-if="selectedFile">
            <pre class="code-view">
              <code
                class="hljs"
                v-html="highlightedCode"
              ></code>
            </pre>
          </template>
          <div class="code-body" v-else>
            <div class="code-placeholder">
              <i class="fa fa-code text-2xl mb-2"></i>
              <p>暂未找到任何源码文件，请先在“添加游戏”时上传代码包。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- 右侧：AI 助手 -->
      <section class="coding-panel ai-panel">
        <div class="panel-header">
          <div>
            <p class="panel-label">AI 助手</p>
          </div>
          <span class="panel-subtle">可查看源码上下文</span>
        </div>
        <div class="chat-thread" ref="chatThreadRef">
          <div
            v-for="(message, index) in chatMessages"
            :key="index"
            class="chat-message-row"
            :class="message.role === 'user' ? 'mine' : 'theirs'"
          >
            <div class="chat-message-thread" :class="message.role === 'user' ? 'mine' : 'theirs'">
              <span class="chat-sender-name">
                <span class="chat-sender-text">{{ message.senderName || (message.role === 'user' ? currentUserName : assistantName) }}</span>
                <UserLevelBadge v-if="message.senderUserId" :user-id="message.senderUserId" />
              </span>
              <div class="chat-message-main">
                <img
                  v-if="message.role !== 'user'"
                  class="chat-avatar"
                  :src="message.avatarUrl || assistantAvatarUrl"
                  :alt="message.senderName || assistantName"
                  @error="onAvatarError"
                />
                <div class="bubble" :class="{ pending: message.thinking }">
                  <div class="bubble-content">
                    <i v-if="message.thinking" class="fa fa-spinner fa-spin text-xs"></i>
                    <p>{{ message.text }}</p>
                  </div>
                  <small v-if="!message.thinking">{{ message.timestamp }}</small>
                </div>
                <img
                  v-if="message.role === 'user'"
                  class="chat-avatar"
                  :src="message.avatarUrl || currentUserAvatarUrl"
                  :alt="message.senderName || currentUserName"
                  @error="onAvatarError"
                />
              </div>
            </div>
          </div>
        </div>
        <form class="chat-input" @submit.prevent="sendMessage">
          <div class="chat-composer">
            <div class="composer-header">
              <div class="context-pill" :class="{ muted: !selectedFile }">
                <i class="fa fa-paperclip"></i>
                <span class="context-name" :title="selectedFile?.path || '未选择源码文件'">
                  {{ selectedFile?.path}}
                </span>
              </div>
            </div>
            <textarea
              v-model="userInput"
              rows="3"
              class="chat-textarea"
              placeholder="Describe what to build next"
            ></textarea>
            <div class="composer-footer">
              <div class="footer-left">
                <div class="model-inline" tabindex="0" @blur="modelDropdownOpen = false">
                  <button type="button" class="ghost-pill" @click="modelDropdownOpen = !modelDropdownOpen">
                    <img
                      v-if="selectedModelOption?.image"
                      :src="selectedModelOption.image"
                      alt=""
                      class="model-avatar"
                    />
                    <span>{{ selectedModelOption?.label || '????' }}</span>
                    <i class="fa fa-chevron-down"></i>
                  </button>
                  <div v-if="modelDropdownOpen" class="model-dropdown">
                    <button
                      v-for="option in modelOptions"
                      :key="option.value"
                      type="button"
                      class="model-option"
                      @mousedown.prevent="selectedModel = option.value; modelDropdownOpen = false"
                    >
                      <img v-if="option.image" :src="option.image" alt="" class="model-avatar" />
                      <div class="model-copy">
                        <span class="option-label">{{ option.label }}</span>
                        <small class="option-sub">{{ option.value }}</small>
                      </div>
                      <i v-if="selectedModel === option.value" class="fa fa-check option-check"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div class="footer-right">
                <button
                  class="icon-btn primary"
                  type="submit"
                  :disabled="aiLoading || !userInput.trim()"
                >
                  <i :class="aiLoading ? 'fa fa-spinner fa-spin' : 'fa fa-paper-plane'"></i>
                </button>
              </div>
            </div>
          </div>
        </form>

      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useNotificationStore } from '../stores/notification'
import { resolveMediaUrl } from '../utils/media'
import { getAvatarUrl, handleAvatarError } from '../utils/avatar'
import { escapeCodeHtml, highlightCodeAsync, warmupCodeHighlighter } from '../utils/asyncCodeHighlighter'
import {
  getGameCodeTypeIcon,
  getGameCodeTypeLabel,
  getGameEngineIcon,
  getGameEngineLabel
} from '../utils/gameMetadata.js'
import {
  CHAT_MORE_BUILTIN_MODELS,
  CHAT_MORE_BUILTIN_MODEL_META
} from '../utils/discussionChatMore.js'
import UserLevelBadge from '../components/UserLevelBadge.vue'

const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()
const notificationStore = useNotificationStore()

const gameId = computed(() => route.params.id?.toString())
const codingGame = ref(null)
const gameLoading = ref(true)
const codeFiles = ref([])
const codeLoading = ref(false)
const highlightedCode = ref('')
const highlightTaskId = ref(0)
const codeSearch = ref('')
const selectedFilePath = ref('')
const userInput = ref('')
const aiLoading = ref(false)
const chatThreadRef = ref(null)
const selectedModel = ref(CHAT_MORE_BUILTIN_MODELS[0] || 'DouBaoSeed')
const modelOptions = CHAT_MORE_BUILTIN_MODELS.map((modelName) => ({
  label: CHAT_MORE_BUILTIN_MODEL_META[modelName]?.label || modelName,
  value: modelName,
  image: CHAT_MORE_BUILTIN_MODEL_META[modelName]?.logo || '/Ai/DouBaoSeed1.6.png'
}))
const DEFAULT_ASSISTANT_AVATAR = '/Ai/DouBaoSeed1.6.png'
const gameFrameRef = ref(null)
let gameFrameMeasureAttempts = 0
let lastGameFrameWidth = 0
let lastGameFrameHeight = 0
const pendingAssistantIndex = ref(null)
const modelDropdownOpen = ref(false)
const currentUserId = ref(null)
const currentUserName = ref('你')
const currentUserAvatarUrl = ref(getAvatarUrl(''))
const selectedModelOption = computed(() =>
  modelOptions.find(item => item.value === selectedModel.value) || modelOptions[0]
)
const assistantAvatarUrl = computed(() => selectedModelOption.value?.image || DEFAULT_ASSISTANT_AVATAR)
const assistantName = computed(() => `AI · ${selectedModelOption.value?.label || '助手'}`)
const engineLabel = computed(() => getGameEngineLabel(codingGame.value) || '未知')
const codeTypeLabel = computed(() => getGameCodeTypeLabel(codingGame.value) || '未知')
const engineIcon = computed(() => getGameEngineIcon(codingGame.value))
const codeTypeIcon = computed(() => getGameCodeTypeIcon(codingGame.value))
const creatorName = computed(() =>
  (codingGame.value?.uploaded_by_username
    || codingGame.value?.uploadedByUsername
    || '匿名开发者')
    .toString()
    .trim()
)
const creatorUserId = computed(() => {
  const value = codingGame.value?.uploaded_by_id ?? codingGame.value?.uploadedById
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})
const creatorAvatarUrl = computed(() =>
  getAvatarUrl(
    codingGame.value?.uploaded_by_avatar_url
    || codingGame.value?.uploadedByAvatarUrl
    || ''
  )
)

const chatMessages = ref([
  {
    role: 'assistant',
    senderName: assistantName.value,
    avatarUrl: assistantAvatarUrl.value,
    text: '欢迎来到 Coding 模式，我可以结合源码帮助你理解这款游戏的实现方式。',
    timestamp: new Date().toLocaleTimeString()
  }
])

const readCurrentUserProfile = () => {
  if (typeof window === 'undefined') return
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null')
    const parsedUserId = Number.parseInt(user?.id, 10)
    currentUserId.value = Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null
    currentUserName.value = String(user?.username || user?.nickname || '你').trim() || '你'
    currentUserAvatarUrl.value = getAvatarUrl(user?.avatar_url || user?.avatar || '')
  } catch (error) {
    currentUserId.value = null
    currentUserName.value = '你'
    currentUserAvatarUrl.value = getAvatarUrl('')
  }
}

const onAvatarError = (event) => {
  handleAvatarError(event)
}

const filteredFiles = computed(() => {
  if (!codeSearch.value.trim()) return codeFiles.value
  const keyword = codeSearch.value.trim().toLowerCase()
  return codeFiles.value.filter(file => file.path.toLowerCase().includes(keyword))
})

const selectedFile = computed(() =>
  codeFiles.value.find(file => file.path === selectedFilePath.value) || null
)

const refreshHighlightedCode = async () => {
  const taskId = ++highlightTaskId.value
  const content = selectedFile.value?.content || ''
  const filePath = selectedFile.value?.path || ''
  const language = selectedFile.value?.language || detectLanguage(filePath)

  highlightedCode.value = escapeCodeHtml(content)
  if (!content) return

  try {
    const html = await highlightCodeAsync(content, { filePath, language })
    if (taskId !== highlightTaskId.value) return
    highlightedCode.value = html
  } catch {
    if (taskId !== highlightTaskId.value) return
    highlightedCode.value = escapeCodeHtml(content)
  }
}

const applyGameFrameScale = (nativeWidth, nativeHeight) => {
  const iframe = gameFrameRef.value
  if (!iframe || !nativeWidth || !nativeHeight) return
  const container = iframe.parentElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const scale = Math.min(
    rect.width / nativeWidth,
    rect.height / nativeHeight,
    1
  )

  iframe.style.width = `${nativeWidth}px`
  iframe.style.height = `${nativeHeight}px`
  iframe.style.transformOrigin = 'center center'
  iframe.style.transform = `scale(${scale})`
}

const measureAndScaleGameFrame = () => {
  const iframe = gameFrameRef.value
  if (!iframe || gameFrameMeasureAttempts > 20) return

  gameFrameMeasureAttempts += 1

  try {
    const win = iframe.contentWindow
    const doc = win?.document
    const body = doc?.body
    const html = doc?.documentElement

    const nativeWidth = Math.max(
      win?.innerWidth || 0,
      html?.clientWidth || 0,
      body?.clientWidth || 0,
      body?.scrollWidth || 0,
      body?.offsetWidth || 0
    )

    const nativeHeight = Math.max(
      win?.innerHeight || 0,
      html?.clientHeight || 0,
      body?.clientHeight || 0,
      body?.scrollHeight || 0,
      body?.offsetHeight || 0
    )

    if (nativeWidth && nativeHeight) {
      // 只在尺寸变大时更新缩放，避免放大
      if (
        nativeWidth !== lastGameFrameWidth ||
        nativeHeight !== lastGameFrameHeight
      ) {
        lastGameFrameWidth = nativeWidth
        lastGameFrameHeight = nativeHeight
        applyGameFrameScale(nativeWidth, nativeHeight)
      }
    }
  } catch (error) {
    // 跨域等情况下直接让 iframe 自适应容器
    const iframeEl = gameFrameRef.value
    if (iframeEl) {
      iframeEl.style.width = '100%'
      iframeEl.style.height = '100%'
      iframeEl.style.transform = ''
    }
    return
  }

  // 在游戏初始化阶段连续测量几次，等分辨率稳定
  setTimeout(measureAndScaleGameFrame, 300)
}

const onGameFrameLoad = () => {
  gameFrameMeasureAttempts = 0
  lastGameFrameWidth = 0
  lastGameFrameHeight = 0
  measureAndScaleGameFrame()
}

const gameLaunchUrl = computed(() => {
  if (!codingGame.value) return ''
  const rawUrl =
    codingGame.value.launch_url ||
    codingGame.value.game_url ||
    codingGame.value.gameLaunchUrl ||
    `games/${codingGame.value.game_id || codingGame.value.id}/index.html`
  return resolveMediaUrl(rawUrl)
})

const goBack = () => {
  router.back()
}

const detectLanguage = (path = '') => {
  const ext = path.split('.').pop()?.toLowerCase()
  if (['ts', 'tsx'].includes(ext)) return 'typescript'
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'javascript'
  if (['vue'].includes(ext)) return 'vue'
  if (['css', 'scss', 'less'].includes(ext)) return 'css'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['json'].includes(ext)) return 'json'
  return 'text'
}

const normalizeCodeResponse = (payload) => {
  const files = Array.isArray(payload?.files) ? payload.files : []
  return files.map(file => ({
    path: file.path || file.name,
    language: file.language || detectLanguage(file.path || file.name),
    content: file.content || ''
  }))
}

const loadGame = async () => {
  if (!gameId.value) return
  gameLoading.value = true
  try {
    if (!gameStore.gamesLoaded) {
      await gameStore.loadGames()
    }
    const existing = gameStore.getGameById(gameId.value) || await gameStore.loadGameById(gameId.value)
    codingGame.value = existing
  } catch (error) {
    notificationStore.error('加载游戏失败', error.message || '无法加载游戏')
  } finally {
    gameLoading.value = false
  }
}

const fetchCodeBundle = async () => {
  if (!gameId.value) return
  codeLoading.value = true
  try {
    const response = await fetch(`/api/games/${gameId.value}/code`, {
      credentials: 'include'
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || '无法加载源码')
    }
    codeFiles.value = normalizeCodeResponse(data)
    selectedFilePath.value = codeFiles.value[0]?.path || ''
  } catch (error) {
    codeFiles.value = []
    selectedFilePath.value = ''
    notificationStore.warning('源码获取失败', error.message || '暂时无法加载源码文件')
  } finally {
    codeLoading.value = false
  }
}

const reloadCodeBundle = async () => {
  await fetchCodeBundle()
}

const openSearchPrompt = () => {
  if (typeof window === 'undefined') return
  const nextKeyword = window.prompt('输入要筛选的文件名关键词（留空可清除搜索）', codeSearch.value || '')
  if (nextKeyword === null) return
  codeSearch.value = String(nextKeyword || '').trim()
}

const downloadFullCode = () => {
  if (!codingGame.value?.codePackageUrl) {
    notificationStore.info('暂无压缩包', '该游戏尚未上传源码压缩文件')
    return
  }
  window.open(resolveMediaUrl(codingGame.value.codePackageUrl), '_blank')
}

const copyCode = async () => {
  if (!selectedFile.value) return
  try {
    await navigator.clipboard.writeText(selectedFile.value.content)
    notificationStore.success('已复制', '源码内容已复制到剪贴板')
  } catch (error) {
    notificationStore.error('复制失败', error.message || '请检查浏览器权限')
  }
}

const scrollChatToBottom = () => {
  nextTick(() => {
    const el = chatThreadRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

const appendMessage = (payload) => {
  const role = payload?.role === 'user' ? 'user' : 'assistant'
  const defaultSender = role === 'user'
    ? { senderName: currentUserName.value, avatarUrl: currentUserAvatarUrl.value, senderUserId: currentUserId.value }
    : { senderName: assistantName.value, avatarUrl: assistantAvatarUrl.value }

  chatMessages.value.push({
    ...defaultSender,
    ...payload,
    timestamp: new Date().toLocaleTimeString()
  })
  scrollChatToBottom()
}

const sanitizeAiText = (text = '') => {
  return text
    .replace(/```[\s\S]*?```/g, match => match.replace(/```/g, ''))
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]+\)/g, '$1')
    .trim()
}

const buildChatHistory = () =>
  chatMessages.value
    .filter(msg => !msg.thinking)
    .map(msg => ({ role: msg.role, text: msg.text }))

const buildPrompt = (question) => {
  return [
    question,
    '请根据问题自行判断是否需要结合代码回答；若问题与代码无关，请直接回答用户问题，不要强行围绕代码展开。',
    '输出使用简洁中文，不要带 Markdown 标题、列表符号或装饰符号。'
  ].join('\n\n')
}

const showThinkingMessage = () => {
  pendingAssistantIndex.value = chatMessages.value.length
  appendMessage({
    role: 'assistant',
    text: 'AI 正在思考...',
    thinking: true
  })
}

const resolveThinkingMessage = (text) => {
  const cleanText = sanitizeAiText(text || '')
  const index = pendingAssistantIndex.value
  if (index !== null && chatMessages.value[index]) {
    chatMessages.value[index] = {
      ...chatMessages.value[index],
      text: cleanText,
      thinking: false,
      timestamp: new Date().toLocaleTimeString()
    }
  } else {
    appendMessage({ role: 'assistant', text: cleanText })
  }
  pendingAssistantIndex.value = null
  scrollChatToBottom()
}

const sendMessage = async () => {
  const content = userInput.value.trim()
  if (!content) return
  const prompt = buildPrompt(content)
  appendMessage({ role: 'user', text: content })
  userInput.value = ''
  aiLoading.value = true
  showThinkingMessage()
  try {
    const response = await fetch('/api/ai/code-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${import.meta.env.VITE_AI_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        gameId: gameId.value,
        selectedFile: selectedFile.value?.path,
        fileContent: selectedFile.value?.content,
        files: codeFiles.value.map(file => ({ path: file.path, language: file.language })),
        model: selectedModel.value,
        history: buildChatHistory()
      })
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'AI 服务暂不可用')
    }
    resolveThinkingMessage(
      data.answer || data.message || 'AI 已收到请求，但没有返回具体内容。'
    )
  } catch (error) {
    resolveThinkingMessage(
      `抱歉，调用 AI 失败：${error.message || '未知错误'}`
    )
  } finally {
    aiLoading.value = false
  }
}

watch(gameId, async () => {
  await loadGame()
  await fetchCodeBundle()
}, { immediate: true })

watch(selectedFile, () => {
  warmupCodeHighlighter()
  refreshHighlightedCode()
}, { immediate: true })

onMounted(() => {
  readCurrentUserProfile()
})
</script>

<style scoped src="../styles/coding-mode.css"></style>
