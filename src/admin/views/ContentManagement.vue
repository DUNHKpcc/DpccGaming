<template>
  <AdminLayout
    title="内容管理"
    description="管理公开 Blog 和 AiDocs，资源上传到运行时 uploads 目录"
  >
    <template #actions>
      <el-button @click="refreshContent">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
      <el-button type="primary" @click="activeTab === 'blog' ? openBlogDialog() : openDocDialog()">
        <i class="fa fa-plus"></i>
        新增{{ activeTab === 'blog' ? 'Blog' : '文档' }}
      </el-button>
    </template>

    <el-card class="content-panel-card" shadow="never">
      <el-tabs v-model="activeTab" class="content-tabs">
        <el-tab-pane label="Blog" name="blog">
          <el-table
            :data="paginatedBlogPosts"
            height="calc(100% - 52px)"
            row-key="id"
            empty-text="暂无 Blog"
          >
            <el-table-column label="标题" min-width="280">
              <template #default="{ row }">
                <div class="content-title-cell">
                  <img v-if="row.imageUrl" :src="row.imageUrl" :alt="row.title" />
                  <span v-else class="content-file-icon"><i class="fa fa-image"></i></span>
                  <div>
                    <strong>{{ row.title }}</strong>
                    <small>{{ row.summary || '暂无摘要' }}</small>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="作者" width="140">
              <template #default="{ row }">{{ row.author || '-' }}</template>
            </el-table-column>
            <el-table-column label="日期" width="130">
              <template #default="{ row }">{{ row.publishedAt || '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'published' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'published' ? '发布' : '草稿' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="排序" width="90">
              <template #default="{ row }">{{ row.sortOrder }}</template>
            </el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="previewUrl(row.imageUrl)">封面</el-button>
                <el-button size="small" @click="openBlogDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="confirmDeleteBlog(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="content-pagination">
            <el-pagination
              v-model:current-page="blogPage"
              v-model:page-size="pageSize"
              :page-sizes="adminPageSizeOptions"
              :total="blogTotal"
              background
              layout="total, sizes, prev, pager, next"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="AiDocs" name="docs">
          <el-table
            :data="paginatedDocs"
            height="calc(100% - 52px)"
            row-key="numericId"
            empty-text="暂无文档"
          >
            <el-table-column label="文档" min-width="300">
              <template #default="{ row }">
                <div class="content-title-cell">
                  <img v-if="row.coverUrl" :src="row.coverUrl" :alt="row.title" />
                  <span v-else class="content-file-icon"><i class="fa fa-file-lines"></i></span>
                  <div>
                    <strong>{{ row.title }}</strong>
                    <small>{{ row.docKey }} · {{ row.summary || '暂无摘要' }}</small>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="分类" width="130">
              <template #default="{ row }">{{ row.tag }}</template>
            </el-table-column>
            <el-table-column label="发布者" width="170">
              <template #default="{ row }">{{ row.publisher?.username || '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'published' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'published' ? '发布' : '草稿' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="排序" width="90">
              <template #default="{ row }">{{ row.sortOrder }}</template>
            </el-table-column>
            <el-table-column label="操作" width="260" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="previewUrl(row.fileUrl)">文档</el-button>
                <el-button size="small" @click="openDocDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="confirmDeleteDoc(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="content-pagination">
            <el-pagination
              v-model:current-page="docPage"
              v-model:page-size="pageSize"
              :page-sizes="adminPageSizeOptions"
              :total="docTotal"
              background
              layout="total, sizes, prev, pager, next"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog
      v-model="blogDialogVisible"
      append-to-body
      destroy-on-close
      :lock-scroll="false"
      :transition="contentDialogTransition"
      :title="blogForm.id ? '编辑 Blog' : '新增 Blog'"
      width="620px"
      @closed="handleBlogDialogClosed"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="标题">
          <el-input v-model="blogForm.title" maxlength="180" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="blogForm.summary" type="textarea" :rows="3" maxlength="2000" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="作者">
              <el-input v-model="blogForm.author" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发布日期">
              <el-date-picker v-model="blogForm.publishedAt" class="content-full-control" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="blogForm.status" class="content-full-control">
                <el-option label="发布" value="published" />
                <el-option label="草稿" value="draft" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序">
              <el-input-number v-model="blogForm.sortOrder" class="content-full-control" :precision="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="封面图片">
          <input ref="blogImageInputRef" type="file" accept="image/*" @change="blogImageFile = $event.target.files?.[0] || null" />
          <small v-if="blogForm.imageUrl">当前：{{ blogForm.imageUrl }}</small>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeBlogDialog">取消</el-button>
        <el-button type="primary" :loading="isSavingBlog" @click="saveBlog">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="docDialogVisible"
      append-to-body
      destroy-on-close
      :lock-scroll="false"
      :transition="contentDialogTransition"
      :title="docForm.numericId ? '编辑文档' : '新增文档'"
      class="content-doc-dialog"
      width="min(1360px, calc(100vw - 40px))"
      @closed="handleDocDialogClosed"
    >
      <el-form class="doc-form-grid" label-position="top" @submit.prevent>
        <div class="doc-form-main">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="文档 ID">
                <el-input v-model="docForm.docKey" placeholder="example-doc-id" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="分类">
                <el-input v-model="docForm.tag" placeholder="DPCC API" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="标题">
            <el-input v-model="docForm.title" maxlength="220" />
          </el-form-item>
          <el-form-item label="摘要">
            <el-input v-model="docForm.summary" type="textarea" :rows="3" maxlength="2000" />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="发布者">
                <el-input v-model="docForm.publisherName" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="发布者头像 URL">
                <el-input v-model="docForm.publisherAvatar" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="状态">
                <el-select v-model="docForm.status" class="content-full-control">
                  <el-option label="发布" value="published" />
                  <el-option label="草稿" value="draft" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="排序">
                <el-input-number v-model="docForm.sortOrder" class="content-full-control" :precision="0" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="封面图片">
            <input ref="docCoverInputRef" type="file" accept="image/*" @change="docCoverFile = $event.target.files?.[0] || null" />
            <small v-if="docForm.coverUrl">当前：{{ docForm.coverUrl }}</small>
          </el-form-item>
          <el-form-item label="Markdown 文档">
            <input ref="docFileInputRef" type="file" accept=".md,text/markdown,text/plain" @change="handleDocMarkdownFileChange" />
            <small v-if="docForm.fileUrl">当前：{{ docForm.fileUrl }}</small>
          </el-form-item>
        </div>
        <div class="doc-markdown-pane">
          <el-form-item label="Markdown 内容">
            <el-input
              v-model="docMarkdownContent"
              class="doc-markdown-editor"
              type="textarea"
              resize="none"
              placeholder="在这里编辑 Markdown；可直接粘贴剪贴板图片"
              @paste="handleDocMarkdownPaste"
            />
            <small>粘贴图片后会在保存时自动转为 WebP，并归档到当前文档 ID 的资源目录。</small>
            <small v-if="docContentImageAssets.length">
              已粘贴 {{ docContentImageAssets.length }} 张图片，保存后自动替换为线上路径。
            </small>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="closeDocDialog">取消</el-button>
        <el-button type="primary" :loading="isSavingDoc" @click="saveDoc">保存</el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import AdminLayout from '../layout/AdminLayout.vue'
import { ADMIN_PAGE_SIZE_OPTIONS, DEFAULT_ADMIN_PAGE_SIZE, useAdminPagination } from '../utils/pagination'
import { useNotificationStore } from '../../stores/notification'

const notificationStore = useNotificationStore()
const activeTab = ref('blog')
const blogPosts = ref([])
const docs = ref([])
const pageSize = ref(DEFAULT_ADMIN_PAGE_SIZE)
const blogPage = ref(1)
const docPage = ref(1)
const adminPageSizeOptions = ADMIN_PAGE_SIZE_OPTIONS
const blogDialogVisible = ref(false)
const docDialogVisible = ref(false)
const isSavingBlog = ref(false)
const isSavingDoc = ref(false)
const blogImageFile = ref(null)
const docCoverFile = ref(null)
const docMarkdownFile = ref(null)
const docMarkdownContent = ref('')
const docContentImageAssets = ref([])
const blogImageInputRef = ref(null)
const docCoverInputRef = ref(null)
const docFileInputRef = ref(null)
const contentDialogTransition = {
  name: 'content-dialog-static',
  css: false
}

const defaultBlogForm = () => ({
  id: null,
  title: '',
  summary: '',
  imageUrl: '',
  author: 'SunJiaHao',
  publishedAt: new Date().toISOString().slice(0, 10),
  status: 'published',
  sortOrder: 0
})

const defaultDocForm = () => ({
  numericId: null,
  docKey: '',
  title: '',
  tag: '其它',
  summary: '',
  publisherName: 'dpccgamingSunJiaHao',
  publisherAvatar: '/Ai/Sun.jpeg',
  coverUrl: '',
  fileUrl: '',
  status: 'published',
  sortOrder: 0
})

const blogForm = ref(defaultBlogForm())
const docForm = ref(defaultDocForm())

const {
  totalItems: blogTotal,
  pagedItems: paginatedBlogPosts
} = useAdminPagination(blogPosts, {
  currentPage: blogPage,
  pageSize
})

const {
  totalItems: docTotal,
  pagedItems: paginatedDocs
} = useAdminPagination(docs, {
  currentPage: docPage,
  pageSize
})

const authHeaders = () => {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const readJsonResponse = async (response) => {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || data.message || '请求失败')
  }
  return data
}

const fetchBlogPosts = async () => {
  const response = await fetch('/api/admin/content/blog-posts', {
    headers: authHeaders()
  })
  const data = await readJsonResponse(response)
  blogPosts.value = data.posts || []
}

const fetchDocs = async () => {
  const response = await fetch('/api/admin/content/docs', {
    headers: authHeaders()
  })
  const data = await readJsonResponse(response)
  docs.value = data.docs || []
}

const refreshContent = async () => {
  try {
    await Promise.all([fetchBlogPosts(), fetchDocs()])
  } catch (error) {
    notificationStore.error('加载失败', error.message || '内容列表加载失败')
  }
}

const appendBlogFormData = () => {
  const formData = new FormData()
  formData.append('title', blogForm.value.title)
  formData.append('summary', blogForm.value.summary)
  formData.append('author', blogForm.value.author)
  formData.append('publishedAt', blogForm.value.publishedAt || '')
  formData.append('status', blogForm.value.status)
  formData.append('sortOrder', String(blogForm.value.sortOrder || 0))
  formData.append('imageUrl', blogForm.value.imageUrl || '')
  if (blogImageFile.value) formData.append('image', blogImageFile.value)
  return formData
}

const appendDocFormData = () => {
  const formData = new FormData()
  formData.append('docKey', docForm.value.docKey)
  formData.append('title', docForm.value.title)
  formData.append('tag', docForm.value.tag)
  formData.append('summary', docForm.value.summary)
  formData.append('publisherName', docForm.value.publisherName)
  formData.append('publisherAvatar', docForm.value.publisherAvatar)
  formData.append('coverUrl', docForm.value.coverUrl || '')
  formData.append('fileUrl', docForm.value.fileUrl || '')
  formData.append('status', docForm.value.status)
  formData.append('sortOrder', String(docForm.value.sortOrder || 0))
  formData.append('markdownContent', docMarkdownContent.value || '')
  formData.append('contentImageTokens', JSON.stringify(docContentImageAssets.value.map(asset => asset.token)))
  if (docCoverFile.value) formData.append('cover', docCoverFile.value)
  if (docMarkdownFile.value) formData.append('file', docMarkdownFile.value)
  docContentImageAssets.value.forEach(asset => {
    formData.append('contentImages', asset.file)
  })
  return formData
}

const getFileExtensionFromMime = (mime = '') => {
  const normalized = String(mime || '').toLowerCase()
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('webp')) return 'webp'
  return 'png'
}

