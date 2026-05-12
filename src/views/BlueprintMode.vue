<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useNotificationStore } from '../stores/notification'
import BlueprintSidebar from '../components/blueprint/BlueprintSidebar.vue'
import BlueprintTutorialModal from '../components/blueprint/BlueprintTutorialModal.vue'
import BlueprintWorkspace from '../components/blueprint/BlueprintWorkspace.vue'
import { useBlueprintCanvasInteractions } from '../composables/blueprint/useBlueprintCanvasInteractions.js'
import { useBlueprintExecution } from '../composables/blueprint/useBlueprintExecution.js'
import { useBlueprintPersistence } from '../composables/blueprint/useBlueprintPersistence.js'
import {
  isBlueprintCompactNodeKind,
  parseBlueprintWorkflow,
  removeBlueprintNode,
  serializeBlueprintWorkflow,
  updateBlueprintNodeContent,
} from '../utils/blueprintNodes.js'
import {
  getBlueprintLogPanelPosition,
  getBlueprintNodeContextMenuPosition,
  getBlueprintNodeEditorPanelPosition
} from '../utils/blueprintUi.js'
import {
  formatBlueprintTimestamp,
  formatRunStatusLabel,
  getRuntimeBundleFiles
} from '../utils/blueprintRuntime.js'
import {
  getBlueprintSelectionState,
  isBlueprintWorkflowDirty
} from '../utils/blueprintWorkspaceState.js'
import {
  CHAT_MORE_BUILTIN_MODELS,
  CHAT_MORE_BUILTIN_MODEL_META
} from '../utils/discussionChatMore.js'
import {
  BLUEPRINT_VISION_MODEL_OPTIONS,
  DEFAULT_BLUEPRINT_VISION_MODEL
} from '../utils/blueprintVisionModels.js'
import { API_BASE_URL, apiCall } from '../utils/api'
import {
  isBlueprintRunActiveForAutoCancel,
  requestBlueprintRunCancelOnLeave
} from '../utils/blueprintRunLeave.js'
import {
  shouldBlockBlueprintRouteLeave,
  shouldWarnBeforeBlueprintBrowserUnload
} from '../utils/blueprintNavigationGuards.js'
import {
  BLUEPRINT_TUTORIAL_STEPS,
  getBlueprintTutorialPrefetchQueue,
  normalizeBlueprintTutorialStepIndex,
  readBlueprintTutorialDismissed,
  shouldAutoOpenBlueprintTutorial,
  writeBlueprintTutorialDismissed
} from '../utils/blueprintTutorial.js'

const gameStore = useGameStore()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const route = useRoute()
const router = useRouter()

const modelOptions = CHAT_MORE_BUILTIN_MODELS.map((value) => {
  const meta = CHAT_MORE_BUILTIN_MODEL_META[value] || {}
  return {
    label: meta.label || value,
    value,
    logoSrc: meta.logo || '',
    logoAlt: meta.label || value
  }
})
const visionModelOptions = BLUEPRINT_VISION_MODEL_OPTIONS
const DEFAULT_BLUEPRINT_EXECUTION_MODEL = 'GLM-4.5'

const BP_LOG_PANEL_WIDTH = 360
const BP_LOG_PANEL_HEIGHT = 420
const BP_LOG_PANEL_SAFE_TOP = 84
const BP_LOG_PANEL_SAFE_BOTTOM = 128
const BP_LOG_PANEL_SAFE_RIGHT = 24
const BP_LOG_PANEL_SAFE_LEFT = 24

const seed = ref('')
const isSidebarCollapsed = ref(false)
const blueprintNodes = ref([])
const blueprintEdges = ref([])
const workflowMeta = ref({})
const nodeMeasurements = ref({})
const selectedNodeId = ref('')
const highlightedNodeId = ref('')
const activeContextMenu = ref(null)
const activeRerunPrompt = ref(null)
const activeEditor = ref(null)
const activeLibraryGameId = ref('')
const selectedModel = ref(DEFAULT_BLUEPRINT_EXECUTION_MODEL)
const hasExplicitModelSelection = ref(false)
const selectedVisionModel = ref(DEFAULT_BLUEPRINT_VISION_MODEL)
const hasWorkflowHydrated = ref(false)
const lastSavedWorkflowSnapshot = ref(serializeBlueprintWorkflow([], [], {}))
const logPanelPosition = ref({
  x: BP_LOG_PANEL_SAFE_LEFT,
  y: BP_LOG_PANEL_SAFE_TOP
})
const hasLogPanelBeenPositioned = ref(false)
const isTutorialVisible = ref(false)
const tutorialStepIndex = ref(0)
const tutorialDontShowAgain = ref(false)
const hasEvaluatedTutorialAutoOpen = ref(false)
const tutorialAssetState = ref(
  Object.fromEntries(BLUEPRINT_TUTORIAL_STEPS.map((step) => [step.id, 'idle']))
)

