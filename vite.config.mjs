import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ElementPlus from 'unplugin-element-plus/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import fs from 'fs'
import path from 'path'

const createManualChunk = (id) => {
  const normalizedId = id.replaceAll('\\', '/')
  if (!normalizedId.includes('node_modules')) return undefined

  if (
    normalizedId.includes('/element-plus/')
    || normalizedId.includes('/@element-plus/')
    || normalizedId.includes('/@popperjs/')
    || normalizedId.includes('/dayjs/')
    || normalizedId.includes('/lodash-unified/')
    || normalizedId.includes('/memoize-one/')
    || normalizedId.includes('/normalize-wheel-es/')
  ) {
    return 'vendor-element-plus'
  }
  if (normalizedId.includes('highlight.js')) return 'vendor-highlight'
  if (normalizedId.includes('gsap')) return 'vendor-gsap'
  if (
    normalizedId.includes('socket.io-client')
    || normalizedId.includes('engine.io-client')
    || normalizedId.includes('socket.io-parser')
  ) {
    return 'vendor-realtime'
  }
  if (
    normalizedId.includes('/vue/')
    || normalizedId.includes('/@vue/')
    || normalizedId.includes('/@vueuse/')
    || normalizedId.includes('vue-router')
    || normalizedId.includes('pinia')
  ) {
    return 'vendor-vue'
  }

  return 'vendor'
}

const removeLegacyContentPublicDirs = () => ({
  name: 'remove-legacy-content-public-dirs',
  closeBundle() {
    const legacyDirs = ['Blog', 'doc-files', 'doc-covers', 'docsPhoto']
    legacyDirs.forEach((dirName) => {
      fs.rmSync(path.resolve('dist', dirName), { recursive: true, force: true })
    })
  }
})

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['a-waves'].includes(tag)
        }
      }
    }),
    Components({
      resolvers: [
        ElementPlusResolver({
          importStyle: 'css'
        })
      ]
    }),
    ElementPlus(),
    removeLegacyContentPublicDirs()
  ],
  server: {
    port: 8080,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: createManualChunk
      }
    }
  },
  base: '/',  // 避免深层路由刷新时资源路径错误（如 /coding/:id）
  publicDir: 'public',  // 指定public目录
  assetsInclude: ['**/*.mp4', '**/*.webm', '**/*.jpg', '**/*.png', '**/*.jpeg']  // 包含视频和图片资源
})