const insertMarkdownSnippet = (textarea, snippet = '') => {
  const current = docMarkdownContent.value || ''
  const start = Number.isFinite(textarea?.selectionStart) ? textarea.selectionStart : current.length
  const end = Number.isFinite(textarea?.selectionEnd) ? textarea.selectionEnd : start
  docMarkdownContent.value = `${current.slice(0, start)}${snippet}${current.slice(end)}`
  nextTick(() => {
    if (!textarea) return
    const cursor = start + snippet.length
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })
}

const handleDocMarkdownPaste = (event) => {
  const items = Array.from(event.clipboardData?.items || [])
  const imageItems = items.filter(item => item.kind === 'file' && String(item.type || '').startsWith('image/'))
  if (!imageItems.length) return

  event.preventDefault()
  const pastedAt = Date.now()
  const snippets = []

  imageItems.forEach((item, index) => {
    const file = item.getAsFile()
    if (!file) return
    const token = `pasted-image-${pastedAt}-${index}-${Math.round(Math.random() * 1e9)}`
    const extension = getFileExtensionFromMime(file.type)
    const namedFile = new File([file], `${token}.${extension}`, { type: file.type || 'image/png' })
    docContentImageAssets.value.push({ token, file: namedFile })
    snippets.push(`![图片](local://${token})`)
  })

  if (snippets.length) {
    insertMarkdownSnippet(event.target, snippets.join('\n\n'))
  }
}

