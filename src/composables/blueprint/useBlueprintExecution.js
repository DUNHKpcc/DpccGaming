import { computed, ref } from 'vue'
import { API_BASE_URL, apiCall } from '../../utils/api'
import {
  buildBlueprintPlannerAvailableNodes,
  normalizeBlueprintPlannerPrompt
} from '../../utils/blueprintPlanner.js'
import {
  createGameBlueprintNode,
  upsertGeneratedPlayableBlueprintEdge
} from '../../utils/blueprintNodes.js'
import {
  PROGRESS_STAGE_LABELS,
  buildProgressTrail,
  resolvePersistableRuntimeText
} from '../../utils/blueprintRuntime.js'
import {
  applyWorkflowStartSessionState,
  shouldHydratePersistentRunDetail,
  shouldUsePersistentRunCancel
} from '../../utils/blueprintRunSessionState.js'

export const useBlueprintExecution = ({
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
  getWorkflowPayload,
  applyWorkflowPayload,
  pulseNode,
  resolveBlueprintErrorMessage
}) => {
  const logs = ref([])
  const nodeRuntimeMap = ref({})
  const workflowLoadState = ref('idle')
  const plannerPromptDraft = ref('')
  const planningStatusLabel = ref('AI 正在规划工作流...')
  const latestRunId = ref('')
  const latestRunStatus = ref('idle')
  const latestRunContinuation = ref(null)
  const latestFailedNodeId = ref('')
  const recentRuns = ref([])
  const latestRunDetail = ref(null)
  const isLogPanelHistoryHidden = ref(false)
  const hasSessionRunHistory = ref(false)
  const sessionRunIds = ref([])
  const runHistoryApiAvailable = ref(true)
  const activeRunIsPersistent = ref(false)

  const availablePlannerNodes = buildBlueprintPlannerAvailableNodes()
  const isPlannerRunning = computed(() => workflowLoadState.value === 'planning')

  let logIdCounter = 0
  let activeExecutionController = null
  let generatedPlayableEdgeCounter = 0

  const createGeneratedPlayableEdgeId = () => {
    generatedPlayableEdgeCounter += 1
    return `bp-generated-edge-${Date.now().toString(36)}-${generatedPlayableEdgeCounter}`
  }

  const resetLatestRunTracking = () => {
    latestRunId.value = ''
    latestRunStatus.value = 'idle'
    latestRunContinuation.value = null
    latestFailedNodeId.value = ''
    latestRunDetail.value = null
    activeRunIsPersistent.value = false
  }

  const cancelActiveExecutionStream = () => {
    if (!activeExecutionController) return

    activeExecutionController.abort()
    activeExecutionController = null
  }

  const resolveGeneratedPlayableNodePosition = (sourceNodeId = '') => {
    const sourceNode = blueprintNodes.value.find((node) => String(node.id || '') === String(sourceNodeId || ''))
    if (sourceNode?.position) {
      return {
        x: Number(sourceNode.position.x || 0) + 336,
        y: Number(sourceNode.position.y || 0)
      }
    }

    const rightMostNode = blueprintNodes.value.reduce((currentRightMost, node) => {
      if (!currentRightMost) return node
      return Number(node?.position?.x || 0) > Number(currentRightMost?.position?.x || 0)
        ? node
        : currentRightMost
    }, null)

    return {
      x: Number(rightMostNode?.position?.x || 96) + 336,
      y: Number(rightMostNode?.position?.y || 96)
    }
  }

  const upsertGeneratedPlayableNode = (payload = {}) => {
    const generatedGameId = String(payload.id || '').trim()
    if (!generatedGameId) return ''

    const existingNode = blueprintNodes.value.find((node) =>
      node?.kind === 'game'
      && (
        String(node.gameId || '') === generatedGameId
        || String(node.generatedFromRunId || '') === String(payload.generatedFromRunId || '')
      ))

    const baseNode = createGameBlueprintNode(
      {
        id: generatedGameId,
        title: payload.title,
        category: payload.category,
        description: payload.description,
        engineLabel: payload.engineLabel,
        codeTypeLabel: payload.codeTypeLabel,
        codeSummary: payload.codeSummary,
        codeEntryPath: payload.codeEntryPath,
        codePackageUrl: payload.codePackageUrl,
        coverUrl: payload.coverUrl
      },
      existingNode?.position || resolveGeneratedPlayableNodePosition(payload.generatedFromNodeId),
      () => existingNode?.id || `bp-generated-game-${generatedGameId}`
    )

    const nextNode = {
      ...baseNode,
      previewUrl: String(payload.previewUrl || payload.codePackageUrl || ''),
      isGeneratedPlayable: true,
      generatedFromRunId: payload.generatedFromRunId || '',
      generatedFromNodeId: payload.generatedFromNodeId || ''
    }

    if (existingNode) {
      blueprintNodes.value = blueprintNodes.value.map((node) =>
        node.id === existingNode.id
          ? { ...node, ...nextNode, position: node.position || nextNode.position }
          : node
      )
      return existingNode.id
    }

    blueprintNodes.value = [...blueprintNodes.value, nextNode]
    return nextNode.id
  }

  const connectGeneratedPlayableNodeToSource = (sourceNodeId = '', generatedNodeId = '') => {
    const result = upsertGeneratedPlayableBlueprintEdge(
      blueprintEdges.value,
      sourceNodeId,
      generatedNodeId,
      createGeneratedPlayableEdgeId
    )

    if (result.created) {
      blueprintEdges.value = result.edges
    }

    return result.created
  }

  const resetExecutionLogSession = () => {
    cancelActiveExecutionStream()
    logs.value = []
    recentRuns.value = []
    latestRunDetail.value = null
    hasSessionRunHistory.value = false
    sessionRunIds.value = []
    isLogPanelHistoryHidden.value = false
    resetLatestRunTracking()
  }

  const getLocalFailedContinuation = () => {
    if (latestRunContinuation.value?.nodeId) {
      return {
        nodeId: String(latestRunContinuation.value.nodeId),
        scope: latestRunContinuation.value.scope === 'single' ? 'single' : 'branch'
      }
    }

    if (!latestFailedNodeId.value) {
      return null
    }

    return {
      nodeId: String(latestFailedNodeId.value),
      scope: 'branch'
    }
  }

  const resolveBlueprintLogLevel = (line, level = '') => {
    const normalizedLevel = String(level || '').trim().toLowerCase()
    if (normalizedLevel) return normalizedLevel

    const text = String(line || '').trim()
    if (!text) return 'info'
    if (/^(提示：|警告：)/.test(text)) return 'warning'
    if (/(失败|错误|异常|损坏|空工作流|未返回有效)/.test(text)) return 'error'
    return 'info'
  }

  const appendLog = (line, level = '') => {
    isLogPanelHistoryHidden.value = false
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })

    logIdCounter += 1
    logs.value = [{
      id: `bp-log-${Date.now().toString(36)}-${logIdCounter}`,
      text: `${timestamp} ${line}`,
      level: resolveBlueprintLogLevel(line, level)
    }, ...logs.value].slice(0, 20)
  }

  const disableRunHistoryApi = () => {
    if (!runHistoryApiAvailable.value) return

    runHistoryApiAvailable.value = false
    recentRuns.value = []
    appendLog('当前服务端暂未提供运行历史接口，已切换为兼容模式。', 'warning')
  }

  const syncActiveEditorDraftFromNodeContent = (nodeId, previousContent, nextContent) => {
    if (!activeEditor.value || activeEditor.value.nodeId !== nodeId) return
    if (String(activeEditor.value.draft || '') !== String(previousContent || '')) return

    activeEditor.value = {
      ...activeEditor.value,
      draft: nextContent
    }
  }

  const mergeRuntimeOutputsIntoBlueprintNodes = (targetNodeIds = null) => {
    const allowedNodeIds = Array.isArray(targetNodeIds) && targetNodeIds.length
      ? new Set(targetNodeIds.map((nodeId) => String(nodeId || '')))
      : null

    let didChange = false
    const nextNodes = blueprintNodes.value.map((node) => {
      if (allowedNodeIds && !allowedNodeIds.has(String(node.id || ''))) {
        return node
      }

      const nextContent = resolvePersistableRuntimeText(
        node,
        nodeRuntimeMap.value[node.id],
        isBlueprintCompactNodeKind
      )
      if (!nextContent) return node

      const previousContent = String(node.content || '')
      if (nextContent === previousContent) return node

      didChange = true
      syncActiveEditorDraftFromNodeContent(node.id, previousContent, nextContent)
      return {
        ...node,
        content: nextContent
      }
    })

    if (didChange) {
      blueprintNodes.value = nextNodes
    }

    return didChange ? nextNodes : blueprintNodes.value
  }

  const fetchRunHistory = async ({ limit = 6 } = {}) => {
    if (!runHistoryApiAvailable.value) return
    if (!hasSessionRunHistory.value || !sessionRunIds.value.length) {
      recentRuns.value = []
      latestRunDetail.value = null
      return
    }

    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      if (seed.value) {
        params.set('seed', seed.value)
      }

      const payload = await apiCall(`/blueprints/runs?${params.toString()}`, {
        suppressErrorLogging: true
      })
      const allowedRunIds = new Set(sessionRunIds.value.map((runId) => String(runId || '')))
      recentRuns.value = (Array.isArray(payload?.runs) ? payload.runs : [])
        .filter((run) => allowedRunIds.has(String(run?.id || '')))
    } catch (error) {
      if (error?.status === 404) {
        disableRunHistoryApi()
        return
      }

      appendLog(resolveBlueprintErrorMessage(error, '获取蓝图运行历史失败，请稍后重试。'), 'error')
    }
  }

  const syncLatestRunDetail = async (runId = latestRunId.value, { hydrate = false } = {}) => {
    const targetRunId = String(runId || '').trim()
    if (!targetRunId || !runHistoryApiAvailable.value) return null

    const detail = await apiCall(`/blueprints/runs/${encodeURIComponent(targetRunId)}`, {
      suppressErrorLogging: true
    })

    latestRunDetail.value = detail || null

    if (hydrate && detail?.runtimeSnapshot && typeof detail.runtimeSnapshot === 'object') {
      hydrateRuntimeSnapshot(detail.runtimeSnapshot)
    }

    return detail
  }

  const handleClearLogs = () => {
    logs.value = []
    recentRuns.value = []
    latestRunDetail.value = null
    hasSessionRunHistory.value = false
    resetLatestRunTracking()
    isLogPanelHistoryHidden.value = true
  }

  const resetBlueprintRuntime = () => {
    nodeRuntimeMap.value = {}
  }

  const hydrateRuntimeSnapshot = (runtimeSnapshot = {}) => {
    const nextRuntimeMap = {}

    Object.entries(runtimeSnapshot || {}).forEach(([nodeId, runtime]) => {
      if (!nodeId || !runtime || typeof runtime !== 'object') return
      if (!blueprintNodes.value.some((node) => node.id === nodeId)) return
      nextRuntimeMap[nodeId] = runtime
    })

    nodeRuntimeMap.value = nextRuntimeMap
  }

  const assignNodeRuntime = (nodeId, patch = {}) => {
    if (!nodeId) return

    const currentRuntime = nodeRuntimeMap.value[nodeId] || null
    nodeRuntimeMap.value = {
      ...nodeRuntimeMap.value,
      [nodeId]: {
        ...(currentRuntime || {}),
        ...patch
      }
    }

    if (activeEditor.value?.nodeId === nodeId) {
      activeEditor.value = {
        ...activeEditor.value,
        runtime: nodeRuntimeMap.value[nodeId]
      }
    }
  }

  const collectDownstreamNodeIds = (startNodeId, includeStart = true) => {
    const visited = new Set()
    const pending = [startNodeId]

    while (pending.length) {
      const currentNodeId = pending.shift()
      if (!currentNodeId || visited.has(currentNodeId)) continue
      visited.add(currentNodeId)

      blueprintEdges.value
        .filter((edge) => edge.fromNodeId === currentNodeId)
        .forEach((edge) => {
          if (!visited.has(edge.toNodeId)) {
            pending.push(edge.toNodeId)
          }
        })
    }

    if (!includeStart) {
      visited.delete(startNodeId)
    }

    return [...visited]
  }

  const clearNodeRuntimeEntries = (nodeIds = []) => {
    if (!nodeIds.length) return

    const nextRuntimeMap = { ...nodeRuntimeMap.value }
    nodeIds.forEach((nodeId) => {
      delete nextRuntimeMap[nodeId]
    })
    nodeRuntimeMap.value = nextRuntimeMap
  }

  const buildBlueprintExecutionHeaders = () => {
    return {
      'Content-Type': 'application/json'
    }
  }

  const handleBlueprintExecutionEvent = (event = {}) => {
    if (event.event === 'workflow-start') {
      const sessionState = applyWorkflowStartSessionState({
        latestRunId: latestRunId.value,
        hasSessionRunHistory: hasSessionRunHistory.value,
        sessionRunIds: sessionRunIds.value,
        latestRunStatus: latestRunStatus.value,
        latestRunContinuation: latestRunContinuation.value,
        latestFailedNodeId: latestFailedNodeId.value,
        latestRunDetail: latestRunDetail.value,
        activeRunIsPersistent: activeRunIsPersistent.value
      }, event)

      hasSessionRunHistory.value = sessionState.hasSessionRunHistory
      sessionRunIds.value = sessionState.sessionRunIds
      isLogPanelHistoryHidden.value = false
      latestRunId.value = sessionState.latestRunId
      latestRunStatus.value = sessionState.latestRunStatus
      latestRunContinuation.value = sessionState.latestRunContinuation
      latestFailedNodeId.value = sessionState.latestFailedNodeId
      latestRunDetail.value = sessionState.latestRunDetail
      activeRunIsPersistent.value = sessionState.activeRunIsPersistent
      appendLog(`开始自动执行工作流，模型：${event.model || selectedModel.value}，视觉理解模型：${event.visionModel || selectedVisionModel.value}。`)
      return
    }

    if (event.event === 'step-start') {
      assignNodeRuntime(event.nodeId, {
        status: 'running',
        kind: event.nodeKind,
        model: event.model || (event.mode === 'source' ? selectedVisionModel.value : selectedModel.value),
        startedAt: event.startedAt,
        progressValue: 0.04,
        progressStage: 'queued',
        progressDetail: '正在准备节点执行。',
        progressTrail: [{
          stage: 'queued',
          label: PROGRESS_STAGE_LABELS.queued,
          detail: '正在准备节点执行。'
        }],
        summary: '',
        analysis: '',
        output: ''
      })
      selectedNodeId.value = event.nodeId || selectedNodeId.value
      pulseNode(event.nodeId)
      appendLog(`开始执行节点「${event.nodeTitle || event.nodeId}」。`)
      return
    }

    if (event.event === 'step-progress') {
      const currentRuntime = nodeRuntimeMap.value[event.nodeId] || {}
      assignNodeRuntime(event.nodeId, {
        progressValue: Number.isFinite(Number(event.progress))
          ? Math.max(0, Math.min(1, Number(event.progress)))
          : (currentRuntime.progressValue || 0),
        progressStage: String(event.stage || currentRuntime.progressStage || ''),
        progressDetail: String(event.detail || currentRuntime.progressDetail || ''),
        progressTrail: buildProgressTrail(currentRuntime.progressTrail || [], event)
      })
      return
    }

    if (event.event === 'step-complete') {
      assignNodeRuntime(event.nodeId, {
        ...(event.runtime || {}),
        status: event.runtime?.status || 'completed',
        progressValue: 1,
        progressStage: 'finalize',
        progressDetail: '',
        progressTrail: event.runtime?.progressTrail || []
      })
      mergeRuntimeOutputsIntoBlueprintNodes([event.nodeId])
      selectedNodeId.value = event.nodeId || selectedNodeId.value
      pulseNode(event.nodeId)
      appendLog(`节点「${event.nodeTitle || event.nodeId}」已完成。`)
      return
    }

    if (event.event === 'step-failed') {
      assignNodeRuntime(event.nodeId, {
        ...(event.runtime || {}),
        status: event.runtime?.status || 'failed',
        progressDetail: '',
        progressTrail: event.runtime?.progressTrail || []
      })
      selectedNodeId.value = event.nodeId || selectedNodeId.value
      pulseNode(event.nodeId)
      latestRunStatus.value = 'failed'
      latestFailedNodeId.value = String(event.nodeId || '')
      latestRunContinuation.value = event.nodeId
        ? { nodeId: String(event.nodeId), scope: 'branch' }
        : null
      appendLog(`节点「${event.nodeTitle || event.nodeId}」执行失败。`, 'error')
      return
    }

    if (event.event === 'workflow-complete') {
      latestRunStatus.value = 'completed'
      latestRunContinuation.value = null
      latestFailedNodeId.value = ''
      if (event.executionMode === 'planned' && event.generatedPlayableNode) {
        const generatedNodeId = upsertGeneratedPlayableNode(event.generatedPlayableNode)
        if (generatedNodeId) {
          connectGeneratedPlayableNodeToSource(
            event.generatedPlayableNode.generatedFromNodeId,
            generatedNodeId
          )
          selectedNodeId.value = generatedNodeId
          pulseNode(generatedNodeId)
          appendLog('已将本次 planned 模式生成的 H5 成品落成可游玩节点。')
        }
      }
      appendLog('工作流已自动顺序执行完成。')
      return
    }

    if (event.event === 'workflow-cancelled') {
      latestRunStatus.value = 'cancelled'
      latestRunContinuation.value = null
      latestFailedNodeId.value = ''
      appendLog('工作流已取消。')
      return
    }

    if (event.event === 'workflow-error') {
      latestRunStatus.value = 'failed'
      latestFailedNodeId.value = String(event.failedNodeId || latestFailedNodeId.value || '')
      latestRunContinuation.value = latestFailedNodeId.value
        ? { nodeId: latestFailedNodeId.value, scope: 'branch' }
        : latestRunContinuation.value
      appendLog(event.message || '工作流执行失败。', 'error')
      return
    }

    if (event.event === 'workflow-log') {
      appendLog(event.message || '工作流产生了一条新的运行日志。')
    }
  }

  const streamBlueprintExecution = async ({
    startNodeId = '',
    scope = 'all',
    rerunInstruction = '',
    executionMode = 'default'
  } = {}) => {
    if (isWorkflowBusy.value) return

    if (!blueprintNodes.value.length) {
      appendLog('当前没有节点内容，无法执行工作流。', 'warning')
      return
    }

    workflowLoadState.value = 'executing'
    activeExecutionController = new AbortController()
    const executionController = activeExecutionController
    let wasAborted = false

    try {
      const response = await fetch(`${API_BASE_URL}/blueprints/execute`, {
        method: 'POST',
        credentials: 'include',
        headers: buildBlueprintExecutionHeaders(),
        signal: executionController.signal,
        body: JSON.stringify({
          seed: seed.value,
          model: selectedModel.value,
          modelExplicit: hasExplicitModelSelection?.value === true,
          visionModel: selectedVisionModel.value,
          startNodeId,
          scope,
          executionMode,
          rerunInstruction: String(rerunInstruction || ''),
          runtimeSnapshot: nodeRuntimeMap.value,
          workflow: getWorkflowPayload()
        })
      })

      if (!response.ok) {
        const contentType = String(response.headers.get('content-type') || '').toLowerCase()
        const payload = contentType.includes('application/json')
          ? await response.json()
          : { error: await response.text() }
        throw new Error(payload.error || payload.message || '执行工作流失败')
      }

      if (!response.body) {
        throw new Error('执行接口未返回可读取的数据流')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        lines.forEach((line) => {
          const trimmed = String(line || '').trim()
          if (!trimmed) return
          handleBlueprintExecutionEvent(JSON.parse(trimmed))
        })
      }

      if (buffer.trim()) {
        handleBlueprintExecutionEvent(JSON.parse(buffer.trim()))
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        wasAborted = true
      }

      if (wasAborted) {
        return
      }

      appendLog(error?.message || '执行工作流失败，请稍后重试。', 'error')
    } finally {
      if (executionController.signal.aborted) {
        wasAborted = true
      }

      if (activeExecutionController === executionController) {
        activeExecutionController = null
      }

      if (wasAborted) {
        workflowLoadState.value = 'idle'
        return
      }

      await fetchRunHistory()
      if (shouldHydratePersistentRunDetail({
        runHistoryApiAvailable: runHistoryApiAvailable.value,
        latestRunId: latestRunId.value,
        activeRunIsPersistent: activeRunIsPersistent.value
      })) {
        try {
          await syncLatestRunDetail(latestRunId.value, { hydrate: true })
        } catch (error) {
          if (error?.status === 404) {
            disableRunHistoryApi()
          }
        }
      }
      workflowLoadState.value = 'idle'
    }
  }

  const handleExecuteWorkflow = async () => {
    resetExecutionLogSession()
    resetBlueprintRuntime()
    await streamBlueprintExecution({ scope: 'all' })
  }

  const updatePlannerPromptDraft = (value) => {
    plannerPromptDraft.value = String(value || '')
  }

  const handleSubmitPlannerPrompt = async () => {
    const prompt = normalizeBlueprintPlannerPrompt(plannerPromptDraft.value)

    if (!prompt) {
      appendLog('请先输入你希望 AI 生成的工作流需求。', 'warning')
      return
    }

    if (isWorkflowBusy.value) return

    resetExecutionLogSession()
    workflowLoadState.value = 'planning'
    planningStatusLabel.value = '正在分析你的需求并匹配最合适的节点组合。'
    appendLog(`正在根据需求规划工作流：${prompt}`)

    try {
      const payload = await apiCall('/blueprints/plan', {
        method: 'POST',
        body: JSON.stringify({
          seed: seed.value,
          prompt,
          workflow: getWorkflowPayload(),
          availableNodes: availablePlannerNodes,
          model: selectedModel.value,
          modelExplicit: hasExplicitModelSelection?.value === true,
          visionModel: selectedVisionModel.value
        })
      })

      if (!payload?.workflow || !Array.isArray(payload.workflow.nodes)) {
        throw new Error('AI 没有返回有效的工作流。')
      }

      planningStatusLabel.value = '已完成规划，正在把新工作流铺到画布上。'
      applyWorkflowPayload(payload.workflow, { focusNodes: true })
      plannerPromptDraft.value = ''

      appendLog(payload.summary || 'AI 已根据需求更新工作流。')
      ;(Array.isArray(payload.changes) ? payload.changes : [])
        .filter(Boolean)
        .slice(0, 6)
        .forEach((change) => appendLog(`变更：${change}`))
      ;(Array.isArray(payload.warnings) ? payload.warnings : [])
        .filter(Boolean)
        .slice(0, 4)
        .forEach((warning) => appendLog(`提示：${warning}`, 'warning'))

      workflowLoadState.value = 'idle'
      appendLog('开始自动执行更新后的工作流。')
      await streamBlueprintExecution({ scope: 'all', executionMode: 'planned' })
    } catch (error) {
      appendLog(resolveBlueprintErrorMessage(error, '工作流规划失败，请稍后重试。'), 'error')
      planningStatusLabel.value = 'AI 正在规划工作流...'
      workflowLoadState.value = 'idle'
    }
  }

  const handleExecuteNode = async (nodeId, options = {}) => {
    const normalizedNodeId = String(nodeId || '').trim()
    if (!normalizedNodeId) return

    resetExecutionLogSession()

    const scope = options.scope === 'single' ? 'single' : 'branch'
    const rerunInstruction = String(options.rerunInstruction || '').trim()
    const affectedNodeIds = scope === 'single'
      ? [normalizedNodeId]
      : collectDownstreamNodeIds(normalizedNodeId, true)

    clearNodeRuntimeEntries(affectedNodeIds)
    selectedNodeId.value = normalizedNodeId
    appendLog(
      scope === 'single'
        ? `准备重跑节点「${normalizedNodeId}」。`
        : `准备从节点「${normalizedNodeId}」继续执行到下游。`
    )
    if (scope === 'single' && rerunInstruction) {
      appendLog(`本次重跑补充说明：${rerunInstruction}`)
    }

    await streamBlueprintExecution({
      startNodeId: normalizedNodeId,
      scope: scope === 'single' ? 'single' : 'branch',
      rerunInstruction: scope === 'single' ? rerunInstruction : ''
    })
  }

  const handleContinueFromFailedRun = async (runId = latestRunId.value) => {
    const targetRunId = String(runId || latestRunId.value || '').trim()
    const localContinuation = getLocalFailedContinuation()

    try {
      if (!runHistoryApiAvailable.value) {
        if (!localContinuation?.nodeId) {
          appendLog('当前没有可继续的失败节点。', 'warning')
          return
        }

        appendLog('当前服务端未提供运行历史接口，已使用当前会话状态从失败节点继续。', 'warning')
        await handleExecuteNode(localContinuation.nodeId, {
          scope: localContinuation.scope
        })
        return
      }

      if (!targetRunId) {
        if (!localContinuation?.nodeId) {
          appendLog('当前没有可继续的运行记录。', 'warning')
          return
        }

        await handleExecuteNode(localContinuation.nodeId, {
          scope: localContinuation.scope
        })
        return
      }

      latestRunId.value = targetRunId
      const runDetail = await syncLatestRunDetail(targetRunId, { hydrate: true })
      latestRunStatus.value = String(runDetail?.status || latestRunStatus.value || 'idle')
      latestRunContinuation.value = runDetail?.continuation || null
      latestFailedNodeId.value = String(runDetail?.continuation?.nodeId || latestFailedNodeId.value || '')

      const continuation = runDetail?.continuation || null
      if (!continuation?.nodeId) {
        appendLog('最近一次运行没有可继续的失败节点。', 'warning')
        return
      }

      appendLog(`已载入运行 #${targetRunId}，准备从失败节点继续。`)
      await handleExecuteNode(continuation.nodeId, {
        scope: continuation.scope === 'single' ? 'single' : 'branch'
      })
    } catch (error) {
      if (error?.status === 404) {
        disableRunHistoryApi()

        if (localContinuation?.nodeId) {
          appendLog('运行详情接口不可用，已回退到当前会话状态继续执行。', 'warning')
          await handleExecuteNode(localContinuation.nodeId, {
            scope: localContinuation.scope
          })
          return
        }
      }

      appendLog(resolveBlueprintErrorMessage(error, '加载运行记录失败，请稍后重试。'), 'error')
    }
  }

  const handleCancelLatestRun = async (runId = latestRunId.value) => {
    const targetRunId = String(runId || latestRunId.value || '').trim()
    if (!activeRunIsPersistent.value) {
      if (!activeExecutionController) {
        appendLog('当前没有可取消的运行记录。', 'warning')
        return
      }

      cancelActiveExecutionStream()
      latestRunStatus.value = 'cancelled'
      latestRunContinuation.value = null
      latestFailedNodeId.value = ''
      appendLog('当前未保存工作流的执行已在本地取消。')
      return
    }

    if (!targetRunId) {
      appendLog('当前没有可取消的运行记录。', 'warning')
      return
    }

    try {
      if (!shouldUsePersistentRunCancel({
        runHistoryApiAvailable: runHistoryApiAvailable.value,
        latestRunId: targetRunId,
        activeRunIsPersistent: activeRunIsPersistent.value
      })) {
        appendLog('当前服务端暂未提供运行取消接口。', 'warning')
        return
      }

      latestRunId.value = targetRunId
      const payload = await apiCall(`/blueprints/runs/${encodeURIComponent(latestRunId.value)}/cancel`, {
        method: 'POST',
        suppressErrorLogging: true
      })
      latestRunStatus.value = String(payload?.status || 'cancel_requested')
      appendLog(`已请求取消运行 #${targetRunId}。`)
      await fetchRunHistory()
    } catch (error) {
      if (error?.status === 404) {
        disableRunHistoryApi()
        appendLog('当前服务端暂未提供运行取消接口。', 'warning')
        return
      }

      appendLog(resolveBlueprintErrorMessage(error, '取消运行失败，请稍后重试。'), 'error')
    }
  }

  return {
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
    mergeRuntimeOutputsIntoBlueprintNodes,
    handleClearLogs,
    handleExecuteWorkflow,
    updatePlannerPromptDraft,
    handleSubmitPlannerPrompt,
    handleExecuteNode,
    handleContinueFromFailedRun,
    handleCancelLatestRun,
    cancelActiveExecutionStream
  }
}
