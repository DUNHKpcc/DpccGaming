const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const normalizeSegment = (value = '', fallback = 'asset') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
};

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const removeUploadedFiles = async (files = []) => {
  await Promise.all(
    files
      .map((file) => file?.path)
      .filter(Boolean)
      .map((filePath) => fs.rm(filePath, { force: true }).catch(() => {}))
  );
};

const processMarkdownContentAssets = async ({
  markdown = '',
  files = [],
  tokens = [],
  docKey = '',
  assetsDir = '',
  publicAssetPrefix = '/uploads/content/docs/assets',
  maxSize = 1600
} = {}) => {
  const assetFiles = Array.isArray(files) ? files : [];
  const assetTokens = Array.isArray(tokens) ? tokens : [];
  if (!assetFiles.length) return { markdown: String(markdown || ''), assets: [] };

  const docSegment = normalizeSegment(docKey, 'doc');
  const targetDir = path.join(assetsDir, docSegment);
  await ensureDir(targetDir);

  let nextMarkdown = String(markdown || '');
  const assets = [];

  for (let index = 0; index < assetFiles.length; index += 1) {
    const file = assetFiles[index];
    const token = String(assetTokens[index] || '').trim();
    if (!file?.path || !token) continue;

    const assetSegment = normalizeSegment(token, `image-${index + 1}`);
    const outputName = `${assetSegment}.webp`;
    const outputPath = path.join(targetDir, outputName);

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

    const publicUrl = `${publicAssetPrefix}/${docSegment}/${outputName}`;
    nextMarkdown = nextMarkdown.replace(new RegExp(`local://${escapeRegExp(token)}`, 'g'), publicUrl);
    assets.push({
      token,
      url: publicUrl,
      path: outputPath
    });
  }

  return {
    markdown: nextMarkdown,
    assets
  };
};

module.exports = {
  normalizeSegment,
  processMarkdownContentAssets,
  removeUploadedFiles
};