const libraryGames = computed(() => gameStore.games || [])
let highlightTimer = null
let hasTriggeredLeaveAutoCancel = false
const tutorialAssetPromises = new Map()

const workflowSnapshot = computed(() =>
  serializeBlueprintWorkflow(blueprintNodes.value, blueprintEdges.value, workflowMeta.value)
)
const isWorkflowBusy = computed(() =>
  workflowLoadState.value === 'loading'
  || workflowLoadState.value === 'saving'
  || workflowLoadState.value === 'creating'
  || workflowLoadState.value === 'planning'
  || workflowLoadState.value === 'executing'
)
const isWorkflowDirty = computed(() =>
  isBlueprintWorkflowDirty({
    workflowSnapshot: workflowSnapshot.value,
    lastSavedWorkflowSnapshot: lastSavedWorkflowSnapshot.value
  })
)
const canExecuteWorkflow = computed(() =>
  blueprintNodes.value.length > 0 && !isWorkflowBusy.value
)
const canContinueFailedRun = computed(() =>
  Boolean(runHistoryApiAvailable.value ? latestRunId.value : latestFailedNodeId.value)
  && latestRunStatus.value === 'failed'
  && !isWorkflowBusy.value
)
const canCancelLatestRun = computed(() =>
  activeRunIsPersistent.value
    ? (
        runHistoryApiAvailable.value
        && Boolean(latestRunId.value)
        && ['running', 'cancel_requested'].includes(String(latestRunStatus.value || ''))
      )
    : workflowLoadState.value === 'executing'
)

const latestOutputRuntime = computed(() => {
  const outputNodes = [...blueprintNodes.value]
    .filter((node) => node.kind === 'output')
    .reverse()

  return outputNodes
    .map((node) => nodeRuntimeMap.value[node.id] || null)
    .find((runtime) => runtime?.artifactType === 'file-bundle')
    || null
})

const latestOutputFiles = computed(() => getRuntimeBundleFiles(latestOutputRuntime.value))

const latestOutputFileEntries = computed(() =>
  Object.entries(latestOutputFiles.value).map(([fileName, content]) => ({
    fileName,
    content: String(content || '')
  }))
)

const latestOutputReadme = computed(() =>
  String(latestOutputFiles.value['README.md'] || '').trim()
)

const latestOutputReadmeSnippet = computed(() => {
  const readme = latestOutputReadme.value
  if (!readme) return ''
  return readme.length > 420 ? `${readme.slice(0, 420)}...` : readme
})

const shouldShowLogOutputCard = computed(() =>
  !isLogPanelHistoryHidden.value
  && (latestOutputFileEntries.value.length > 0 || Boolean(latestPreviewUrl.value))
)

const shouldShowRunHistory = computed(() =>
  !isLogPanelHistoryHidden.value
  && hasSessionRunHistory.value
  && runHistoryApiAvailable.value
  && recentRuns.value.length > 0
)

const canClearLogPanelHistory = computed(() =>
  logs.value.length > 0
  || Boolean(latestRunId.value)
  || recentRuns.value.length > 0
  || latestOutputFileEntries.value.length > 0
  || Boolean(latestPreviewUrl.value)
)

const formattedRecentBlueprints = computed(() =>
  recentBlueprints.value.map((blueprint) => ({
    ...blueprint,
    updatedAtLabel: formatBlueprintTimestamp(blueprint.updatedAt || blueprint.createdAt)
  }))
)

