<template>
  <div class="docs-page">
    <div class="content-wrapper">
      <div class="docs-shell">
        <button
          type="button"
          class="docs-mobile-menu-button"
          aria-label="打开文档目录"
          @click="openMobileDocMenu"
        >
          文档
        </button>

        <button
          v-if="mobileDocMenuOpen"
          type="button"
          class="docs-mobile-backdrop"
          aria-label="关闭文档目录"
          @click="closeMobileDocMenu"
        ></button>

        <aside class="docs-sidebar" :class="{ 'mobile-open': mobileDocMenuOpen }">
          <div class="docs-sidebar-scroll">
            <div class="docs-sidebar-brand">
              <div>
                <span class="docs-sidebar-kicker">AiDocs</span>
                <h1 class="docs-sidebar-title">阅读文档</h1>
              </div>
              <button
                type="button"
                class="docs-mobile-menu-close"
                aria-label="关闭文档目录"
                @click="closeMobileDocMenu"
              >
                关闭
              </button>
            </div>

            <label class="docs-search" for="docs-search-input">
              <span class="docs-search-label">搜索文档</span>
              <input
                id="docs-search-input"
                v-model.trim="docSearchQuery"
                type="search"
                class="docs-search-input"
                placeholder="搜索标题、摘要、分类"
                autocomplete="off"
              />
            </label>

            <nav class="docs-nav" aria-label="文档目录">
              <section
                v-for="group in docGroups"
                :key="group.tag"
                class="docs-nav-group"
              >
                <h2 class="docs-nav-group-title">{{ group.tag }}</h2>
                <button
                  v-for="doc in group.items"
                  :key="doc.id"
                  type="button"
                  class="docs-nav-item"
                  :class="{ active: selectedDoc?.id === doc.id }"
                  @click="selectDoc(doc)"
                >
                  <span class="docs-nav-item-title">{{ doc.title }}</span>
                  <span class="docs-nav-item-summary">{{ doc.summary }}</span>
                </button>
              </section>
            </nav>

            <div v-if="!docGroups.length" class="docs-nav-empty">
              没有匹配的文档
            </div>
          </div>
        </aside>

        <main class="docs-reader-panel">
          <div
            ref="readerScrollRef"
            class="docs-reader-scroll"
            @scroll="handleReaderScroll"
          >
            <article class="docs-article">
              <div v-if="selectedDoc?.cover" class="docs-cover-shell">
                <img
                  :src="selectedDoc.cover"
                  :alt="selectedDoc.title"
                  :class="['docs-cover-image', { loaded: imagesLoaded[selectedDoc.id] }]"
                  loading="lazy"
                  @load="handleImageLoad($event, selectedDoc.id)"
                  @error="handleImageError($event, selectedDoc.id)"
                />
                <div class="docs-cover-fade"></div>
                <div class="image-loading docs-cover-loading" v-if="!imagesLoaded[selectedDoc.id]">
                  <div class="loading-spinner"></div>
                </div>
              </div>

              <div class="docs-article-content">
                <header class="docs-hero">
                  <div class="docs-hero-meta">
                    <span class="docs-hero-tag">{{ selectedDoc?.tag }}</span>
                    <div v-if="selectedDoc?.publisher" class="docs-publisher">
                      <span class="docs-publisher-label">发布用户</span>
                      <img
                        class="docs-publisher-avatar"
                        :src="selectedDoc?.publisher?.avatar"
                        :alt="selectedDoc?.publisher?.username"
                        loading="lazy"
                      />
                      <span class="docs-publisher-name">{{ selectedDoc?.publisher?.username }}</span>
                    </div>
                  </div>
                  <h1 class="docs-hero-title">{{ heroTitle }}</h1>
                  <p class="docs-hero-summary">{{ selectedDoc?.summary }}</p>
                  <div class="docs-star-row" v-if="selectedDoc">
                    <button
                      type="button"
                      class="docs-star-button"
                      :class="{ active: docStarred }"
                      :aria-pressed="docStarred"
                      :disabled="isLoadingDocStar"
                      @click="toggleDocStar"
                    >
                      <span class="docs-star-icon">{{ docStarred ? '★' : '☆' }}</span>
                      <span>{{ docStarred ? 'Starred' : 'Star' }}</span>
                      <span class="docs-star-count">{{ docStarCount }}</span>
                    </button>
                  </div>
                </header>

                <div class="docs-body-shell">
                  <div v-if="isLoadingDoc" class="docs-loading">
                    正在加载文档...
                  </div>
                  <div v-else-if="docError" class="docs-error">
                    {{ docError }}
                  </div>
                  <div
                    v-else
                    ref="markdownContentRef"
                    class="markdown-content docs-markdown"
                    @click="handleMarkdownContentClick"
                    v-html="renderedMarkdown"
                  ></div>
                </div>

                <CommentSection
                  v-if="selectedDoc"
                  class="docs-comments"
                  target-type="doc"
                  :target-id="selectedDoc.id"
                  title="讨论区"
                  mode-label="讨论"
                  :enable-rating="false"
                  compact
                />
              </div>
            </article>
          </div>
        </main>

        <aside class="docs-outline" v-if="outlineItems.length">
          <div class="docs-outline-scroll">
            <div class="docs-outline-title">在此页面</div>
            <nav class="docs-outline-nav" aria-label="页内目录">
              <a
                v-for="item in outlineItems"
                :key="item.id"
                :href="`#${item.id}`"
                class="docs-outline-item"
                :class="[
                  `level-${item.level}`,
                  { active: activeHeadingId === item.id }
                ]"
                @click.prevent="scrollToHeading(item.id)"
              >
                {{ item.text }}
              </a>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { docsList } from '../data/docsList'
