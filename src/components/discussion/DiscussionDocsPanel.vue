<template>
  <div class="discussion-docs-panel">
    <div v-if="!currentChat" class="docs-fallback-shell">
      <h3>文档区</h3>
      <p>请先在左侧选择一个讨论房间。</p>
    </div>
    <div v-else class="docs-shell-card">
      <div class="right-docs-shell">
        <transition name="docs-view-switch" mode="out-in">
          <div v-if="showDocsUploadLanding" key="docs-upload-landing" class="docs-upload-landing">
            <h3>上传文档</h3>
            <p>选择上传方式</p>
            <button
              type="button"
              class="docs-upload-primary"
              :disabled="uploadingDocument || !currentChat"
              @click="openDocumentUploader({ lockToLibrary: true, source: 'local' })"
            >
              <i class="fa fa-upload"></i>
              <span>{{ uploadingDocument ? '上传中...' : '上传本地文档' }}</span>
            </button>
            <button
              type="button"
              class="docs-upload-secondary"
              :disabled="uploadingDocument || !currentChat"
              @click="openDocumentUploader({ lockToLibrary: true, source: 'official' })"
            >
              <i class="fa fa-book"></i>
              <span>选择官方文档上传</span>
            </button>
            <div v-if="docsError" class="docs-upload-error">{{ docsError }}</div>
          </div>

          <div v-else-if="showDocsLoadingShell" key="docs-loading-shell" class="docs-loading-shell">
            <div class="docs-loading-state">文档加载中...</div>
          </div>

          <div v-else key="docs-library" class="docs-library-layout" :class="{ collapsed: docsSidebarCollapsed }">
            <aside v-if="!docsSidebarCollapsed" class="docs-sidebar">
              <div class="docs-sidebar-head">
                <strong>文档</strong>
              </div>

              <div class="docs-sidebar-section">
                <h4>已上传文档（{{ currentRoomDocuments.length }}）</h4>
                <div v-if="docsLoading && !currentRoomDocuments.length" class="docs-side-empty">文档加载中...</div>
                <div v-else-if="!currentRoomDocuments.length" class="docs-side-empty">还没有上传文档</div>
                <div
                  v-for="doc in currentRoomDocuments"
                  :key="doc.id"
                  class="docs-item-row"
                  :class="{ active: currentRoomDocument?.id === doc.id }"
                >
                  <button
                    type="button"
                    class="docs-item"
                    @click="selectRoomDocument(doc.id)"
                  >
                    <i class="fa fa-file-text-o"></i>
                    <span>{{ doc.name }}</span>
                  </button>
                  <button
                    type="button"
                    class="docs-item-delete"
                    :disabled="uploadingDocument || deletingDocumentId === doc.id"
                    title="删除文档"
                    @click.stop="requestDeleteDocument(doc)"
                  >
                    <i :class="deletingDocumentId === doc.id ? 'fa fa-spinner fa-spin' : 'fa fa-trash'"></i>
                  </button>
                </div>
              </div>

              <div class="docs-sidebar-actions">
                <button
                  type="button"
                  class="docs-upload-primary side"
                  :disabled="uploadingDocument || !currentChat"
                  @click="openDocumentUploader({ lockToLibrary: true, source: 'local' })"
                >
                  <i class="fa fa-upload"></i>
                  <span>{{ uploadingDocument ? '上传中...' : '上传文档' }}</span>
                </button>
                <button
                  type="button"
                  class="docs-upload-secondary side"
                  :disabled="uploadingDocument || !currentChat"
                  @click="openDocumentUploader({ lockToLibrary: true, source: 'official' })"
                >
                  <i class="fa fa-book"></i>
                  <span>官方文档</span>
                </button>
              </div>
            </aside>

            <section class="docs-preview-pane">
              <header class="docs-preview-head">
                <div class="docs-preview-head-main">
                  <button type="button" class="docs-sidebar-toggle header" @click="docsSidebarCollapsed = !docsSidebarCollapsed">
                    <i :class="docsSidebarCollapsed ? 'fa fa-angle-right' : 'fa fa-angle-left'"></i>
                  </button>
                  <strong>{{ currentRoomDocument?.name || '未选择文档' }}</strong>
                </div>
                <span>{{ currentRoomDocumentPageLabel }}</span>
              </header>
              <div class="docs-preview-body">
                <div v-if="docsPreviewLoading" class="docs-loading-state">文档加载中...</div>
                <div v-else-if="docsPreviewError" class="docs-error-state">{{ docsPreviewError }}</div>
                <div
                  v-else-if="renderedMarkdown"
                  class="docs-markdown-content"
                  @click="handleMarkdownContentClick"
                  v-html="renderedMarkdown"
                ></div>
                <template v-else>
                  <h3>Discussion Mode 文档展示</h3>
                  <p>该区域为文档直接展示区。点击左侧文档列表可快速切换当前阅读内容，侧边栏支持收起。</p>
                  <hr />
                  <p>当前文档：{{ currentRoomDocument?.name || '尚未上传文档' }}</p>
                  <p>状态：{{ currentRoomDocument ? '已上传，可用于会话上下文。' : '暂未上传，点击左下角上传文档继续。' }}</p>
                </template>
              </div>
            </section>
          </div>
        </transition>
      </div>
    </div>

    <input
      ref="documentInputRef"
      type="file"
      class="attachment-input-hidden"
      :accept="documentAccept"
      @change="onDocumentFileChange"
    />

    <div v-if="showOfficialDocsPicker" class="docs-picker-mask" @click="closeOfficialDocsPicker">
      <div class="docs-picker-panel" @click.stop>
        <div class="docs-picker-head">
          <strong>选择官方文档</strong>
          <button type="button" class="docs-picker-close" @click="closeOfficialDocsPicker">
            <i class="fa fa-times"></i>
          </button>
        </div>
        <div class="docs-picker-body">
          <button
            v-for="doc in officialDocs"
            :key="doc.id"
            type="button"
            class="docs-picker-item"
            :disabled="uploadingDocument"
            @click="selectOfficialDocument(doc)"
          >
            <div class="docs-picker-item-main">
              <strong>{{ doc.title }}</strong>
              <span>{{ doc.summary }}</span>
            </div>
            <i class="fa fa-angle-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { docsList } from '../../data/docsList'