const latestPreviewUrl = computed(() => {
  const previewUrl = String(
    latestRunDetail.value?.previewUrl
    || recentRuns.value.find((run) => String(run.id || '') === String(latestRunId.value || ''))?.previewUrl
    || ''
  ).trim()

  if (!previewUrl) return ''
  if (/^https?:\/\//i.test(previewUrl)) return previewUrl

  try {
    return new URL(previewUrl, window.location.origin).toString()
  } catch {
    return previewUrl
  }
})

const activeTutorialStep = computed(() =>
  BLUEPRINT_TUTORIAL_STEPS[normalizeBlueprintTutorialStepIndex(tutorialStepIndex.value)]
    || null
)

const activeTutorialAssetState = computed(() => {
  const stepId = activeTutorialStep.value?.id
  return stepId ? tutorialAssetState.value[stepId] || 'idle' : 'idle'
})

const isActiveTutorialStepLoaded = computed(() => activeTutorialAssetState.value === 'loaded')
const isActiveTutorialStepErrored = computed(() => activeTutorialAssetState.value === 'error')

const clampLogPanelPosition = (position = {}) => {
  const stageRect = typeof stageRectGetter.value === 'function'
    ? stageRectGetter.value()
    : null

  const stageWidth = Math.max(0, Number(stageRect?.width) || window.innerWidth)
  const stageHeight = Math.max(0, Number(stageRect?.height) || window.innerHeight)
  const minX = BP_LOG_PANEL_SAFE_LEFT
  const maxX = Math.max(
    minX,
    stageWidth - BP_LOG_PANEL_WIDTH - BP_LOG_PANEL_SAFE_RIGHT
  )
  const minY = BP_LOG_PANEL_SAFE_TOP
  const maxY = Math.max(
    minY,
    stageHeight - BP_LOG_PANEL_HEIGHT - BP_LOG_PANEL_SAFE_BOTTOM
  )

  return {
    x: Math.min(maxX, Math.max(minX, Number(position.x) || 0)),
    y: Math.min(maxY, Math.max(minY, Number(position.y) || 0))
  }
}

const getViewportAnchoredLogPanelPosition = () => {
  const stageRect = typeof stageRectGetter.value === 'function'
    ? stageRectGetter.value()
    : null

  return getBlueprintLogPanelPosition(
    {
      width: Number(stageRect?.width) || window.innerWidth,
      height: Number(stageRect?.height) || window.innerHeight
    },
    {
      panelWidth: BP_LOG_PANEL_WIDTH,
      panelHeight: BP_LOG_PANEL_HEIGHT,
      safeTop: BP_LOG_PANEL_SAFE_TOP,
      safeBottom: BP_LOG_PANEL_SAFE_BOTTOM,
      safeRight: BP_LOG_PANEL_SAFE_RIGHT,
      safeLeft: BP_LOG_PANEL_SAFE_LEFT
    }
  )
}

const positionLogPanelInViewport = () => {
  logPanelPosition.value = getViewportAnchoredLogPanelPosition()
  hasLogPanelBeenPositioned.value = true
}

const updateTutorialAssetState = (stepId, status) => {
  if (!stepId) return

  tutorialAssetState.value = {
    ...tutorialAssetState.value,
    [stepId]: status
  }
}

const loadTutorialAsset = (step) => {
  const stepId = step?.id
  if (!stepId) return Promise.resolve(false)

  if (tutorialAssetState.value[stepId] === 'loaded') {
    return Promise.resolve(true)
  }

  if (tutorialAssetPromises.has(stepId)) {
    return tutorialAssetPromises.get(stepId)
  }

  updateTutorialAssetState(stepId, 'loading')

  const promise = new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.Image !== 'function') {
      updateTutorialAssetState(stepId, 'error')
      resolve(false)
      return
    }

    const mediaStatus = {
      posterDone: !step.posterSrc,
      posterLoaded: false,
      videoDone: !Array.isArray(step.videoSources) || step.videoSources.length === 0,
      videoLoaded: false
    }
    let hasResolved = false

    const finish = (status, result) => {
      if (hasResolved) return
      hasResolved = true
      updateTutorialAssetState(stepId, status)
      tutorialAssetPromises.delete(stepId)
      resolve(result)
    }

    const settle = () => {
      if (mediaStatus.videoLoaded) {
        finish('loaded', true)
        return
      }

      if (mediaStatus.videoDone && !mediaStatus.videoLoaded) {
        if (mediaStatus.posterLoaded) {
          finish('loaded', true)
          return
        }

        finish('error', false)
      }
    }

    if (step.posterSrc) {
      const image = new window.Image()
      image.decoding = 'async'
      image.onload = () => {
        mediaStatus.posterDone = true
        mediaStatus.posterLoaded = true
        settle()
      }
      image.onerror = () => {
        mediaStatus.posterDone = true
        settle()
      }
      image.src = step.posterSrc
    }

    if (!mediaStatus.videoDone && typeof document !== 'undefined') {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true

      const handleVideoLoaded = () => {
        mediaStatus.videoDone = true
        mediaStatus.videoLoaded = true
        cleanupVideo()
        settle()
      }

      const handleVideoError = () => {
        mediaStatus.videoDone = true
        cleanupVideo()
        settle()
      }

      const cleanupVideo = () => {
        video.removeEventListener('loadeddata', handleVideoLoaded)
        video.removeEventListener('error', handleVideoError)
        video.removeAttribute('src')
        video.load()
      }

      video.addEventListener('loadeddata', handleVideoLoaded, { once: true })
      video.addEventListener('error', handleVideoError, { once: true })

      step.videoSources.forEach((source) => {
        const sourceElement = document.createElement('source')
        sourceElement.src = source.src
        sourceElement.type = source.type
        video.appendChild(sourceElement)
      })

      video.load()
      return
    }

    settle()
  })

  tutorialAssetPromises.set(stepId, promise)
  return promise
}