import { useAuthStore } from '../stores/auth'
import { useModalStore } from '../stores/modal'
import { useNotificationStore } from '../stores/notification'
import CommentSection from '../components/CommentSection.vue'
import { highlightCodeAsync, warmupCodeHighlighter } from '../utils/asyncCodeHighlighter'
import { apiCall } from '../utils/api'
import { fetchPublicDocs } from '../utils/contentApi'
import { normalizeDocs } from '../utils/contentCatalog'
import { buildDocsCatalog } from '../utils/docsCatalog.js'
import { extractMarkdownHeadings } from '../utils/docsNavigation.js'
import { renderMarkdownToHtml } from '../utils/markdownRenderer.mjs'

const staticDocs = import.meta.env.DEV ? normalizeDocs(docsList) : []
const docs = ref(staticDocs)
const route = useRoute()
const authStore = useAuthStore()
const modalStore = useModalStore()
const notificationStore = useNotificationStore()
const getDocById = docId => docs.value.find(doc => doc.id === String(docId || '').trim()) || null
const selectedDoc = ref(getDocById(route.query.doc) || docs.value[0] || null)
const renderedMarkdown = ref('')
const isLoadingDoc = ref(false)
const docError = ref('')
const docStarred = ref(false)
const docStarCount = ref(0)
const isLoadingDocStar = ref(false)
const imagesLoaded = reactive({})
const imageErrors = reactive({})
const readerScrollRef = ref(null)
const markdownContentRef = ref(null)
const headings = ref([])
const activeHeadingId = ref('')
const docSearchQuery = ref('')
const mobileDocMenuOpen = ref(false)
let headingElements = []
let scrollRaf = 0

const docGroups = computed(() => buildDocsCatalog(docs.value, docSearchQuery.value))

const outlineItems = computed(() => {
  const nested = headings.value.filter(item => item.level >= 2)
  return nested.length ? nested : headings.value
})

const heroTitle = computed(() => {
  const primaryHeading = headings.value[0]?.level === 1 ? headings.value[0].text : ''
  return primaryHeading || selectedDoc.value?.title || ''
})

const handleImageLoad = (event, imageId) => {
  imagesLoaded[imageId] = true
}

const handleImageError = (event, imageId) => {
  imagesLoaded[imageId] = true
  imageErrors[imageId] = true
}

const decodeMarkdownCode = (encoded = '') => {
  try {
    return decodeURIComponent(String(encoded || ''))
  } catch {
    return String(encoded || '')
  }
}

const handleMarkdownContentClick = async (event) => {
  const button = event.target?.closest?.('[data-action="copy-code"]')
  if (!button) return

  const block = button.closest('.markdown-code-block')
  const code = decodeMarkdownCode(block?.dataset?.code || '')
  if (!code) return

  try {
    await navigator.clipboard.writeText(code)
    notificationStore.success('已复制', '代码块内容已复制到剪贴板')
  } catch (error) {
    notificationStore.error('复制失败', error?.message || '请检查浏览器权限')
  }
}

const getHeadingSelector = id => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return `#${CSS.escape(id)}`
  }
  return `#${String(id).replace(/"/g, '\\"')}`
}

const updateActiveHeading = () => {
  const container = readerScrollRef.value
  if (!container || !headingElements.length) {
    activeHeadingId.value = ''
    return
  }

  const containerTop = container.getBoundingClientRect().top
  let nextActive = headingElements[0]?.id || ''

  headingElements.forEach((heading) => {
    const relativeTop = heading.getBoundingClientRect().top - containerTop
    if (relativeTop <= 140) {
      nextActive = heading.id
    }
  })

  activeHeadingId.value = nextActive
}

const syncHeadingElements = () => {
  const content = markdownContentRef.value
  headingElements = content
    ? Array.from(content.querySelectorAll('h1[id], h2[id], h3[id], h4[id]'))
    : []
  updateActiveHeading()
}

const scheduleHeadingSync = () => {
  nextTick(() => {
    syncHeadingElements()
  })
}

const stripLeadingHeadingFromHtml = (html = '', firstHeading = null) => {
  if (!firstHeading || firstHeading.level !== 1) return html
  return String(html).replace(/^<h1 id="[^"]+">.*?<\/h1>/, '')
}