import { useNotificationStore } from '../../stores/notification'
import { highlightCodeAsync, warmupCodeHighlighter } from '../../utils/asyncCodeHighlighter'
import { fetchPublicDocs } from '../../utils/contentApi'
import { normalizeDocs } from '../../utils/contentCatalog'
import {
  DISCUSSION_DOCUMENT_ACCEPT,
  DISCUSSION_DOCUMENT_SOURCE_LOCAL,
  DISCUSSION_DOCUMENT_SOURCE_OFFICIAL,
  canRenderRoomDocumentAsMarkdown,
  createOfficialDocumentFile,
  deleteRoomDocument,
  fetchRoomDocuments,
  mergeRoomDocument,
  normalizeRoomDocument,
  resolveDiscussionDocAssetUrl,
  selectCurrentRoomDocument,
  uploadRoomDocument
} from '../../utils/discussionDocuments'
import { escapeHtml, renderInlineMarkdown, renderMarkdownToHtml, resolveDocAssetUrl } from '../../utils/markdownRenderer.mjs'

const DOC_DELETE_CONFIRM_WINDOW_MS = 5000

export default {
  name: 'DiscussionDocsPanel',
  props: {
    currentChat: {
      type: Object,
      default: null
    },
    isActive: {
      type: Boolean,
      default: false
    },
    documentPreviewRequest: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      documentAccept: DISCUSSION_DOCUMENT_ACCEPT,
      roomDocumentsByRoom: {},
      selectedDocumentIdByRoom: {},
      docsPanelLockedByRoom: {},
      docsSidebarCollapsed: false,
      docsLoading: false,
      docsError: '',
      docsPreviewLoading: false,
      docsPreviewError: '',
      renderedMarkdown: '',
      docsResolvedByRoom: {},
      uploadingDocument: false,
      deletingDocumentId: null,
      pendingDeleteDocumentId: null,
      deleteConfirmTimer: null,
      pendingDocumentSource: DISCUSSION_DOCUMENT_SOURCE_LOCAL,
      showOfficialDocsPicker: false,
      officialDocs: normalizeDocs(docsList),
      notificationStore: useNotificationStore()
    }
  },
  computed: {
    currentRoomKey() {
      const roomId = Number(this.currentChat?.id || 0)
      return roomId > 0 ? String(roomId) : ''
    },
    currentRoomDocuments() {
      if (!this.currentRoomKey) return []
      return Array.isArray(this.roomDocumentsByRoom[this.currentRoomKey])
        ? this.roomDocumentsByRoom[this.currentRoomKey]
        : []
    },
    currentRoomDocument() {
      if (!this.currentRoomDocuments.length) return null
      const selectedId = String(this.selectedDocumentIdByRoom[this.currentRoomKey] || '')
      return this.currentRoomDocuments.find((item) => String(item.id) === selectedId) || this.currentRoomDocuments[0] || null
    },
    currentRoomDocumentPageLabel() {
      if (this.currentRoomDocument?.pageCount) {
        return `${this.currentRoomDocument.pageCount} 页`
      }
      return this.currentRoomDocument ? '文档' : '--'
    },
    docsPanelLocked() {
      if (!this.currentRoomKey) return false
      return this.docsPanelLockedByRoom[this.currentRoomKey] === true
    },
    hasResolvedCurrentRoomDocuments() {
      if (!this.currentRoomKey) return false
      return this.docsResolvedByRoom[this.currentRoomKey] === true
    },
    showDocsUploadLanding() {
      return this.hasResolvedCurrentRoomDocuments && !this.docsLoading && !this.docsPanelLocked && !this.currentRoomDocuments.length
    },
    showDocsLoadingShell() {
      if (!this.currentRoomKey) return false
      return !this.hasResolvedCurrentRoomDocuments
    }
  },
  watch: {
    isActive(nextActive) {
      if (!nextActive) return
      this.ensureCurrentRoomDocuments({ force: true })
    },
    currentRoomKey(nextKey, previousKey) {
      if (nextKey === previousKey) return
      this.docsSidebarCollapsed = false
      this.docsError = ''
      this.docsPreviewError = ''
      this.renderedMarkdown = ''
      if (this.isActive && nextKey) {
        this.ensureCurrentRoomDocuments({ force: true })
      }
    },
    currentRoomDocument: {
      immediate: true,
      handler(nextDocument) {
        if (!this.isActive) return
        this.loadCurrentDocumentContent(nextDocument)
      }
    },
    documentPreviewRequest: {
      deep: true,
      handler(nextRequest) {
        this.openDocumentFromPreviewRequest(nextRequest)
      }
    }
  },
  mounted() {
    warmupCodeHighlighter()
    this.loadOfficialDocs()
    window.addEventListener('discussion-documents-sync', this.handleDocumentsSyncEvent)
    if (this.isActive && this.currentRoomKey) {
      this.ensureCurrentRoomDocuments({ force: true })
    }
  },
  beforeUnmount() {
    window.removeEventListener('discussion-documents-sync', this.handleDocumentsSyncEvent)
    this.clearDeleteConfirmState()
  },
  methods: {
    markRoomDocumentsResolved(roomId, resolved = true) {
      const roomKey = String(Number(roomId) || '')
      if (!roomKey) return
      this.docsResolvedByRoom = {
        ...this.docsResolvedByRoom,
        [roomKey]: resolved === true
      }
    },
    clearDeleteConfirmState() {
      if (this.deleteConfirmTimer) {
        window.clearTimeout(this.deleteConfirmTimer)
        this.deleteConfirmTimer = null
      }
      this.pendingDeleteDocumentId = null
    },
    escapeHtml,
    resolveDocAssetUrl,
    renderInline(text = '', baseUrl = '') {
      return renderInlineMarkdown(text, { baseUrl })
    },
    decodeMarkdownCode(encoded = '') {
      try {
        return decodeURIComponent(String(encoded || ''))
      } catch {
        return String(encoded || '')
      }
    },
    async handleMarkdownContentClick(event) {
      const button = event.target?.closest?.('[data-action="copy-code"]')
      if (!button) return

      const block = button.closest('.markdown-code-block')
      const code = this.decodeMarkdownCode(block?.dataset?.code || '')
      if (!code) return

      try {
        await navigator.clipboard.writeText(code)
        this.notificationStore.success('已复制', '代码块内容已复制到剪贴板')
      } catch (error) {
        this.notificationStore.error('复制失败', error?.message || '请检查浏览器权限')
      }
    },
    async markdownToHtml(markdown = '', baseUrl = '') {
      return renderMarkdownToHtml(markdown, {
        baseUrl,
        resolveAssetUrl: resolveDiscussionDocAssetUrl,
        renderCodeBlock: async ({ code, language }) => {
          const highlighted = await highlightCodeAsync(code, { language })
          return highlighted
        }
      })
    },
    async loadOfficialDocs() {
      try {
        const docs = normalizeDocs(await fetchPublicDocs())
        if (docs.length) {
          this.officialDocs = docs
        }
      } catch {
        // Keep the bundled fallback docs when the content API is unavailable.
      }
    },
    async loadCurrentDocumentContent(document) {
      if (!document) {
        this.renderedMarkdown = ''
        this.docsPreviewError = ''
        this.docsPreviewLoading = false
        return
      }

      const url = String(document.url || '').trim()
      if (!canRenderRoomDocumentAsMarkdown(document)) {
        this.renderedMarkdown = ''
        this.docsPreviewError = ''
        this.docsPreviewLoading = false
        return
      }

      this.docsPreviewLoading = true
      this.docsPreviewError = ''
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error('文档内容加载失败')
        }

        const markdown = await response.text()
        this.renderedMarkdown = await this.markdownToHtml(markdown, url)
      } catch (error) {
        this.renderedMarkdown = ''
        this.docsPreviewError = error.message || '文档内容加载失败'
      } finally {
        this.docsPreviewLoading = false
      }
    },
    normalizeRoomDocument,
    setCurrentRoomDocuments(roomId, documents = []) {
      const roomKey = String(Number(roomId) || '')
      if (!roomKey) return

      const nextDocuments = Array.isArray(documents) ? documents : []
      this.roomDocumentsByRoom = {
        ...this.roomDocumentsByRoom,
        [roomKey]: nextDocuments
      }

      if (!nextDocuments.length) {
        const nextSelected = { ...this.selectedDocumentIdByRoom }
        delete nextSelected[roomKey]
        this.selectedDocumentIdByRoom = nextSelected
        return
      }

      const activeId = String(this.selectedDocumentIdByRoom[roomKey] || '')
      const exists = nextDocuments.some((doc) => String(doc.id) === activeId)
      if (!exists) {
        this.selectedDocumentIdByRoom = {
          ...this.selectedDocumentIdByRoom,
          [roomKey]: String(nextDocuments[0].id)
        }
      }
    },
    setCurrentRoomSelectedDocument(roomId, documentId) {
      const roomKey = String(Number(roomId) || '')
      if (!roomKey) return
      this.selectedDocumentIdByRoom = {
        ...this.selectedDocumentIdByRoom,
        [roomKey]: String(documentId || '')
      }
    },
    setDocsPanelLocked(roomId, locked = true) {
      const roomKey = String(Number(roomId) || '')
      if (!roomKey) return
      this.docsPanelLockedByRoom = {
        ...this.docsPanelLockedByRoom,
        [roomKey]: locked === true
      }
    },
    async ensureCurrentRoomDocuments(options = {}) {
      const roomId = Number(this.currentChat?.id || 0)
      if (!roomId) return []
      const roomKey = String(roomId)
      const force = options?.force === true

      this.docsError = ''
      if (!force && Array.isArray(this.roomDocumentsByRoom[roomKey])) {
        return this.roomDocumentsByRoom[roomKey]
      }

      this.docsLoading = true
      try {
        const data = await fetchRoomDocuments(roomId)
        const documents = data.documents
        this.setCurrentRoomDocuments(roomId, documents)
        if (data?.selectedDocumentId) {
          this.setCurrentRoomSelectedDocument(roomId, data.selectedDocumentId)
        }
        if (documents.length) {
          this.setDocsPanelLocked(roomId, true)
        }
        return documents
      } catch (error) {
        if (!Array.isArray(this.roomDocumentsByRoom[roomKey])) {
          this.setCurrentRoomDocuments(roomId, [])
        }
        this.docsError = error.message || '加载文档失败'
        return []
      } finally {
        this.markRoomDocumentsResolved(roomId, true)
        this.docsLoading = false
      }
    },
    async selectRoomDocument(documentId) {
      if (!this.currentChat || !documentId) return
      const roomId = Number(this.currentChat.id || 0)
      if (!roomId) return
      const previousId = this.selectedDocumentIdByRoom[String(roomId)] || ''
      this.setCurrentRoomSelectedDocument(this.currentChat.id, documentId)
      this.docsError = ''
      try {
        await selectCurrentRoomDocument(roomId, documentId)
      } catch (error) {
        this.setCurrentRoomSelectedDocument(roomId, previousId)
        this.docsError = error.message || '切换文档失败'
      }
    },
    openDocumentUploader(options = {}) {
      if (!this.currentChat || this.uploadingDocument) return
      const lockToLibrary = options?.lockToLibrary !== false
      const source = options?.source === DISCUSSION_DOCUMENT_SOURCE_OFFICIAL
        ? DISCUSSION_DOCUMENT_SOURCE_OFFICIAL
        : DISCUSSION_DOCUMENT_SOURCE_LOCAL
      if (lockToLibrary) {
        this.setDocsPanelLocked(this.currentChat.id, true)
      }
      if (source === DISCUSSION_DOCUMENT_SOURCE_OFFICIAL) {
        this.pendingDocumentSource = DISCUSSION_DOCUMENT_SOURCE_OFFICIAL
        this.docsError = ''
        this.showOfficialDocsPicker = true
        return
      }
      this.pendingDocumentSource = source
      this.docsError = ''
      this.$nextTick(() => {
        const input = this.$refs.documentInputRef
        if (!input) return
        input.value = ''
        input.click()
      })
    },
    async onDocumentFileChange(event) {
      const file = event?.target?.files?.[0]
      if (!file) {
        this.pendingDocumentSource = DISCUSSION_DOCUMENT_SOURCE_LOCAL
        return
      }
      if (!this.currentChat) {
        this.docsError = '请先选择一个讨论房间'
        event.target.value = ''
        return
      }

      this.uploadingDocument = true
      this.docsError = ''
      try {
        const data = await uploadRoomDocument({
          roomId: this.currentChat.id,
          file,
          source: this.pendingDocumentSource
        })
        const normalized = this.normalizeRoomDocument(data?.document || null)
        if (!normalized) {
          throw new Error('文档上传成功，但返回数据无效')
        }

        const nextDocuments = mergeRoomDocument(this.currentRoomDocuments, normalized)
        this.setCurrentRoomDocuments(this.currentChat.id, nextDocuments)
        this.setCurrentRoomSelectedDocument(this.currentChat.id, data?.selectedDocumentId || normalized.id)
        this.setDocsPanelLocked(this.currentChat.id, true)
      } catch (error) {
        this.docsError = error.message || '文档上传失败'
      } finally {
        this.uploadingDocument = false
        this.pendingDocumentSource = DISCUSSION_DOCUMENT_SOURCE_LOCAL
        if (event?.target) event.target.value = ''
      }
    },
    closeOfficialDocsPicker() {
      this.showOfficialDocsPicker = false
      this.pendingDocumentSource = DISCUSSION_DOCUMENT_SOURCE_LOCAL
    },
    async selectOfficialDocument(doc) {
      if (!doc?.file || !this.currentChat || this.uploadingDocument) return

      this.uploadingDocument = true
      this.docsError = ''
      try {
        const file = await createOfficialDocumentFile(doc)
        const data = await uploadRoomDocument({
          roomId: this.currentChat.id,
          file,
          source: DISCUSSION_DOCUMENT_SOURCE_OFFICIAL
        })
        const normalized = this.normalizeRoomDocument(data?.document || null)
        if (!normalized) {
          throw new Error('文档上传成功，但返回数据无效')
        }

        const nextDocuments = mergeRoomDocument(this.currentRoomDocuments, normalized)
        this.setCurrentRoomDocuments(this.currentChat.id, nextDocuments)
        this.setCurrentRoomSelectedDocument(this.currentChat.id, data?.selectedDocumentId || normalized.id)
        this.setDocsPanelLocked(this.currentChat.id, true)
        this.showOfficialDocsPicker = false
      } catch (error) {
        this.docsError = error.message || '官方文档上传失败'
      } finally {
        this.uploadingDocument = false
        this.pendingDocumentSource = DISCUSSION_DOCUMENT_SOURCE_LOCAL
      }
    },
    async openDocumentFromPreviewRequest(request) {
      const roomId = Number(request?.roomId || 0)
      const documentId = Number(request?.documentId || 0)
      if (!roomId || !documentId) return
      if (String(roomId) !== this.currentRoomKey) return

      await this.ensureCurrentRoomDocuments({ force: true })
      const exists = this.currentRoomDocuments.some((item) => String(item.id) === String(documentId))
      if (!exists) {
        this.docsError = '未找到对应文档，可能已被删除'
        return
      }

      this.docsError = ''
      this.setDocsPanelLocked(roomId, true)
      this.setCurrentRoomSelectedDocument(roomId, documentId)
      this.docsSidebarCollapsed = false
    },
    requestDeleteDocument(doc) {
      if (!doc?.id || this.uploadingDocument || this.deletingDocumentId) return
      if (this.pendingDeleteDocumentId !== doc.id) {
        this.pendingDeleteDocumentId = doc.id
        if (this.deleteConfirmTimer) {
          window.clearTimeout(this.deleteConfirmTimer)
        }
        this.deleteConfirmTimer = window.setTimeout(() => {
          this.clearDeleteConfirmState()
        }, DOC_DELETE_CONFIRM_WINDOW_MS)
        this.notificationStore.warning('确认删除文档', `再次点击删除“${doc.name}”以继续`)
        return
      }
      this.clearDeleteConfirmState()
      this.deleteDocument(doc)
    },
    async deleteDocument(doc) {
      const roomId = Number(this.currentChat?.id || 0)
      if (!roomId || !doc?.id) return

      this.deletingDocumentId = doc.id
      this.docsError = ''
      try {
        const data = await deleteRoomDocument(roomId, doc.id)
        const roomKey = String(roomId)
        const nextDocuments = this.currentRoomDocuments.filter((item) => String(item.id) !== String(doc.id))
        this.roomDocumentsByRoom = {
          ...this.roomDocumentsByRoom,
          [roomKey]: nextDocuments
        }
        this.setCurrentRoomSelectedDocument(roomId, data?.selectedDocumentId || '')
        this.notificationStore.success('文档已删除', `已移除“${doc.name}”`)
      } catch (error) {
        this.docsError = error.message || '删除文档失败'
        this.notificationStore.error('删除失败', this.docsError)
      } finally {
        this.deletingDocumentId = null
      }
    },
    handleDocumentsSyncEvent(event) {
      const detail = event?.detail || {}
      const roomId = Number(detail.roomId || 0)
      if (!roomId) return

      const action = String(detail.action || '').trim()
      const selectedDocumentId = detail.selectedDocumentId
      const roomKey = String(roomId)
      const hasLoadedDocuments = Array.isArray(this.roomDocumentsByRoom[roomKey])
      const shouldHydrateDocuments = hasLoadedDocuments || this.currentRoomKey === roomKey

      if (!hasLoadedDocuments && this.currentRoomKey === roomKey) {
        this.ensureCurrentRoomDocuments({ force: true })
      }

      if (detail.document && shouldHydrateDocuments) {
        const normalized = this.normalizeRoomDocument(detail.document)
        if (normalized) {
          const existing = Array.isArray(this.roomDocumentsByRoom[roomKey]) ? this.roomDocumentsByRoom[roomKey] : []
          const nextDocuments = mergeRoomDocument(existing, normalized)
          this.setCurrentRoomDocuments(roomId, nextDocuments)
          this.setDocsPanelLocked(roomId, true)
        }
      }

      if (action === 'deleted') {
        const documentId = String(detail.documentId || '')
        if (documentId) {
          const existing = Array.isArray(this.roomDocumentsByRoom[roomKey]) ? this.roomDocumentsByRoom[roomKey] : []
          this.roomDocumentsByRoom = {
            ...this.roomDocumentsByRoom,
            [roomKey]: existing.filter((item) => String(item.id) !== documentId)
          }
        }
      }

      if ((selectedDocumentId !== null && selectedDocumentId !== undefined && selectedDocumentId !== '')
        && (shouldHydrateDocuments || action === 'select')) {
        this.setCurrentRoomSelectedDocument(roomId, selectedDocumentId)
        this.setDocsPanelLocked(roomId, true)
      } else if ((action === 'select' || action === 'deleted') && this.currentRoomKey === roomKey) {
        this.setCurrentRoomSelectedDocument(roomId, '')
      }
    }
  }
}
</script>

