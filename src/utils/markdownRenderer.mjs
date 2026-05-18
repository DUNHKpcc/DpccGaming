import { createHeadingIdGenerator } from './docsNavigation.js'

export const escapeHtml = (text = '') =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const resolveDocAssetUrl = (url = '', baseUrl = '') => {
  const value = String(url || '').trim()
  if (!value) return ''
  if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith('/')) return value
  if (!baseUrl) return value

  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return value
  }
}

const resolveMarkdownAssetUrl = (url = '', baseUrl = '', options = {}) => {
  if (typeof options.resolveAssetUrl === 'function') {
    return options.resolveAssetUrl(url, baseUrl)
  }
  return resolveDocAssetUrl(url, baseUrl)
}

export const renderInlineMarkdown = (text = '', options = {}) => {
  const baseUrl = String(options.baseUrl || '')
  const escaped = escapeHtml(text)

  return escaped
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => (
      `<img src="${resolveMarkdownAssetUrl(src, baseUrl, options)}" alt="${alt}" loading="lazy" />`
    ))
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => (
      `<a href="${resolveMarkdownAssetUrl(href, baseUrl, options)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    ))
}

const CODE_LANGUAGE_LABELS = {
  js: 'JS',
  jsx: 'JSX',
  javascript: 'JS',
  ts: 'TS',
  tsx: 'TSX',
  typescript: 'TS',
  json: 'JSON',
  html: 'HTML',
  xml: 'XML',
  vue: 'VUE',
  css: 'CSS',
  scss: 'SCSS',
  less: 'LESS',
  py: 'PY',
  python: 'PYTHON',
  sh: 'SH',
  bash: 'BASH',
  zsh: 'ZSH',
  md: 'MD',
  markdown: 'MD',
  yml: 'YAML',
  yaml: 'YAML'
}

const getCodeLanguageLabel = (language = '') => {
  const normalized = String(language || '').trim().toLowerCase()
  if (!normalized) return 'TEXT'
  return CODE_LANGUAGE_LABELS[normalized] || normalized.toUpperCase()
}

const encodeCodeForDataAttribute = (code = '') => escapeHtml(encodeURIComponent(String(code || '')))

const renderCodeBlockShell = ({ code = '', language = '', languageLabel = 'TEXT', codeHtml = '' } = {}) => {
  const normalizedLanguage = String(language || '').trim()
  const langClass = normalizedLanguage ? ` language-${normalizedLanguage}` : ''
  const safeLanguage = escapeHtml(normalizedLanguage)
  const safeLanguageLabel = escapeHtml(languageLabel)

  return `<div class="markdown-code-block" data-code="${encodeCodeForDataAttribute(code)}" data-language="${safeLanguage}" data-language-label="${safeLanguageLabel}"><div class="markdown-code-toolbar"><span class="markdown-code-language">${safeLanguageLabel}</span><button type="button" class="markdown-code-copy-btn" data-action="copy-code" aria-label="复制代码" title="复制代码">复制代码</button></div><pre><code class="hljs${langClass}">${codeHtml}</code></pre></div>`
}

export const renderMarkdownToHtml = async (markdown = '', options = {}) => {
  const baseUrl = String(options.baseUrl || '')
  const renderCodeBlock = typeof options.renderCodeBlock === 'function'
    ? options.renderCodeBlock
    : null

  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  let html = ''
  let paragraph = []
  let inCode = false
  let codeLang = ''
  let codeLines = []
  let inUnorderedList = false
  let inOrderedList = false
  const getHeadingId = createHeadingIdGenerator()

  const flushParagraph = () => {
    if (!paragraph.length) return
    html += `<p>${renderInlineMarkdown(paragraph.join(' '), options)}</p>`
    paragraph = []
  }

  const closeLists = () => {
    if (inUnorderedList) {
      html += '</ul>'
      inUnorderedList = false
    }
    if (inOrderedList) {
      html += '</ol>'
      inOrderedList = false
    }
  }

  const flushCodeBlock = async () => {
    const payload = {
      code: codeLines.join('\n'),
      language: codeLang,
      languageLabel: getCodeLanguageLabel(codeLang)
    }

    if (renderCodeBlock) {
      try {
        const rendered = await renderCodeBlock(payload)
        if (rendered !== undefined && rendered !== null) {
          html += renderCodeBlockShell({
            ...payload,
            codeHtml: String(rendered)
          })
          return
        }
      } catch {
        // Highlighter failure should not block the doc from rendering.
      }
    }

    html += renderCodeBlockShell({
      ...payload,
      codeHtml: escapeHtml(payload.code)
    })
  }

  for (const line of lines) {
    const codeFenceMatch = line.match(/^```([\w-]+)?/)
    if (codeFenceMatch) {
      if (!inCode) {
        flushParagraph()
        closeLists()
        inCode = true
        codeLang = codeFenceMatch[1] || ''
        codeLines = []
      } else {
        await flushCodeBlock()
        inCode = false
        codeLang = ''
        codeLines = []
      }
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      closeLists()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      closeLists()
      const level = headingMatch[1].length
      const headingText = headingMatch[2].trim()
      html += `<h${level} id="${escapeHtml(getHeadingId(headingText))}">${renderInlineMarkdown(headingText, options)}</h${level}>`
      continue
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      flushParagraph()
      if (inOrderedList) {
        html += '</ol>'
        inOrderedList = false
      }
      if (!inUnorderedList) {
        html += '<ul>'
        inUnorderedList = true
      }
      html += `<li>${renderInlineMarkdown(unorderedMatch[1], options)}</li>`
      continue
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (orderedMatch) {
      flushParagraph()
      if (inUnorderedList) {
        html += '</ul>'
        inUnorderedList = false
      }
      if (!inOrderedList) {
        html += '<ol>'
        inOrderedList = true
      }
      html += `<li>${renderInlineMarkdown(orderedMatch[1], options)}</li>`
      continue
    }

    const blockquoteMatch = line.match(/^>\s?(.+)$/)
    if (blockquoteMatch) {
      flushParagraph()
      closeLists()
      html += `<blockquote>${renderInlineMarkdown(blockquoteMatch[1], options)}</blockquote>`
      continue
    }

    paragraph.push(line.trim())
  }

  if (inCode) {
    await flushCodeBlock()
  }

  flushParagraph()
  closeLists()
  return html
}
