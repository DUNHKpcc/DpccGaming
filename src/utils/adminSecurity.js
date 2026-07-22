const ADMIN_SECURITY_CODES = new Set([
  'ADMIN_TOTP_ENROLLMENT_REQUIRED',
  'ADMIN_ELEVATION_REQUIRED',
  'ADMIN_REAUTH_REQUIRED'
])

const isUnsafeMethod = (method = 'GET') => !['GET', 'HEAD', 'OPTIONS'].includes(
  String(method || 'GET').toUpperCase()
)

export const withAdminSecurityHeaders = (options = {}) => {
  if (!isUnsafeMethod(options.method)) return options

  return {
    ...options,
    headers: {
      ...options.headers,
      'X-DPCC-Admin-Request': '1'
    }
  }
}

export const handleAdminSecurityResponse = (response, payload = {}) => {
  const code = String(payload?.code || '')
  if (response.status !== 428 || !ADMIN_SECURITY_CODES.has(code)) return false

  window.dispatchEvent(new CustomEvent('admin-security-required', {
    detail: { code, message: payload?.error || payload?.message || '' }
  }))
  return true
}

export const adminFetch = async (input, options = {}) => {
  const finalOptions = withAdminSecurityHeaders({
    credentials: 'include',
    ...options
  })
  const response = await fetch(input, finalOptions)

  if (response.status === 428) {
    const payload = await response.clone().json().catch(() => ({}))
    handleAdminSecurityResponse(response, payload)
  }

  return response
}
