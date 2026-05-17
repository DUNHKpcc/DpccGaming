<template>
  <div class="blog-page">
    <div class="content-wrapper">
      <div class="container mx-auto px-4 py-8 blog-main">
        <div class="blog-header flex justify-between items-center mb-8">
          <h1 class="text-3xl font-bold">开发日志</h1>
        </div>

        <!-- Only cards area scrolls -->
        <div class="blog-cards-scroll">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <article
              v-for="post in posts"
              :key="post.cardId"
              class="blog-card glass-card overflow-hidden flex flex-col"
            >
              <div class="blog-image-wrapper">
                <img 
                  :src="post.image" 
                  :alt="post.title" 
                  :class="['blog-image', { loaded: imagesLoaded[post.cardId] }]"
                  loading="lazy"
                  @error="handleImageError($event, post)"
                  @load="handleImageLoad($event, post)"
                />
                <div class="image-loading" v-if="!imagesLoaded[post.cardId]">
                  <div class="loading-spinner"></div>
                </div>
              </div>
              <div class="blog-content p-5 flex-1 flex flex-col">
                <h2 class="blog-card-title text-xl font-bold mb-2">
                  {{ post.title }}
                </h2>
                <div class="post-meta mb-3">
                  <span class="post-date">{{ post.dateLabel }}</span>
                  <span class="post-author">
                    <img src="/Ai/Sun.jpeg" alt="SunJiaHao" class="author-avatar" />
                    <span>{{ post.author }}</span>
                  </span>
                </div>
                <p class="blog-card-summary text-sm leading-relaxed flex-1">
                  {{ post.summary }}
                </p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted, ref } from 'vue'
import { blogPosts } from '../data/blogPosts'
import { normalizeBlogPosts } from '../utils/contentCatalog'
import { fetchPublicBlogPosts } from '../utils/contentApi'

const imagesLoaded = reactive({})
const imageErrors = reactive({})
const staticBlogPosts = import.meta.env.DEV ? normalizeBlogPosts(blogPosts) : []
const posts = ref(staticBlogPosts)

const handleImageLoad = (event, post) => {
  imagesLoaded[post.cardId] = true
}

const handleImageError = (event, post) => {
  imagesLoaded[post.cardId] = true
  imageErrors[post.cardId] = true
  console.warn(`Failed to load image for post ${post.cardId}:`, event.target.src)
}

const initializeCards = () => {
  posts.value.forEach(post => {
    imagesLoaded[post.cardId] = false
  })
}

const loadBlogPosts = async () => {
  try {
    const apiPosts = await fetchPublicBlogPosts()
    if (apiPosts.length) {
      posts.value = apiPosts
    }
  } catch {
    posts.value = staticBlogPosts
  }
  initializeCards()
}

onMounted(loadBlogPosts)
</script>

<style scoped>
.blog-page {
  --blog-page-bg: #000000;
  --blog-page-text: #ffffff;
  --blog-page-muted: rgba(255, 255, 255, 0.72);
  --blog-card-surface: rgba(255, 255, 255, 0.06);
  --blog-card-border: rgba(255, 255, 255, 0.14);
  --blog-card-shadow: rgba(0, 0, 0, 0.42);
  --blog-card-hover-border: rgba(255, 255, 255, 0.2);
  --blog-card-hover-shadow: rgba(0, 0, 0, 0.5);
  --blog-content-bg: #161b22;
  --blog-content-text: #f8fafc;
  --blog-content-muted: rgba(226, 232, 240, 0.7);
  --blog-content-border: rgba(255, 255, 255, 0.08);
  --blog-avatar-border: rgba(255, 255, 255, 0.2);
  --blog-loading-bg: rgba(0, 0, 0, 0.42);
  --blog-spinner-track: rgba(255, 255, 255, 0.26);
  --blog-spinner-head: #ffffff;
  height: 100vh;
  overflow: hidden;
  background: var(--blog-page-bg);
  color: var(--blog-page-text);
}

[data-theme='light'] .blog-page {
  --blog-page-bg: #ffffff;
  --blog-page-text: #0f172a;
  --blog-page-muted: rgba(15, 23, 42, 0.72);
  --blog-card-surface: #ffffff;
  --blog-card-border: rgba(148, 163, 184, 0.24);
  --blog-card-shadow: rgba(148, 163, 184, 0.18);
  --blog-card-hover-border: rgba(94, 123, 160, 0.3);
  --blog-card-hover-shadow: rgba(148, 163, 184, 0.24);
  --blog-content-bg: #f3f6fa;
  --blog-content-text: #111827;
  --blog-content-muted: rgba(17, 24, 39, 0.64);
  --blog-content-border: rgba(15, 23, 42, 0.08);
  --blog-avatar-border: rgba(15, 23, 42, 0.16);
  --blog-loading-bg: rgba(255, 255, 255, 0.78);
  --blog-spinner-track: rgba(100, 116, 139, 0.25);
  --blog-spinner-head: #334155;
}

.content-wrapper {
  padding-top: 0;
  height: 100%;
}

.blog-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.blog-cards-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 2rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.blog-cards-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.blog-card {
  border-radius: 18px;
}

.post-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--blog-content-muted);
}

.post-date {
  flex: 1;
  min-width: 0;
}

.post-author {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--blog-content-muted);
  white-space: nowrap;
}

.author-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--blog-avatar-border);
}

.blog-header h1 {
  color: var(--blog-page-text);
}

@media (min-width: 1024px) {
  .blog-page .content-wrapper {
    padding-left: 96px;
  }
}

@media (min-width: 1536px) {
  .blog-page .content-wrapper {
    padding-left: 120px;
  }
}

.glass-card {
  background: var(--blog-card-surface);
  border: 1px solid var(--blog-card-border);
  box-shadow: 0 14px 34px var(--blog-card-shadow);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

.glass-card:hover {
  transform: translateY(-4px);
  border-color: var(--blog-card-hover-border);
  box-shadow: 0 20px 42px var(--blog-card-hover-shadow);
}

.blog-image-wrapper {
  position: relative;
  width: 100%;
  padding-top: 56.25%;
  overflow: hidden;
}

.blog-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.blog-content {
  gap: 0.9rem;
  color: var(--blog-content-text);
  background: var(--blog-content-bg);
  border-top: 1px solid var(--blog-content-border);
}

.blog-card-title {
  color: var(--blog-content-text);
}

.blog-card-summary {
  color: var(--blog-content-muted);
}

.blog-image.loaded {
  opacity: 1;
}

.image-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--blog-loading-bg);
  backdrop-filter: blur(6px);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--blog-spinner-track);
  border-radius: 50%;
  border-top-color: var(--blog-spinner-head);
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