<style scoped>
.discussion-docs-panel {
  flex: 1;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  background: transparent;
}

.docs-shell-card,
.docs-fallback-shell {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #dfe4eb;
  border-radius: 18px;
  background: #ffffff;
  box-sizing: border-box;
  overflow: hidden;
}

.docs-fallback-shell {
  width: 100%;
  padding: 16px;
}

.docs-fallback-shell h3 { 
  margin: 0 0 8px;
  color: #111827;
  font-size: 18px;
  font-weight: 700;
}

.docs-fallback-shell p {
  margin: 0;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
}

.right-docs-shell {
  background: #ffffff;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
}

.docs-view-switch-enter-active,
.docs-view-switch-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.docs-view-switch-enter-from,
.docs-view-switch-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.995);
}

.docs-view-switch-enter-to,
.docs-view-switch-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.docs-loading-shell {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.docs-upload-landing {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
}

.docs-upload-landing-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: #111827;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
}

.docs-upload-landing h3 {
  margin: 4px 0 0;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 700;
  color: #111827;
}

.docs-upload-landing p {
  margin: 0 0 6px;
  color: #6b7280;
  font-size: 14px;
  font-weight: 600;
}

.docs-upload-primary,
.docs-upload-secondary {
  height: 35px;
  width: min(360px, 88%);
  border-radius: 999px;
  border: 1px solid #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.docs-upload-primary {
  background: #07090d;
  color: #ffffff;
}