const primeBlueprintTutorialAssets = (activeIndex) => {
  const normalizedIndex = normalizeBlueprintTutorialStepIndex(activeIndex)
  const preloadSteps = [
    BLUEPRINT_TUTORIAL_STEPS[normalizedIndex],
    ...getBlueprintTutorialPrefetchQueue(normalizedIndex)
  ].filter(Boolean).slice(0, 2)

  preloadSteps.forEach((step, index) => {
    window.setTimeout(() => {
      void loadTutorialAsset(step)
    }, index * 120)
  })
}

const updateTutorialDontShowAgain = (value) => {
  tutorialDontShowAgain.value = Boolean(value)
  writeBlueprintTutorialDismissed(tutorialDontShowAgain.value)
}

const openBlueprintTutorial = async () => {
  tutorialStepIndex.value = 0
  isTutorialVisible.value = true
  await nextTick()
  primeBlueprintTutorialAssets(0)
}

const maybeOpenBlueprintTutorial = async () => {
  if (hasEvaluatedTutorialAutoOpen.value) return

  tutorialDontShowAgain.value = readBlueprintTutorialDismissed()
  hasEvaluatedTutorialAutoOpen.value = true

  if (!shouldAutoOpenBlueprintTutorial({
    hasHydrated: hasWorkflowHydrated.value,
    dismissed: tutorialDontShowAgain.value
  })) {
    return
  }

  await openBlueprintTutorial()
}

const handleTutorialPrevious = () => {
  tutorialStepIndex.value = normalizeBlueprintTutorialStepIndex(tutorialStepIndex.value - 1)
}

const handleTutorialNext = () => {
  tutorialStepIndex.value = normalizeBlueprintTutorialStepIndex(tutorialStepIndex.value + 1)
}

const handleTutorialComplete = () => {
  writeBlueprintTutorialDismissed(tutorialDontShowAgain.value)
  isTutorialVisible.value = false
}

const updateWorkflowSavedSnapshot = (workflow = null) => {
  if (workflow) {
    lastSavedWorkflowSnapshot.value = serializeBlueprintWorkflow(
      Array.isArray(workflow.nodes) ? workflow.nodes : [],
      Array.isArray(workflow.edges) ? workflow.edges : [],
      workflow?.meta && typeof workflow.meta === 'object' ? workflow.meta : {}
    )
    return
  }

  lastSavedWorkflowSnapshot.value = workflowSnapshot.value
}

const pulseNode = (nodeId) => {
  highlightedNodeId.value = nodeId

  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }

  highlightTimer = window.setTimeout(() => {
    if (highlightedNodeId.value === nodeId) {
      highlightedNodeId.value = ''
    }
  }, 1200)
}

const closeNodeOverlays = () => {
  activeContextMenu.value = null
  activeRerunPrompt.value = null
  activeEditor.value = null
}

const applyWorkflowPayload = (workflow = {}, options = {}) => {
  const { nodes, edges, meta } = parseBlueprintWorkflow(JSON.stringify(workflow || {}))
  const selectionState = getBlueprintSelectionState(nodes)

  blueprintNodes.value = nodes
  blueprintEdges.value = edges
  workflowMeta.value = meta
  executionApi?.resetBlueprintRuntime()
  executionApi?.resetLatestRunTracking()
  nodeMeasurements.value = {}
  selectedNodeId.value = selectionState.selectedNodeId
  highlightedNodeId.value = ''
  activeLibraryGameId.value = selectionState.activeLibraryGameId
  closeNodeOverlays()

  if (options.persistSnapshot) {
    updateWorkflowSavedSnapshot({ nodes, edges, meta })
  }

  if (options.focusNodes) {
    focusWorkflowNodes(nodes)
  }
}

const buildWorkflowPayload = () => {
  executionApi?.mergeRuntimeOutputsIntoBlueprintNodes()
  return JSON.parse(serializeBlueprintWorkflow(
    blueprintNodes.value,
    blueprintEdges.value,
    workflowMeta.value
  ))
}

const resolveBlueprintErrorMessage = (error, fallbackMessage) => {
  if (error?.status === 401 || error?.status === 403) {
    return '蓝图种子功能需要登录后使用。'
  }

  return error?.message || fallbackMessage
}

const hasActiveBlueprintRunForAutoCancel = () =>
  activeRunIsPersistent.value
  && isBlueprintRunActiveForAutoCancel({
    runId: latestRunId.value,
    status: latestRunStatus.value,
    runHistoryApiAvailable: runHistoryApiAvailable.value
  })

const autoCancelBlueprintRunOnLeave = async ({ fireAndForget = false } = {}) => {
  if (hasTriggeredLeaveAutoCancel) return false
  if (!hasActiveBlueprintRunForAutoCancel()) return false

  hasTriggeredLeaveAutoCancel = true

  if (fireAndForget) {
    const authToken = localStorage.getItem('token') || authStore.authToken || ''
    return requestBlueprintRunCancelOnLeave({
      runId: latestRunId.value,
      apiBaseUrl: API_BASE_URL,
      authToken
    })
  }

  await handleCancelLatestRun(latestRunId.value)
  return true
}

