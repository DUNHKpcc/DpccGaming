const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { getPool } = require('../config/database');
const {
  normalizeSegment,
  processMarkdownContentAssets,
  removeUploadedFiles
} = require('../utils/contentMarkdownAssets');

const UPLOADS_ROOT = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
const CONTENT_UPLOAD_ROOT = path.join(UPLOADS_ROOT, 'content');
const BLOG_UPLOAD_DIR = path.join(CONTENT_UPLOAD_ROOT, 'blog');
const DOC_FILE_UPLOAD_DIR = path.join(CONTENT_UPLOAD_ROOT, 'docs', 'files');
const DOC_COVER_UPLOAD_DIR = path.join(CONTENT_UPLOAD_ROOT, 'docs', 'covers');
const DOC_ASSET_UPLOAD_DIR = path.join(CONTENT_UPLOAD_ROOT, 'docs', 'assets');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const LEGACY_DOC_ASSET_PREFIXES = ['/docsPhoto/', '/doc-covers/', '/Blog/'];

let contentTablesReady = false;
let contentTablesPromise = null;

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const ensureContentUploadDirs = async () => {
  await Promise.all([
    ensureDir(BLOG_UPLOAD_DIR),
    ensureDir(DOC_FILE_UPLOAD_DIR),
    ensureDir(DOC_COVER_UPLOAD_DIR),
    ensureDir(DOC_ASSET_UPLOAD_DIR)
  ]);
};

const buildUploadedFileUrl = (uploadedPath = '') => {
  const relativePath = path.relative(UPLOADS_ROOT, uploadedPath)
    .split(path.sep)
    .join('/');
  if (!relativePath || relativePath.startsWith('..')) return '';
  return `/uploads/${relativePath}`;
};

const resolveManagedUploadPath = (fileUrl = '') => {
  const normalized = String(fileUrl || '').trim();
  if (!normalized.startsWith('/uploads/content/')) return '';
  const relativePath = normalized.replace(/^\/uploads\//, '');
  const fullPath = path.join(UPLOADS_ROOT, ...relativePath.split('/'));
  const relativeToContent = path.relative(CONTENT_UPLOAD_ROOT, fullPath);
  if (!relativeToContent || relativeToContent.startsWith('..')) return '';
  return fullPath;
};

const removeManagedUpload = async (fileUrl = '') => {
  const filePath = resolveManagedUploadPath(fileUrl);
  if (!filePath) return;
  await fs.rm(filePath, { force: true }).catch(() => {});
};

const getWebpOutputPath = (filePath = '') => {
  const parsed = path.parse(filePath);
  const preferred = path.join(parsed.dir, `${parsed.name}.webp`);
  return preferred === filePath
    ? path.join(parsed.dir, `${parsed.name}-optimized.webp`)
    : preferred;
};

const optimizeUploadedImage = async (file, options = {}) => {
  if (!file?.path) return null;
  const maxSize = options.maxSize || 1600;
  const outputPath = getWebpOutputPath(file.path);

  await sharp(file.path)
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toFile(outputPath);

  await fs.rm(file.path, { force: true }).catch(() => {});
  file.path = outputPath;
  file.filename = path.basename(outputPath);
  file.mimetype = 'image/webp';
  return file;
};

const parseUrlPath = (url = '') => {
  const value = String(url || '').trim();
  const pathOnly = value.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
};

const getLegacyDocAssetUrl = async (rawUrl = '') => {
  const value = String(rawUrl || '').trim();
  const pathname = parseUrlPath(value);
  if (!LEGACY_DOC_ASSET_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return value;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  const sourcePath = path.join(PUBLIC_ROOT, ...relativePath.split('/'));
  const relativeToPublic = path.relative(PUBLIC_ROOT, sourcePath);
  if (!relativeToPublic || relativeToPublic.startsWith('..')) return value;

  try {
    await fs.access(sourcePath);
  } catch {
    return value;
  }

  const targetPath = path.join(DOC_ASSET_UPLOAD_DIR, ...relativePath.split('/'));
  await ensureDir(path.dirname(targetPath));
  await fs.copyFile(sourcePath, targetPath).catch(async (error) => {
    if (error?.code !== 'ENOENT') throw error;
    await ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, targetPath);
  });

  const suffix = value.slice(pathname.length);
  return `/uploads/content/docs/assets/${relativePath}${suffix}`;
};

const normalizeMarkdownAssetUrls = async (filePath = '') => {
  if (!filePath) return;
  let markdown = await fs.readFile(filePath, 'utf8');
  const urls = new Set();

  markdown.replace(/!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (match, url) => {
    urls.add(url);
    return match;
  });
  markdown.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (match, url) => {
    urls.add(url);
    return match;
  });

  for (const url of urls) {
    const nextUrl = await getLegacyDocAssetUrl(url);
    if (nextUrl && nextUrl !== url) {
      markdown = markdown.split(url).join(nextUrl);
    }
  }

  await fs.writeFile(filePath, markdown);
};

