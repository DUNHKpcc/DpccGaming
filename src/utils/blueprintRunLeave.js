const ACTIVE_BLUEPRINT_RUN_STATUSES = new Set(['running', 'cancel_requested'])
const DEFAULT_BLUEPRINT_API_BASE_URL = '/api'

export const isBlueprintRunActiveForAutoCancel = ({
  runId = '',
  status = '',
  runHistoryApiAvailable = true
} = {}) =>
  Boolean(
    runHistoryApiAvailable
    && String(runId || '').trim()
    && ACTIVE_BLUEPRINT_RUN_STATUSES.has(String(status || '').trim())
  )

export const buildBlueprintRunCancelUrl = (runId = '', apiBaseUrl = DEFAULT_BLUEPRINT_API_BASE_URL) =>
  `${String(apiBaseUrl || '').replace(/\/$/, '')}/blueprints/runs/${encodeURIComponent(String(runId || '').trim())}/cancel`

export const requestBlueprintRunCancelOnLeave = ({
  runId = '',
  apiBaseUrl = DEFAULT_BLUEPRINT_API_BASE_URL,
  sendBeaconImpl = typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
    ? navigator.sendBeacon.bind(navigator)
    : null,
  fetchImpl = typeof fetch === 'function' ? fetch : null
} = {}) => {
  const normalizedRunId = String(runId || '').trim()
  if (!normalizedRunId) return false

  const url = buildBlueprintRunCancelUrl(normalizedRunId, apiBaseUrl)
  const body = '{}'

  if (typeof sendBeaconImpl === 'function') {
    try {
      const payload = typeof Blob === 'function'
        ? new Blob([body], { type: 'application/json' })
        : body
      if (sendBeaconImpl(url, payload)) {
        return true
      }
    } catch {
      // fall through to keepalive fetch
    }
  }

  if (typeof fetchImpl === 'function') {
    const headers = {
      'Content-Type': 'application/json'
    }

    void fetchImpl(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers,
      body
    })
    return true
  }

  return false
}