const handleDocMarkdownFileChange = async (event) => {
  const file = event.target.files?.[0] || null
  docMarkdownFile.value = file
  if (!file) return

  try {
    docMarkdownContent.value = await file.text()
  } catch (error) {
    notificationStore.warning('读取失败', error.message || 'Markdown 文件读取失败')
  }
}

const loadDocMarkdownContent = async (doc = null) => {
  const fileUrl = doc?.fileUrl || doc?.file || ''
  docMarkdownContent.value = ''
  if (!fileUrl) return

  try {
    const response = await fetch(fileUrl)
    if (!response.ok) throw new Error('文档内容加载失败')
    docMarkdownContent.value = await response.text()
  } catch (error) {
    notificationStore.warning('内容未载入', error.message || '无法读取当前 Markdown 内容')
  }
}

const openBlogDialog = (post = null) => {
  blogImageFile.value = null
  blogForm.value = post ? { ...defaultBlogForm(), ...post } : defaultBlogForm()
  blogDialogVisible.value = true
  nextTick(() => {
    if (blogImageInputRef.value) blogImageInputRef.value.value = ''
  })
}

const closeBlogDialog = () => {
  blogDialogVisible.value = false
}

const handleBlogDialogClosed = () => {
  if (blogDialogVisible.value) return
  blogImageFile.value = null
  blogForm.value = defaultBlogForm()
}