const parseJsonArray = (value = '') => {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getDocUploadFiles = (req) => ([
  req.files?.cover?.[0],
  req.files?.file?.[0],
  ...(req.files?.contentImages || [])
]).filter(Boolean);

const cleanupDocUploads = async (req) => {
  await removeUploadedFiles([
    ...getDocUploadFiles(req),
    req.generatedMarkdownPath ? { path: req.generatedMarkdownPath } : null
  ].filter(Boolean));
};

const removeDocAssetDir = async (docKey = '') => {
  const docSegment = normalizeSegment(docKey, 'doc');
  await fs.rm(path.join(DOC_ASSET_UPLOAD_DIR, docSegment), { recursive: true, force: true }).catch(() => {});
};

const writeMarkdownContentFile = async (req, docKey = '') => {
  const markdownContent = String(req.body.markdownContent || '');
  const contentImages = req.files?.contentImages || [];
  const contentImageTokens = parseJsonArray(req.body.contentImageTokens);

  const processed = await processMarkdownContentAssets({
    markdown: markdownContent,
    files: contentImages,
    tokens: contentImageTokens,
    docKey,
    assetsDir: DOC_ASSET_UPLOAD_DIR,
    publicAssetPrefix: '/uploads/content/docs/assets'
  });

  await ensureDir(DOC_FILE_UPLOAD_DIR);
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const filePath = path.join(DOC_FILE_UPLOAD_DIR, `doc-file-${suffix}.md`);
  await fs.writeFile(filePath, processed.markdown, 'utf8');
  req.generatedMarkdownPath = filePath;
  return {
    path: filePath,
    filename: path.basename(filePath),
    mimetype: 'text/markdown'
  };
};

const ensureContentTables = async (pool) => {
  if (contentTablesReady) return;
  if (contentTablesPromise) {
    await contentTablesPromise;
    return;
  }

  contentTablesPromise = (async () => {
    await pool.execute(
      `CREATE TABLE IF NOT EXISTS content_blog_posts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        summary TEXT NULL,
        image_url VARCHAR(500) NOT NULL DEFAULT '',
        author VARCHAR(80) NOT NULL DEFAULT 'SunJiaHao',
        status ENUM('draft', 'published') NOT NULL DEFAULT 'published',
        published_at DATE NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_content_blog_posts_status_sort (status, sort_order, published_at),
        KEY idx_content_blog_posts_created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    await pool.execute(
      `CREATE TABLE IF NOT EXISTS content_docs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        doc_key VARCHAR(120) NOT NULL,
        title VARCHAR(220) NOT NULL,
        tag VARCHAR(80) NOT NULL DEFAULT '其它',
        summary TEXT NULL,
        publisher_name VARCHAR(120) NOT NULL DEFAULT 'dpccgamingSunJiaHao',
        publisher_avatar VARCHAR(500) NOT NULL DEFAULT '/Ai/Sun.jpeg',
        cover_url VARCHAR(500) NOT NULL DEFAULT '',
        file_url VARCHAR(500) NOT NULL DEFAULT '',
        status ENUM('draft', 'published') NOT NULL DEFAULT 'published',
        sort_order INT NOT NULL DEFAULT 0,
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_content_docs_key (doc_key),
        KEY idx_content_docs_status_sort (status, sort_order, created_at),
        KEY idx_content_docs_created_by (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  })();

  try {
    await contentTablesPromise;
    contentTablesReady = true;
  } finally {
    contentTablesPromise = null;
  }
};

const cleanText = (value = '', maxLength = 500) => (
  String(value || '').trim().slice(0, maxLength)
);

const parseStatus = (value = '') => (
  value === 'draft' ? 'draft' : 'published'
);

const parseSortOrder = (value = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value = '') => {
  const normalized = cleanText(value, 20);
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized) ? normalized : null;
};

const formatDateOnly = (value) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const isValidDocKey = (value = '') => /^[A-Za-z0-9_-]{2,120}$/.test(value);

const mapBlogRow = (row = {}) => ({
  id: row.id,
  title: row.title || '',
  summary: row.summary || '',
  image: row.image_url || '',
  imageUrl: row.image_url || '',
  author: row.author || 'SunJiaHao',
  dateLabel: formatDateOnly(row.published_at),
  publishedAt: formatDateOnly(row.published_at) || null,
  status: row.status || 'published',
  sortOrder: Number(row.sort_order || 0),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

const mapDocRow = (row = {}) => ({
  id: row.doc_key || String(row.id || ''),
  numericId: row.id,
  docKey: row.doc_key || '',
  title: row.title || '',
  tag: row.tag || '其它',
  summary: row.summary || '',
  publisher: {
    username: row.publisher_name || 'dpccgamingSunJiaHao',
    avatar: row.publisher_avatar || '/Ai/Sun.jpeg'
  },
  cover: row.cover_url || '',
  file: row.file_url || '',
  coverUrl: row.cover_url || '',
  fileUrl: row.file_url || '',
  status: row.status || 'published',
  sortOrder: Number(row.sort_order || 0),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

const listPublicBlogPosts = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute(
      `SELECT id, title, summary, image_url, author, status, published_at, sort_order, created_at, updated_at
       FROM content_blog_posts
       WHERE status = 'published'
       ORDER BY sort_order ASC, COALESCE(published_at, created_at) DESC, id DESC`
    );

    res.json({ posts: rows.map(mapBlogRow) });
  } catch (error) {
    console.error('获取公开Blog失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const listPublicDocs = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute(
      `SELECT id, doc_key, title, tag, summary, publisher_name, publisher_avatar,
              cover_url, file_url, status, sort_order, created_at, updated_at
       FROM content_docs
       WHERE status = 'published'
       ORDER BY sort_order ASC, created_at DESC, id DESC`
    );

    res.json({ docs: rows.map(mapDocRow) });
  } catch (error) {
    console.error('获取公开文档失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const listAdminBlogPosts = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute(
      `SELECT id, title, summary, image_url, author, status, published_at, sort_order, created_at, updated_at
       FROM content_blog_posts
       ORDER BY sort_order ASC, COALESCE(published_at, created_at) DESC, id DESC`
    );

    res.json({ posts: rows.map(mapBlogRow) });
  } catch (error) {
    console.error('获取Blog管理列表失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const createAdminBlogPost = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const title = cleanText(req.body.title, 180);
    if (!title) {
      if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(400).json({ error: '请填写Blog标题' });
    }

    if (req.file) await optimizeUploadedImage(req.file);
    const imageUrl = req.file ? buildUploadedFileUrl(req.file.path) : cleanText(req.body.imageUrl, 500);
    const [result] = await pool.execute(
      `INSERT INTO content_blog_posts
       (title, summary, image_url, author, status, published_at, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        cleanText(req.body.summary, 2000),
        imageUrl,
        cleanText(req.body.author, 80) || 'SunJiaHao',
        parseStatus(req.body.status),
        parseDate(req.body.publishedAt),
        parseSortOrder(req.body.sortOrder),
        req.user.userId,
        req.user.userId
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM content_blog_posts WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ post: mapBlogRow(rows[0] || {}) });
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    console.error('创建Blog失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const updateAdminBlogPost = async (req, res) => {
  try {
    const postId = Number(req.params.id || 0);
    if (!postId) return res.status(400).json({ error: '无效的内容ID' });

    const pool = getPool();
    await ensureContentTables(pool);

    const title = cleanText(req.body.title, 180);
    if (!title) {
      if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(400).json({ error: '请填写Blog标题' });
    }

    const [existingRows] = await pool.execute('SELECT * FROM content_blog_posts WHERE id = ? LIMIT 1', [postId]);
    if (!existingRows.length) {
      if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
      return res.status(404).json({ error: 'Blog不存在' });
    }

    const existing = existingRows[0];
    if (req.file) await optimizeUploadedImage(req.file);
    const imageUrl = req.file ? buildUploadedFileUrl(req.file.path) : cleanText(req.body.imageUrl || existing.image_url, 500);
    await pool.execute(
      `UPDATE content_blog_posts
       SET title = ?, summary = ?, image_url = ?, author = ?, status = ?, published_at = ?, sort_order = ?, updated_by = ?
      WHERE id = ?`,
      [
        title,
        cleanText(req.body.summary, 2000),
        imageUrl,
        cleanText(req.body.author, 80) || 'SunJiaHao',
        parseStatus(req.body.status),
        parseDate(req.body.publishedAt),
        parseSortOrder(req.body.sortOrder),
        req.user.userId,
        postId
      ]
    );

    if (req.file && existing.image_url !== imageUrl) {
      await removeManagedUpload(existing.image_url);
    }

    const [rows] = await pool.execute('SELECT * FROM content_blog_posts WHERE id = ? LIMIT 1', [postId]);
    res.json({ post: mapBlogRow(rows[0] || {}) });
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true }).catch(() => {});
    console.error('更新Blog失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const deleteAdminBlogPost = async (req, res) => {
  try {
    const postId = Number(req.params.id || 0);
    if (!postId) return res.status(400).json({ error: '无效的内容ID' });

    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute('SELECT * FROM content_blog_posts WHERE id = ? LIMIT 1', [postId]);
    if (!rows.length) return res.status(404).json({ error: 'Blog不存在' });

    await pool.execute('DELETE FROM content_blog_posts WHERE id = ?', [postId]);
    await removeManagedUpload(rows[0].image_url);
    res.json({ removed: true, id: postId });
  } catch (error) {
    console.error('删除Blog失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const listAdminDocs = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute(
      `SELECT id, doc_key, title, tag, summary, publisher_name, publisher_avatar,
              cover_url, file_url, status, sort_order, created_at, updated_at
       FROM content_docs
       ORDER BY sort_order ASC, created_at DESC, id DESC`
    );

    res.json({ docs: rows.map(mapDocRow) });
  } catch (error) {
    console.error('获取文档管理列表失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const createAdminDoc = async (req, res) => {
  try {
    const pool = getPool();
    await ensureContentTables(pool);

    const docKey = cleanText(req.body.docKey, 120);
    const title = cleanText(req.body.title, 220);
    if (!isValidDocKey(docKey)) {
      await cleanupDocUploads(req);
      return res.status(400).json({ error: '文档ID仅支持字母、数字、下划线和中划线，长度 2-120' });
    }
    if (!title) {
      await cleanupDocUploads(req);
      return res.status(400).json({ error: '请填写文档标题' });
    }

    const coverFile = req.files?.cover?.[0] || null;
    let docFile = req.files?.file?.[0] || null;
    const hasMarkdownContent = Object.prototype.hasOwnProperty.call(req.body, 'markdownContent')
      && String(req.body.markdownContent || '').length > 0;
    if (coverFile) await optimizeUploadedImage(coverFile, { maxSize: 1400 });
    if (hasMarkdownContent) {
      if (docFile?.path) await fs.rm(docFile.path, { force: true }).catch(() => {});
      docFile = await writeMarkdownContentFile(req, docKey);
    } else {
      if (req.files?.contentImages?.length) await removeUploadedFiles(req.files.contentImages);
      if (docFile) await normalizeMarkdownAssetUrls(docFile.path);
    }
    const coverUrl = coverFile ? buildUploadedFileUrl(coverFile.path) : cleanText(req.body.coverUrl, 500);
    const fileUrl = docFile ? buildUploadedFileUrl(docFile.path) : cleanText(req.body.fileUrl, 500);

    const [result] = await pool.execute(
      `INSERT INTO content_docs
       (doc_key, title, tag, summary, publisher_name, publisher_avatar, cover_url, file_url, status, sort_order, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docKey,
        title,
        cleanText(req.body.tag, 80) || '其它',
        cleanText(req.body.summary, 2000),
        cleanText(req.body.publisherName, 120) || 'dpccgamingSunJiaHao',
        cleanText(req.body.publisherAvatar, 500) || '/Ai/Sun.jpeg',
        coverUrl,
        fileUrl,
        parseStatus(req.body.status),
        parseSortOrder(req.body.sortOrder),
        req.user.userId,
        req.user.userId
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM content_docs WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json({ doc: mapDocRow(rows[0] || {}) });
  } catch (error) {
    await cleanupDocUploads(req);
    const isDuplicate = error?.code === 'ER_DUP_ENTRY';
    console.error('创建文档失败:', error);
    res.status(isDuplicate ? 409 : 500).json({ error: isDuplicate ? '文档ID已存在' : '服务器内部错误' });
  }
};

const updateAdminDoc = async (req, res) => {
  try {
    const docId = Number(req.params.id || 0);
    if (!docId) return res.status(400).json({ error: '无效的文档ID' });

    const pool = getPool();
    await ensureContentTables(pool);

    const docKey = cleanText(req.body.docKey, 120);
    const title = cleanText(req.body.title, 220);
    if (!isValidDocKey(docKey)) {
      await cleanupDocUploads(req);
      return res.status(400).json({ error: '文档ID仅支持字母、数字、下划线和中划线，长度 2-120' });
    }
    if (!title) {
      await cleanupDocUploads(req);
      return res.status(400).json({ error: '请填写文档标题' });
    }

    const [existingRows] = await pool.execute('SELECT * FROM content_docs WHERE id = ? LIMIT 1', [docId]);
    if (!existingRows.length) {
      await cleanupDocUploads(req);
      return res.status(404).json({ error: '文档不存在' });
    }

    const existing = existingRows[0];
    const coverFile = req.files?.cover?.[0] || null;
    let docFile = req.files?.file?.[0] || null;
    const hasMarkdownContent = Object.prototype.hasOwnProperty.call(req.body, 'markdownContent')
      && String(req.body.markdownContent || '').length > 0;
    if (coverFile) await optimizeUploadedImage(coverFile, { maxSize: 1400 });
    if (hasMarkdownContent) {
      if (docFile?.path) await fs.rm(docFile.path, { force: true }).catch(() => {});
      docFile = await writeMarkdownContentFile(req, docKey);
    } else {
      if (req.files?.contentImages?.length) await removeUploadedFiles(req.files.contentImages);
      if (docFile) await normalizeMarkdownAssetUrls(docFile.path);
    }
    const coverUrl = coverFile ? buildUploadedFileUrl(coverFile.path) : cleanText(req.body.coverUrl || existing.cover_url, 500);
    const fileUrl = docFile ? buildUploadedFileUrl(docFile.path) : cleanText(req.body.fileUrl || existing.file_url, 500);

    await pool.execute(
      `UPDATE content_docs
       SET doc_key = ?, title = ?, tag = ?, summary = ?, publisher_name = ?, publisher_avatar = ?,
           cover_url = ?, file_url = ?, status = ?, sort_order = ?, updated_by = ?
      WHERE id = ?`,
      [
        docKey,
        title,
        cleanText(req.body.tag, 80) || '其它',
        cleanText(req.body.summary, 2000),
        cleanText(req.body.publisherName, 120) || 'dpccgamingSunJiaHao',
        cleanText(req.body.publisherAvatar, 500) || '/Ai/Sun.jpeg',
        coverUrl,
        fileUrl,
        parseStatus(req.body.status),
        parseSortOrder(req.body.sortOrder),
        req.user.userId,
        docId
      ]
    );

    if (coverFile && existing.cover_url !== coverUrl) await removeManagedUpload(existing.cover_url);
    if (docFile && existing.file_url !== fileUrl) await removeManagedUpload(existing.file_url);

    const [rows] = await pool.execute('SELECT * FROM content_docs WHERE id = ? LIMIT 1', [docId]);
    res.json({ doc: mapDocRow(rows[0] || {}) });
  } catch (error) {
    await cleanupDocUploads(req);
    const isDuplicate = error?.code === 'ER_DUP_ENTRY';
    console.error('更新文档失败:', error);
    res.status(isDuplicate ? 409 : 500).json({ error: isDuplicate ? '文档ID已存在' : '服务器内部错误' });
  }
};

const deleteAdminDoc = async (req, res) => {
  try {
    const docId = Number(req.params.id || 0);
    if (!docId) return res.status(400).json({ error: '无效的文档ID' });

    const pool = getPool();
    await ensureContentTables(pool);

    const [rows] = await pool.execute('SELECT * FROM content_docs WHERE id = ? LIMIT 1', [docId]);
    if (!rows.length) return res.status(404).json({ error: '文档不存在' });

    await pool.execute('DELETE FROM content_docs WHERE id = ?', [docId]);
    await Promise.all([
      removeManagedUpload(rows[0].cover_url),
      removeManagedUpload(rows[0].file_url),
      removeDocAssetDir(rows[0].doc_key)
    ]);
    res.json({ removed: true, id: docId });
  } catch (error) {
    console.error('删除文档失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

const reorderAdminDocs = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    // 去重 + 仅保留正整数 ID，保持传入顺序
    const ids = [];
    const seen = new Set();
    for (const item of rawIds) {
      const id = Number(item);
      if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    if (ids.length === 0) {
      return res.status(400).json({ error: '请提供有效的文档排序顺序' });
    }
    if (ids.length > 500) {
      return res.status(400).json({ error: '单次排序文档数量超出限制' });
    }

    const pool = getPool();
    await ensureContentTables(pool);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      // 按传入顺序赋值 sort_order = index * 10，间隔 10 便于后续微调，
      // 同时把历史重复/默认 0 值规范化为唯一递增序列。
      for (let index = 0; index < ids.length; index += 1) {
        await connection.execute(
          'UPDATE content_docs SET sort_order = ?, updated_by = ? WHERE id = ?',
          [index * 10, req.user.userId, ids[index]]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.json({ updated: ids.length });
  } catch (error) {
    console.error('文档排序失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
};

module.exports = {
  BLOG_UPLOAD_DIR,
  DOC_FILE_UPLOAD_DIR,
  DOC_COVER_UPLOAD_DIR,
  DOC_ASSET_UPLOAD_DIR,
  ensureContentUploadDirs,
  listPublicBlogPosts,
  listPublicDocs,
  listAdminBlogPosts,
  createAdminBlogPost,
  updateAdminBlogPost,
  deleteAdminBlogPost,
  listAdminDocs,
  createAdminDoc,
  updateAdminDoc,
  deleteAdminDoc,
  reorderAdminDocs
};