const executionApi = useBlueprintExecution({
  authStore,
  selectedModel,
  hasExplicitModelSelection,
  selectedVisionModel,
  seed,
  blueprintNodes,
  blueprintEdges,
  activeEditor,
  selectedNodeId,
  isWorkflowBusy,
  isBlueprintCompactNodeKind,
  getWorkflowPayload: buildWorkflowPayload,
  applyWorkflowPayload,
  pulseNode,
  resolveBlueprintErrorMessage
})

const canvasApi = useBlueprintCanvasInteractions({
  gameStore,
  blueprintNodes,
  blueprintEdges,
  nodeMeasurements,
  selectedNodeId,
  activeLibraryGameId,
  highlightedNodeId,
  closeNodeOverlays,
  appendLog: (...args) => executionApi.appendLog(...args),
  pulseNode
})

const {
  logs,
  nodeRuntimeMap,
  workflowLoadState,
  plannerPromptDraft,
  planningStatusLabel,
  latestRunId,
  latestRunStatus,
  latestRunContinuation,
  latestFailedNodeId,
  recentRuns,
  latestRunDetail,
  isLogPanelHistoryHidden,
  hasSessionRunHistory,
  sessionRunIds,
  runHistoryApiAvailable,
  activeRunIsPersistent,
  isPlannerRunning,
  appendLog,
  resetLatestRunTracking,
  resetExecutionLogSession,
  resetBlueprintRuntime,
  hydrateRuntimeSnapshot,
  fetchRunHistory,
  syncLatestRunDetail,
  handleClearLogs,
  handleExecuteWorkflow,
  updatePlannerPromptDraft,
  handleSubmitPlannerPrompt,
  handleExecuteNode,
  handleContinueFromFailedRun,
  handleCancelLatestRun,
  cancelActiveExecutionStream
} = executionApi

const {
  isLibraryLoading,
  screenToWorldProjector,
  worldToViewportProjector,
  stageRectGetter,
  focusWorldBoundsFn,
  activeEdgeDrag,
  handleSelectNode,
  handleNodeMeasure,
  handleNodeUnmount,
  handleToolbarAction,
  handleCanvasReady: bindCanvasReady,
  handleDropGame,
  focusWorkflowNodes,
  finishNodeDrag,
  finishEdgeDrag,
  clearScheduledLibraryLoad,
  scheduleLibraryLoad,
  gameBlueprintNodes,
  compactBlueprintNodes,
  renderedEdges,
  previewEdgePath,
  previewEdgeStroke,
  getNodePortPoint,
  handleNodeDragStart,
  handleStartLink
} = canvasApi

const persistenceApi = useBlueprintPersistence({
  route,
  router,
  notificationStore,
  workflowLoadState,
  seed,
  blueprintNodes,
  blueprintEdges,
  isWorkflowBusy,
  isWorkflowDirty,
  plannerPromptDraft,
  selectedNodeId,
  highlightedNodeId,
  activeLibraryGameId,
  hasWorkflowHydrated,
  nodeMeasurements,
  closeNodeOverlays,
  resetExecutionLogSession,
  resetBlueprintRuntime,
  appendLog,
  fetchRunHistory,
  buildWorkflowPayload,
  applyWorkflowPayload,
  focusWorkflowNodes,
  updateWorkflowSavedSnapshot
})

const {
  recentBlueprints,
  recentBlueprintsLoading,
  recentBlueprintsError,
  normalizeSeedInput,
  getRouteSeedValue,
  syncSeedToRoute,
  fetchRecentBlueprints,
  handleImportSeed,
  handleSaveWorkflowToSeed,
  handleCreateBlueprint,
  handleExportWorkflow,
  handleImportWorkflow,
  handleClearWorkflow
} = persistenceApi

const handleSelectGame = (gameId) => {
  activeLibraryGameId.value = String(gameId || '')
}

const handleCanvasReady = (payload) => {
  bindCanvasReady(payload)

  if (!hasLogPanelBeenPositioned.value) {
    positionLogPanelInViewport()
  }

  if (blueprintNodes.value.length) {
    focusWorkflowNodes(blueprintNodes.value)
  }
}

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

const clearPointerButtonFocus = (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null
  if (!(button instanceof HTMLButtonElement)) return

  window.setTimeout(() => {
    button.blur()
  }, 0)
}

const handleGlobalPointerDown = (event) => {
  const target = event.target instanceof Element
    ? event.target
    : (event.target instanceof Node ? event.target.parentElement : null)

  if (!(target instanceof Element)) {
    closeNodeOverlays()
    return
  }

  if (target.closest('.bp-node-context-menu, .bp-node-rerun-prompt, .bp-node-editor-panel, .bp-log-panel, .bp-prompt-dock')) return
  closeNodeOverlays()
}