const openDocDialog = (doc = null) => {
  docCoverFile.value = null
  docMarkdownFile.value = null
  docMarkdownContent.value = ''
  docContentImageAssets.value = []
  docForm.value = doc
    ? {
      ...defaultDocForm(),
      ...doc,
      publisherName: doc.publisher?.username || 'dpccgamingSunJiaHao',
      publisherAvatar: doc.publisher?.avatar || '/Ai/Sun.jpeg'
    }
    : defaultDocForm()
  docDialogVisible.value = true
  nextTick(() => {
    if (docCoverInputRef.value) docCoverInputRef.value.value = ''
    if (docFileInputRef.value) docFileInputRef.value.value = ''
  })
  if (doc) loadDocMarkdownContent(doc)
}

const closeDocDialog = () => {
  docDialogVisible.value = false
}

const handleDocDialogClosed = () => {
  if (docDialogVisible.value) return
  docCoverFile.value = null
  docMarkdownFile.value = null
  docMarkdownContent.value = ''
  docContentImageAssets.value = []
  docForm.value = defaultDocForm()
}

const saveBlog = async () => {
  if (!blogForm.value.title.trim()) {
    notificationStore.warning('缺少标题', '请填写 Blog 标题')
    return
  }

  isSavingBlog.value = true
  try {
    const isEdit = Boolean(blogForm.value.id)
    const response = await fetch(`/api/admin/content/blog-posts${isEdit ? `/${blogForm.value.id}` : ''}`, {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: appendBlogFormData()
    })
    await readJsonResponse(response)
    notificationStore.success('保存成功', 'Blog 已更新')
    closeBlogDialog()
    await fetchBlogPosts()
  } catch (error) {
    notificationStore.error('保存失败', error.message || 'Blog 保存失败')
  } finally {
    isSavingBlog.value = false
  }
}

const saveDoc = async () => {
  if (!docForm.value.docKey.trim() || !docForm.value.title.trim()) {
    notificationStore.warning('信息不完整', '请填写文档 ID 和标题')
    return
  }

  isSavingDoc.value = true
  try {
    const isEdit = Boolean(docForm.value.numericId)
    const response = await fetch(`/api/admin/content/docs${isEdit ? `/${docForm.value.numericId}` : ''}`, {
      method: isEdit ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: appendDocFormData()
    })
    await readJsonResponse(response)
    notificationStore.success('保存成功', '文档已更新')
    closeDocDialog()
    await fetchDocs()
  } catch (error) {
    notificationStore.error('保存失败', error.message || '文档保存失败')
  } finally {
    isSavingDoc.value = false
  }
}

