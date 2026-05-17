import { apiCall } from './api'

export const DISCUSSION_DOCUMENT_ACCEPT = '.pdf,.md,.txt,.doc,.docx'
export const DISCUSSION_DOCUMENT_SOURCE_LOCAL = 'local'
export const DISCUSSION_DOCUMENT_SOURCE_OFFICIAL = 'official'

export const toDiscussionDocumentApiSource = (source = '') => (
  source === DISCUSSION_DOCUMENT_SOURCE_OFFICIAL ? 'official' : 'upload'
)

export const normalizeRoomDocument = (document = {}) => {
  const name = String(document?.name || document?.file_name || '').trim()
  if (!name) return null

  const fallbackId = `${name}-${document.uploaded_at || document.created_at || Date.now()}`
  const id = String(document.id || document.document_id || fallbackId).trim()
  const pageCount = Number.parseInt(document.page_count, 10)

  return {
    id,
    name,
    url: String(document.url || document.file_url || '').trim(),
    size: Number(document.size || document.file_size || 0),
    mimeType: String(document.mime_type || '').trim(),
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null,
    status: String(document.status || 'uploaded').trim() || 'uploaded',
    source: String(document.source || 'upload').trim() || 'upload',
    previewText: String(document.preview_text || '').trim(),
    uploadedAt: document.uploaded_at || document.created_at || null
  }
}

export const normalizeRoomDocuments = (documents = []) => (
  Array.isArray(documents)
    ? documents.map((document) => normalizeRoomDocument(document)).filter(Boolean)
    : []
)

export const mergeRoomDocument = (documents = [], document = null) => {
  if (!document) return Array.isArray(documents) ? documents : []
  const existing = Array.isArray(documents) ? documents : []
  return [
    document,
    ...existing.filter((item) => String(item.id) !== String(document.id))
  ]
}

export const canRenderRoomDocumentAsMarkdown = (document = null) => {
  const url = String(document?.url || '').trim()
  const mimeType = String(document?.mimeType || '').toLowerCase()
  return Boolean(url) && (
    /\.md($|\?)/i.test(url)
    || mimeType.includes('markdown')
    || mimeType.startsWith('text/')
  )
}

export const fetchRoomDocuments = async (roomId) => {
  const id = Number(roomId || 0)
  if (!id) return { documents: [], selectedDocumentId: null }

  const data = await apiCall(`/discussion/rooms/${id}/documents`)
  return {
    documents: normalizeRoomDocuments(data?.documents),
    selectedDocumentId: data?.selectedDocumentId || null
  }
}

export const uploadRoomDocument = async ({ roomId, file, source = DISCUSSION_DOCUMENT_SOURCE_LOCAL } = {}) => {
  const id = Number(roomId || 0)
  if (!id) {
    throw new Error('当前没有可用房间')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('source', toDiscussionDocumentApiSource(source))

  return apiCall(`/discussion/rooms/${id}/documents`, {
    method: 'POST',
    body: formData
  })
}

export const selectCurrentRoomDocument = (roomId, documentId) => (
  apiCall(`/discussion/rooms/${Number(roomId || 0)}/documents/current`, {
    method: 'PATCH',
    body: JSON.stringify({ documentId })
  })
)

export const deleteRoomDocument = (roomId, documentId) => (
  apiCall(`/discussion/rooms/${Number(roomId || 0)}/documents/${documentId}`, {
    method: 'DELETE'
  })
)

export const createOfficialDocumentFile = async (doc = {}) => {
  if (!doc?.file) {
    throw new Error('官方文档地址无效')
  }

  const response = await fetch(doc.file)
  if (!response.ok) {
    throw new Error('官方文档读取失败')
  }

  const markdown = await response.text()
  const fileName = String(doc.file.split('/').pop() || `${doc.id || 'official-doc'}.md`).trim() || 'official-doc.md'
  return new File([markdown], fileName, { type: 'text/markdown' })
}