const handleSelectModel = (modelValue) => {
  const nextModel = String(modelValue || DEFAULT_BLUEPRINT_EXECUTION_MODEL).trim() || DEFAULT_BLUEPRINT_EXECUTION_MODEL
  if (nextModel === selectedModel.value) return

  selectedModel.value = nextModel
  hasExplicitModelSelection.value = true
  appendLog(`已切换执行模型为 ${selectedModel.value}。`)
  notificationStore.success('模型已切换', `当前执行模型：${selectedModel.value}`)
}

const handleSelectVisionModel = (modelValue) => {
  const nextModel = String(modelValue || DEFAULT_BLUEPRINT_VISION_MODEL).trim() || DEFAULT_BLUEPRINT_VISION_MODEL
  if (nextModel === selectedVisionModel.value) return

  selectedVisionModel.value = nextModel
  appendLog(`已切换视觉理解模型为 ${selectedVisionModel.value}。`)
  notificationStore.success('视觉模型已切换', `当前视觉模型：${selectedVisionModel.value}`)
}

const handleDeleteNode = (nodeId) => {
  const result = removeBlueprintNode(blueprintNodes.value, blueprintEdges.value, nodeId)
  blueprintNodes.value = result.nodes
  blueprintEdges.value = result.edges
  if (nodeRuntimeMap.value[nodeId]) {
    const nextRuntimeMap = { ...nodeRuntimeMap.value }
    delete nextRuntimeMap[nodeId]
    nodeRuntimeMap.value = nextRuntimeMap
  }

  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = ''
  }

  if (highlightedNodeId.value === nodeId) {
    highlightedNodeId.value = ''
  }

  handleNodeUnmount(nodeId)
  closeNodeOverlays()
  appendLog('已删除节点。')
}

const handleNodeContextMenu = (payload) => {
  if (!payload?.nodeId) return

  const node = blueprintNodes.value.find((item) => item.id === payload.nodeId)
  if (!node) return

  const stageRect = typeof stageRectGetter.value === 'function'
    ? stageRectGetter.value()
    : null
  const viewportPoint = {
    x: Number(payload.clientX || 0) - (Number(stageRect?.left) || 0),
    y: Number(payload.clientY || 0) - (Number(stageRect?.top) || 0)
  }

  handleSelectNode(node.id)
  activeEditor.value = null
  activeRerunPrompt.value = null
  activeContextMenu.value = {
    nodeId: node.id,
    nodeTitle: node.title || node.id,
    kind: node.kind,
    position: getBlueprintNodeContextMenuPosition(
      viewportPoint,
      {
        worldWidth: Number(stageRect?.width) || window.innerWidth,
        worldHeight: Number(stageRect?.height) || window.innerHeight
      }
    )
  }
}

const openNodeRerunPrompt = (menuPayload) => {
  const nodeId = String(menuPayload?.nodeId || '').trim()
  if (!nodeId) return

  const node = blueprintNodes.value.find((item) => item.id === nodeId)
  if (!node) return

  const stageRect = typeof stageRectGetter.value === 'function'
    ? stageRectGetter.value()
    : null
  const anchorPoint = activeContextMenu.value?.position || menuPayload?.position || { x: 0, y: 0 }

  activeContextMenu.value = null
  activeEditor.value = null
  activeRerunPrompt.value = {
    nodeId: node.id,
    nodeTitle: node.title || node.id,
    position: getBlueprintNodeContextMenuPosition(anchorPoint, {
      worldWidth: Number(stageRect?.width) || window.innerWidth,
      worldHeight: Number(stageRect?.height) || window.innerHeight,
      width: 320,
      height: 232
    }),
    draft: ''
  }
}

const updateRerunPromptDraft = (value) => {
  if (!activeRerunPrompt.value) return

  activeRerunPrompt.value = {
    ...activeRerunPrompt.value,
    draft: String(value || '')
  }
}

const submitNodeRerunPrompt = async () => {
  const promptState = activeRerunPrompt.value
  if (!promptState?.nodeId) return

  const nodeId = promptState.nodeId
  const rerunInstruction = String(promptState.draft || '').trim()
  closeNodeOverlays()
  await handleExecuteNode(nodeId, {
    scope: 'single',
    rerunInstruction
  })
}