const confirmDeleteBlog = async (post) => {
  try {
    await ElMessageBox.confirm(`确定删除 Blog“${post.title}”吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'error'
    })
    const response = await fetch(`/api/admin/content/blog-posts/${post.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    await readJsonResponse(response)
    notificationStore.success('删除成功', 'Blog 已删除')
    await fetchBlogPosts()
  } catch (error) {
    if (error !== 'cancel') notificationStore.error('删除失败', error.message || 'Blog 删除失败')
  }
}

const confirmDeleteDoc = async (doc) => {
  try {
    await ElMessageBox.confirm(`确定删除文档“${doc.title}”吗？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'error'
    })
    const response = await fetch(`/api/admin/content/docs/${doc.numericId}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    await readJsonResponse(response)
    notificationStore.success('删除成功', '文档已删除')
    await fetchDocs()
  } catch (error) {
    if (error !== 'cancel') notificationStore.error('删除失败', error.message || '文档删除失败')
  }
}

const previewUrl = (url = '') => {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  refreshContent()
})
</script>

<style scoped>
.content-panel-card {
  height: calc(100vh - 116px);
  border: 0;
}

.content-panel-card :deep(.el-card__body),
.content-tabs,
.content-tabs :deep(.el-tabs__content),
.content-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.content-panel-card :deep(.el-card__body) {
  padding: 0 1rem 1rem;
}

.content-title-cell {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.content-title-cell img,
.content-file-icon {
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  border-radius: 0.5rem;
}

.content-title-cell img {
  object-fit: cover;
}

.content-file-icon {
  display: grid;
  place-items: center;
  background: var(--admin-surface-soft);
  color: var(--admin-text);
}

.content-title-cell strong,
.content-title-cell small,
form small {
  display: block;
}

.content-title-cell small {
  max-width: 38rem;
  margin-top: 0.25rem;
  overflow: hidden;
  color: var(--admin-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-full-control {
  width: 100%;
}

.content-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.75rem;
}

form small {
  margin-top: 0.35rem;
  color: var(--admin-muted);
  word-break: break-all;
}

:global(.content-doc-dialog) {
  max-height: calc(100svh - 48px);
  display: flex;
  flex-direction: column;
}

:global(.content-doc-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

:global(.content-doc-dialog .el-dialog__footer) {
  flex: 0 0 auto;
  padding-top: 0.75rem;
}

.doc-form-grid {
  display: grid;
  grid-template-columns: minmax(20rem, 0.7fr) minmax(34rem, 1.3fr);
  gap: 1rem;
  height: min(50rem, calc(100svh - 10rem));
  min-height: 36rem;
  overflow: hidden;
}

.doc-form-main,
.doc-markdown-pane {
  min-height: 0;
}

.doc-form-main {
  overflow-y: auto;
  padding-right: 0.25rem;
}

.doc-form-main :deep(.el-form-item) {
  margin-bottom: 0.9rem;
}

.doc-markdown-pane {
  display: flex;
}

.doc-markdown-pane :deep(.el-form-item) {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
}

.doc-markdown-pane :deep(.el-form-item__content) {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  min-height: 0;
  align-items: stretch;
  flex: 1 1 auto;
}

.doc-markdown-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
}

.doc-markdown-editor :deep(.el-textarea__inner) {
  height: 100% !important;
  min-height: 31rem !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  line-height: 1.55;
}

@media (max-width: 720px) {
  .content-panel-card {
    height: calc(100svh - 84px - 1.5rem);
    min-height: 30rem;
  }

  .content-panel-card :deep(.el-card__body) {
    padding: 0 0.75rem 0.75rem;
  }

  .content-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .doc-form-grid {
    display: block;
    height: auto;
    max-height: calc(100svh - 11rem);
    min-height: 0;
    overflow-y: auto;
  }

  .doc-form-main {
    overflow: visible;
    padding-right: 0;
  }

  .doc-markdown-editor :deep(.el-textarea__inner) {
    height: 24rem !important;
    min-height: 24rem !important;
  }
}
</style>