.docs-upload-secondary {
  background: #f5f5f5;
  color: #111827;
}

.docs-upload-primary:hover,
.docs-upload-secondary:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
}

.docs-upload-primary:disabled,
.docs-upload-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.docs-upload-error {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: #7f1d1d;
}

.docs-library-layout {
  width: 100%;
  max-width: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  overflow: hidden;
}

.docs-sidebar {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid #d1d5db;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition: width 0.22s ease;
}

.docs-sidebar-head,
.docs-preview-head {
  height: 35px;
  border-bottom: 1px solid #d1d5db;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.docs-sidebar-head strong,
.docs-preview-head strong {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.docs-sidebar-toggle {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.docs-sidebar-section {
  padding: 10px 10px 4px;
  overflow: auto;
  min-width: 0;
}

.docs-sidebar-section h4 {
  margin: 0 0 8px;
  font-size: 11px;
  color: #6b7280;
  font-weight: 700;
}

.docs-side-empty {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 8px;
}

.docs-item-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
  margin-bottom: 6px;
}

.docs-item {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  min-height: 28px;
  background: #ececec;
  color: #111827;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.docs-item-row.active .docs-item {
  background: #07090d;
  color: #ffffff;
  border-color: #07090d;
}

.docs-item span {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docs-item-delete {
  width: 28px;
  min-width: 28px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #ffffff;
  color: #6b7280;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
}

.docs-item-delete:hover:not(:disabled) {
  border-color: #d14343;
  color: #d14343;
  background: #fff5f5;
}

.docs-item-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.docs-sidebar-actions {
  margin-top: auto;
  padding: 10px;
  border-top: 1px solid #d1d5db;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.docs-upload-primary.side,
.docs-upload-secondary.side {
  width: 100%;
  height: 28px;
  font-size: 11px;
  font-weight: 700;
}

.docs-preview-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.docs-preview-head-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.docs-preview-head strong {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.docs-preview-head span {
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.docs-sidebar-toggle.header {
  flex-shrink: 0;
}

.docs-preview-body {
  padding: 14px 14px 16px;
  overflow: auto;
  min-width: 0;
}

.docs-loading-state {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
}

.docs-preview-body h3 {
  margin: 0 0 10px;
  font-size: 29px;
  line-height: 1.18;
  color: #111827;
  font-weight: 700;
}

.docs-preview-body p {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.6;
  color: #1f2937;
  font-weight: 600;
}

.docs-preview-body hr {
  border: none;
  border-top: 1px solid #d1d5db;
  margin: 10px 0 14px;
}

.docs-preview-excerpt {
  margin-top: 12px !important;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px !important;
  font-weight: 600;
}

.docs-markdown-content :deep(h1),
.docs-markdown-content :deep(h2),
.docs-markdown-content :deep(h3),
.docs-markdown-content :deep(h4),
.docs-markdown-content :deep(h5),
.docs-markdown-content :deep(h6) {
  margin: 0 0 10px;
  line-height: 1.25;
  color: #111827;
  font-weight: 700;
}

.docs-markdown-content :deep(h1) {
  font-size: 28px;
}

.docs-markdown-content :deep(h2) {
  font-size: 22px;
}

.docs-markdown-content :deep(h3) {
  font-size: 18px;
}

.docs-markdown-content :deep(p),
.docs-markdown-content :deep(li) {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
  font-weight: 500;
}

.docs-markdown-content :deep(ul),
.docs-markdown-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 20px;
}

.docs-markdown-content :deep(code) {
  padding: 1px 5px;
  border-radius: 6px;
  background: #e5e7eb;
  font-size: 12px;
}

.docs-markdown-content :deep(pre) {
  margin: 0 0 12px;
  padding: 12px;
  border-radius: 0 0 12px 12px;
  background: #111827;
  color: #f9fafb;
  overflow: auto;
}

.docs-markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
}

.docs-markdown-content :deep(.markdown-code-block) {
  margin: 0 0 12px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #1f2937;
  background: #111827;
}

.docs-markdown-content :deep(.markdown-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: #0f172a;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.docs-markdown-content :deep(.markdown-code-language) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.docs-markdown-content :deep(.markdown-code-copy-btn) {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.1);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.docs-markdown-content :deep(.markdown-code-copy-btn:hover) {
  background: rgba(148, 163, 184, 0.18);
  border-color: rgba(148, 163, 184, 0.34);
  transform: translateY(-1px);
}

.docs-markdown-content :deep(.hljs) {
  display: block;
  background: transparent;
  color: #f9fafb;
  white-space: pre;
}

.docs-markdown-content :deep(.hljs-comment),
.docs-markdown-content :deep(.hljs-quote) {
  color: #94a3b8;
  font-style: italic;
}

.docs-markdown-content :deep(.hljs-keyword),
.docs-markdown-content :deep(.hljs-selector-tag),
.docs-markdown-content :deep(.hljs-subst) {
  color: #c084fc;
}

.docs-markdown-content :deep(.hljs-string),
.docs-markdown-content :deep(.hljs-doctag),
.docs-markdown-content :deep(.hljs-regexp),
.docs-markdown-content :deep(.hljs-template-tag),
.docs-markdown-content :deep(.hljs-template-variable) {
  color: #67e8f9;
}

.docs-markdown-content :deep(.hljs-title),
.docs-markdown-content :deep(.hljs-title.function_),
.docs-markdown-content :deep(.hljs-title.class_),
.docs-markdown-content :deep(.hljs-function .hljs-title) {
  color: #93c5fd;
}

.docs-markdown-content :deep(.hljs-number),
.docs-markdown-content :deep(.hljs-literal),
.docs-markdown-content :deep(.hljs-symbol),
.docs-markdown-content :deep(.hljs-bullet) {
  color: #fbbf24;
}

.docs-markdown-content :deep(.hljs-type),
.docs-markdown-content :deep(.hljs-built_in),
.docs-markdown-content :deep(.hljs-class .hljs-title) {
  color: #60a5fa;
}

.docs-markdown-content :deep(.hljs-attr),
.docs-markdown-content :deep(.hljs-attribute),
.docs-markdown-content :deep(.hljs-variable),
.docs-markdown-content :deep(.hljs-property) {
  color: #f9a8d4;
}

.docs-markdown-content :deep(.hljs-operator),
.docs-markdown-content :deep(.hljs-punctuation),
.docs-markdown-content :deep(.hljs-meta) {
  color: #cbd5e1;
}

.docs-markdown-content :deep(blockquote) {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-left: 3px solid #9ca3af;
  background: #f9fafb;
  color: #374151;
}

.docs-markdown-content :deep(a) {
  color: #1d4ed8;
  text-decoration: underline;
}

.docs-markdown-content :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 0 14px;
  border-radius: 12px;
  border: 1px solid #d1d5db;
}

.docs-error-state {
  margin: 0;
  color: #7f1d1d;
  font-size: 11px;
  font-weight: 600;
}

.attachment-input-hidden {
  display: none;
}

.docs-picker-mask {
  position: absolute;
  inset: 0;
  background: rgba(17, 24, 39, 0.26);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.docs-picker-panel {
  width: min(520px, 92%);
  max-height: min(78vh, 620px);
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
}

.docs-picker-head {
  height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.docs-picker-head strong {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.docs-picker-close {
  width: 24px;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  color: #4b5563;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.docs-picker-body {
  padding: 10px;
  overflow: auto;
}

.docs-picker-item {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #111827;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.docs-picker-item:hover {
  transform: translateY(-1px);
  border-color: #c4cad4;
  background: #ffffff;
}

.docs-picker-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.docs-picker-item-main strong {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.docs-picker-item-main span {
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  line-height: 1.45;
}

@media (max-width: 1400px) {
  .docs-upload-landing h3 {
    font-size: 26px;
  }

  .docs-preview-body h3 {
    font-size: 22px;
  }

  .docs-preview-body p {
    font-size: 14px;
  }
}

@media (max-width: 900px) {
  .docs-upload-landing {
    padding: 18px 14px;
  }

  .docs-upload-landing h3 {
    font-size: 22px;
  }

  .docs-upload-landing p {
    font-size: 12px;
  }

  .docs-upload-primary,
  .docs-upload-secondary {
    width: 100%;
    font-size: 12px;
    height: 32px;
  }

  .docs-library-layout {
    flex-direction: column;
  }

  .docs-sidebar,
  .docs-library-layout.collapsed .docs-sidebar {
    width: 100%;
  }

  .docs-sidebar {
    border-right: none;
    border-bottom: 1px solid #d1d5db;
    max-height: 230px;
  }

  .docs-preview-head {
    padding: 0 12px;
  }

  .docs-preview-body {
    padding: 14px 12px 16px;
  }

  .docs-preview-body h3 {
    font-size: 18px;
  }

  .docs-preview-body p {
    font-size: 11px;
  }

  .docs-preview-excerpt {
    font-size: 11px !important;
  }

  .docs-markdown-content :deep(h1) {
    font-size: 22px;
  }

  .docs-markdown-content :deep(h2) {
    font-size: 18px;
  }

  .docs-markdown-content :deep(h3) {
    font-size: 16px;
  }

  .docs-markdown-content :deep(p),
  .docs-markdown-content :deep(li) {
    font-size: 12px;
  }
}
</style>