const loadDocStarStatus = async (doc = selectedDoc.value) => {
  if (!doc) return
  isLoadingDocStar.value = true

  try {
    const data = await apiCall(`/docs/${doc.id}/star`, {
      suppressErrorLogging: true
    })
    if (selectedDoc.value?.id !== doc.id) return
    docStarred.value = !!data.starred
    docStarCount.value = Number(data.count) || 0
  } catch (error) {
    if (selectedDoc.value?.id !== doc.id) return
    docStarred.value = false
    docStarCount.value = 0
  } finally {
    if (selectedDoc.value?.id === doc.id) {
      isLoadingDocStar.value = false
    }
  }
}

const toggleDocStar = async () => {
  if (!selectedDoc.value || isLoadingDocStar.value) return

  if (!authStore.isLoggedIn) {
    notificationStore.info('请先登录', '登录后即可 Star 文档')
    modalStore.openModal('login')
    return
  }

  isLoadingDocStar.value = true

  try {
    const data = await apiCall(`/docs/${selectedDoc.value.id}/star`, {
      method: docStarred.value ? 'DELETE' : 'PUT'
    })
    docStarred.value = !!data.starred
    docStarCount.value = Number(data.count) || 0
  } catch (error) {
    notificationStore.error('操作失败', error.message || '文档 Star 状态更新失败')
  } finally {
    isLoadingDocStar.value = false
  }
}

const loadDocContent = async (doc) => {
  if (!doc) return
  isLoadingDoc.value = true
  docError.value = ''
  activeHeadingId.value = ''

  try {
    const response = await fetch(doc.file)
    if (!response.ok) {
      throw new Error(`无法加载文档：${doc.file}`)
    }

    const markdown = await response.text()
    const nextHeadings = extractMarkdownHeadings(markdown)
    headings.value = nextHeadings

    const html = await renderMarkdownToHtml(markdown, {
      baseUrl: doc.file,
      renderCodeBlock: async ({ code, language }) => {
        const highlighted = await highlightCodeAsync(code, { language })
        return highlighted
      }
    })

    renderedMarkdown.value = stripLeadingHeadingFromHtml(html, nextHeadings[0])

    await nextTick()
    const container = readerScrollRef.value
    if (container) {
      container.scrollTo({ top: 0, behavior: 'auto' })
    }
    scheduleHeadingSync()
  } catch (error) {
    renderedMarkdown.value = ''
    headings.value = []
    docError.value = error instanceof Error ? error.message : '文档加载失败'
  } finally {
    isLoadingDoc.value = false
  }
}

const openMobileDocMenu = () => {
  mobileDocMenuOpen.value = true
}

const closeMobileDocMenu = () => {
  mobileDocMenuOpen.value = false
}

const selectDoc = async (doc) => {
  if (!doc) return
  if (doc.id === selectedDoc.value?.id) {
    closeMobileDocMenu()
    return
  }
  selectedDoc.value = doc
  closeMobileDocMenu()
  docStarred.value = false
  docStarCount.value = 0
  if (!(doc.id in imagesLoaded)) {
    imagesLoaded[doc.id] = false
  }
  await Promise.all([
    loadDocContent(doc),
    loadDocStarStatus(doc)
  ])
}

const loadDocsCatalog = async () => {
  try {
    const apiDocs = await fetchPublicDocs()
    if (apiDocs.length) {
      docs.value = apiDocs
      selectedDoc.value = getDocById(route.query.doc) || docs.value[0] || null
    }
  } catch {
    docs.value = staticDocs
    selectedDoc.value = getDocById(route.query.doc) || docs.value[0] || null
  }
}

const scrollToHeading = (id) => {
  const container = readerScrollRef.value
  const content = markdownContentRef.value
  if (!container || !content || !id) return

  const heading = content.querySelector(getHeadingSelector(id))
  if (!heading) return

  container.scrollTo({
    top: heading.offsetTop - 32,
    behavior: 'smooth'
  })
  activeHeadingId.value = id
}

const handleReaderScroll = () => {
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(() => {
    updateActiveHeading()
    scrollRaf = 0
  })
}

onMounted(async () => {
  await loadDocsCatalog()
  docs.value.forEach((doc) => {
    imagesLoaded[doc.id] = false
  })
  warmupCodeHighlighter()
  await Promise.all([
    loadDocContent(selectedDoc.value),
    loadDocStarStatus(selectedDoc.value)
  ])
})

watch(() => authStore.isLoggedIn, () => {
  loadDocStarStatus(selectedDoc.value)
})

watch(() => route.query.doc, async (docId) => {
  const doc = getDocById(docId)
  if (!doc || doc.id === selectedDoc.value?.id) return
  await selectDoc(doc)
})

onBeforeUnmount(() => {
  if (scrollRaf) {
    window.cancelAnimationFrame(scrollRaf)
  }
})
</script>

<style scoped src="../styles/docs.css"></style>
