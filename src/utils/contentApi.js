import { normalizeBlogPosts, normalizeDocs } from './contentCatalog'

const fetchJson = async (endpoint) => {
  const response = await fetch(endpoint, {
    credentials: 'include'
  })
  if (!response.ok) {
    throw new Error('内容加载失败')
  }
  return response.json()
}

export const fetchPublicBlogPosts = async () => {
  const data = await fetchJson('/api/content/blog-posts')
  return normalizeBlogPosts(data?.posts || [])
}

export const fetchPublicDocs = async () => {
  const data = await fetchJson('/api/content/docs')
  return normalizeDocs(data?.docs || [])
}
