import { useAuthStore } from '../stores/auth'
import { normalizeApiBase } from './apiBase.js'
import {
  handleAdminSecurityResponse,
  withAdminSecurityHeaders
} from './adminSecurity.js'

const envApiBase = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env.VITE_API_BASE_URL
  : ''

export const API_BASE_URL = normalizeApiBase(envApiBase || '/api')

const AUTH_ERROR_PATTERNS = [
  '登录已过期',
  '请重新登录',
  '无效的访问令牌',
  '访问令牌缺失',
  '未认证',
  'unauthorized',
  'invalid token',
  'token expired',
]

const isAuthFailureResponse = (response, data = {}) => {
  if (response.status === 401) return true
  if (response.status !== 403) return false

  const combinedText = [
    data?.error,
    data?.message
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return AUTH_ERROR_PATTERNS.some((pattern) => combinedText.includes(String(pattern).toLowerCase()))
}

export async function apiCall(endpoint, options = {}) {
  const authStore = useAuthStore()
  const url = `${API_BASE_URL}${endpoint}`

  const isFormDataBody = typeof FormData !== 'undefined' && options.body instanceof FormData

  const defaultOptions = {
    credentials: 'include',
    headers: {},
  }

  if (!isFormDataBody) {
    defaultOptions.headers['Content-Type'] = 'application/json'
  }

  let finalOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  }

  if (endpoint.startsWith('/admin')) {
    finalOptions = withAdminSecurityHeaders(finalOptions)
  }

  delete finalOptions.suppressErrorLogging

  if (isFormDataBody && finalOptions.headers) {
    delete finalOptions.headers['Content-Type']
    delete finalOptions.headers['content-type']
  }

  try {
    const response = await fetch(url, finalOptions)
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const data = contentType.includes('application/json')
      ? await response.json()
      : {}

    handleAdminSecurityResponse(response, data)

    // 处理认证错误
    if (isAuthFailureResponse(response, data)) {
      // 清除无效token
      localStorage.removeItem('token')
      authStore.logout()
      throw new Error(data.message || '登录已过期，请重新登录')
    }

    if (!response.ok) {
      const error = new Error(data.error || data.message || '请求失败')
      error.status = response.status
      error.payload = data
      throw error
    }

    return data
  } catch (error) {
    if (!options.suppressErrorLogging) {
      console.error('API调用错误:', error)
    }
    throw error
  }
}
