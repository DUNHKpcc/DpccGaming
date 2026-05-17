const DEFAULT_BLOG_AUTHOR = 'SunJiaHao'
const BLOG_IMAGE_ROOT = '/Blog'

const splitLegacyBlogDate = (date = '') => {
  const value = String(date || '').trim()
  const separatorIndex = value.lastIndexOf(' ')
  if (separatorIndex < 0) {
    return {
      dateLabel: value,
      author: DEFAULT_BLOG_AUTHOR
    }
  }

  return {
    dateLabel: value.slice(0, separatorIndex),
    author: value.slice(separatorIndex + 1) || DEFAULT_BLOG_AUTHOR
  }
}

export const normalizeBlogPost = (post = {}, index = 0) => {
  const legacyDate = splitLegacyBlogDate(post.date)
  const imageName = String(post.imageName || '').trim()

  return {
    ...post,
    cardId: post.cardId || `${imageName || post.id || 'blog'}-${index}`,
    image: post.image || (imageName ? `${BLOG_IMAGE_ROOT}/${imageName}` : ''),
    dateLabel: post.dateLabel || legacyDate.dateLabel,
    author: post.author || legacyDate.author
  }
}

export const normalizeBlogPosts = (posts = []) => (
  Array.isArray(posts) ? posts.map((post, index) => normalizeBlogPost(post, index)) : []
)

export const normalizeDocItem = (doc = {}) => ({
  ...doc,
  id: String(doc.id || doc.docKey || '').trim(),
  title: String(doc.title || '').trim(),
  tag: String(doc.tag || '其它').trim() || '其它',
  summary: String(doc.summary || '').trim(),
  publisher: doc.publisher || {
    username: doc.publisherName || 'dpccgamingSunJiaHao',
    avatar: doc.publisherAvatar || '/Ai/Sun.jpeg'
  },
  cover: doc.cover || doc.coverUrl || '',
  file: doc.file || doc.fileUrl || ''
})

export const normalizeDocs = (docs = []) => (
  Array.isArray(docs) ? docs.map((doc) => normalizeDocItem(doc)).filter((doc) => doc.id && doc.title) : []
)