const openNodeEditor = (nodeId) => {
  const node = blueprintNodes.value.find((item) => item.id === nodeId)
  if (!node || !isBlueprintCompactNodeKind(node.kind)) return

  const stageRect = typeof stageRectGetter.value === 'function'
    ? stageRectGetter.value()
    : null
  const viewportPoint = typeof worldToViewportProjector.value === 'function'
    ? worldToViewportProjector.value(node.position || {})
    : null
  const nodeSize = nodeMeasurements.value[node.id] || null
  const viewportRect = viewportPoint
    ? {
        x: Number(viewportPoint.x) || 0,
        y: Number(viewportPoint.y) || 0,
        width: Number(nodeSize?.width) || 0,
        height: Number(nodeSize?.height) || 0
      }
    : null

  activeContextMenu.value = null
  activeRerunPrompt.value = null
  activeEditor.value = {
    nodeId: node.id,
    kind: node.kind,
    position: getBlueprintNodeEditorPanelPosition(node, nodeMeasurements.value[node.id], {
      worldWidth: Number(stageRect?.width) || window.innerWidth,
      worldHeight: Number(stageRect?.height) || window.innerHeight,
      width: 360,
      height: 460,
      viewportPoint,
      viewportRect
    }),
    draft: String(node.content || ''),
    runtime: nodeRuntimeMap.value[node.id] || null,
    previewUrl: node.kind === 'output' ? latestPreviewUrl.value : ''
  }
}

const updateNodeEditorDraft = (value) => {
  if (!activeEditor.value) return

  activeEditor.value = {
    ...activeEditor.value,
    draft: String(value || '')
  }
}

const saveNodeEditor = () => {
  const editor = activeEditor.value
  if (!editor?.nodeId) return

  blueprintNodes.value = updateBlueprintNodeContent(
    blueprintNodes.value,
    editor.nodeId,
    editor.draft
  )
  appendLog('已更新节点内容。')
  closeNodeOverlays()
}

const handleKeydown = (event) => {
  if (event.key !== 'Escape') return
  closeNodeOverlays()
}

const handleWindowResize = () => {
  logPanelPosition.value = hasLogPanelBeenPositioned.value
    ? getViewportAnchoredLogPanelPosition()
    : clampLogPanelPosition(logPanelPosition.value)
}

const handleBeforeUnload = (event) => {
  if (!shouldWarnBeforeBlueprintBrowserUnload({
    isWorkflowDirty: isWorkflowDirty.value
  })) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

onMounted(async () => {
  appendLog('蓝图模块已加载，正在准备游戏库。')
  scheduleLibraryLoad()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('beforeunload', handleBeforeUnload)

  const routeSeed = getRouteSeedValue()
  if (routeSeed) {
    await handleImportSeed(routeSeed, { skipConfirm: true })
  } else {
    updateWorkflowSavedSnapshot()
    hasWorkflowHydrated.value = true
  }

  await maybeOpenBlueprintTutorial()
  await fetchRecentBlueprints()
})

watch(
  () => getRouteSeedValue(),
  (nextSeed) => {
    if (!hasWorkflowHydrated.value) return

    const normalizedCurrentSeed = normalizeSeedInput(seed.value)
    if (!nextSeed || nextSeed === normalizedCurrentSeed) return

    void handleImportSeed(nextSeed, { skipConfirm: true })
  }
)

watch(latestPreviewUrl, (nextPreviewUrl) => {
  if (!activeEditor.value || activeEditor.value.kind !== 'output') return

  activeEditor.value = {
    ...activeEditor.value,
    previewUrl: String(nextPreviewUrl || '')
  }
})

watch(
  [latestRunId, latestRunStatus, runHistoryApiAvailable],
  () => {
    if (!hasActiveBlueprintRunForAutoCancel()) {
      hasTriggeredLeaveAutoCancel = false
    }
  }
)

watch(isSidebarCollapsed, () => {
  window.setTimeout(() => {
    logPanelPosition.value = hasLogPanelBeenPositioned.value
      ? getViewportAnchoredLogPanelPosition()
      : clampLogPanelPosition(logPanelPosition.value)
  }, 0)
})

watch(tutorialStepIndex, (nextIndex) => {
  if (!isTutorialVisible.value) return
  primeBlueprintTutorialAssets(nextIndex)
})

onBeforeUnmount(() => {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }

  void autoCancelBlueprintRunOnLeave({ fireAndForget: true })
  cancelActiveExecutionStream()
  clearScheduledLibraryLoad()
  finishNodeDrag({ snapToGrid: false })
  finishEdgeDrag()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (shouldBlockBlueprintRouteLeave()) {
    return false
  }

  void autoCancelBlueprintRunOnLeave({ fireAndForget: true })
  return true
})
</script>

<template>
  <div
    class="bp-page"
    :class="{ 'is-sidebar-collapsed': isSidebarCollapsed }"
    @pointerdown.capture="handleGlobalPointerDown"
    @pointerup.capture="clearPointerButtonFocus"
  >
    <BlueprintSidebar
      v-if="!isSidebarCollapsed"
      :games="libraryGames"
      :logs="logs"
      :model-options="modelOptions"
      :selected-model="selectedModel"
      :vision-model-options="visionModelOptions"
      :selected-vision-model="selectedVisionModel"
      :seed="seed"
      :recent-blueprints="formattedRecentBlueprints"
      :recent-blueprints-loading="recentBlueprintsLoading"
      :recent-blueprints-error="recentBlueprintsError"
      :collapsed="isSidebarCollapsed"
      :loading="isLibraryLoading"
      :active-game-id="activeLibraryGameId"
      :busy="isWorkflowBusy"
      @toggle="toggleSidebar"
      @create-blueprint="handleCreateBlueprint"
      @select-game="handleSelectGame"
      @export-workflow="handleExportWorkflow"
      @import-workflow="handleImportWorkflow"
      @clear-workflow="handleClearWorkflow"
      @select-model="handleSelectModel"
      @select-vision-model="handleSelectVisionModel"
      @import-seed="handleImportSeed"
      @save-seed="handleSaveWorkflowToSeed"
    />

    <main class="bp-main">
      <button
        v-if="isSidebarCollapsed"
        type="button"
        class="bp-sidebar-fab bp-control-surface bp-control-button bp-control-button-hover-lift"
        aria-label="展开侧栏"
        @click="toggleSidebar"
      >
        <i class="fa fa-angles-right"></i>
      </button>
      <BlueprintWorkspace
        :busy="isWorkflowBusy"
        :planning="isPlannerRunning"
        :planning-label="planningStatusLabel"
        :prompt-value="plannerPromptDraft"
        :prompt-disabled="isWorkflowBusy"
        :show-empty-state="!blueprintNodes.length"
        :rendered-edges="renderedEdges"
        :preview-edge-path="previewEdgePath"
        :preview-edge-stroke="previewEdgeStroke"
        :game-nodes="gameBlueprintNodes"
        :compact-nodes="compactBlueprintNodes"
        :node-runtime-map="nodeRuntimeMap"
        :selected-node-id="selectedNodeId"
        :highlighted-node-id="highlightedNodeId"
        :active-context-menu="activeContextMenu"
        :active-rerun-prompt="activeRerunPrompt"
        :active-editor="activeEditor"
        :log-panel-position="logPanelPosition"
        :latest-run-id="latestRunId"
        :can-clear-history="canClearLogPanelHistory"
        :can-cancel-latest-run="canCancelLatestRun"
        :can-continue-failed-run="canContinueFailedRun"
        :should-show-output-card="shouldShowLogOutputCard"
        :latest-output-file-entries="latestOutputFileEntries"
        :latest-preview-url="latestPreviewUrl"
        :latest-output-readme-snippet="latestOutputReadmeSnippet"
        :should-show-run-history="shouldShowRunHistory"
        :recent-runs="recentRuns"
        :logs="logs"
        :format-run-status-label="formatRunStatusLabel"
        @toolbar-action="handleToolbarAction"
        @save-workflow="handleSaveWorkflowToSeed"
        @execute-workflow="handleExecuteWorkflow"
        @canvas-ready="handleCanvasReady"
        @drop-game="handleDropGame"
        @update:prompt="updatePlannerPromptDraft"
        @submit-prompt="handleSubmitPlannerPrompt"
        @select-node="handleSelectNode"
        @drag-start="handleNodeDragStart"
        @start-link="handleStartLink"
        @context-menu="handleNodeContextMenu"
        @measure-node="handleNodeMeasure"
        @unmount-node="handleNodeUnmount"
        @rerun-node="openNodeRerunPrompt"
        @continue-from-node="handleExecuteNode($event, { scope: 'branch' })"
        @edit-node="openNodeEditor"
        @delete-node="handleDeleteNode"
        @submit-rerun-prompt="submitNodeRerunPrompt"
        @cancel-rerun-prompt="closeNodeOverlays"
        @update-rerun-prompt-draft="updateRerunPromptDraft"
        @close-overlays="closeNodeOverlays"
        @save-editor="saveNodeEditor"
        @update-editor-draft="updateNodeEditorDraft"
        @clear-history="handleClearLogs"
        @cancel-latest-run="handleCancelLatestRun"
        @continue-latest-run="handleContinueFromFailedRun"
      />
    </main>

    <BlueprintTutorialModal
      :visible="isTutorialVisible"
      :step="activeTutorialStep"
      :step-index="tutorialStepIndex"
      :total-steps="BLUEPRINT_TUTORIAL_STEPS.length"
      :current-step-loaded="isActiveTutorialStepLoaded"
      :current-step-errored="isActiveTutorialStepErrored"
      :dont-show-again="tutorialDontShowAgain"
      @previous="handleTutorialPrevious"
      @next="handleTutorialNext"
      @complete="handleTutorialComplete"
      @update:dont-show-again="updateTutorialDontShowAgain"
    />
  </div>
</template>

<style src="../styles/blueprint-mode.css"></style>
<style src="../styles/blueprint-node-chrome.css"></style>
<style src="../styles/blueprint-controls.css"></style>
<style src="../styles/blueprint-workspace.css"></style>
