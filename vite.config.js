import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const createManualChunk = (id) => {
  if (!id.includes('node_modules')) return undefined

  if (
    id.includes('/element-plus/')
    || id.includes('/@element-plus/')
    || id.includes('/@popperjs/')
    || id.includes('/async-validator/')
    || id.includes('/dayjs/')
    || id.includes('/lodash-unified/')
    || id.includes('/memoize-one/')
    || id.includes('/normalize-wheel-es/')
  ) {
    return 'vendor-element-plus'
  }
  if (id.includes('highlight.js')) return 'vendor-highlight'
  if (id.includes('gsap')) return 'vendor-gsap'
  if (
    id.includes('socket.io-client')
    || id.includes('engine.io-client')
    || id.includes('socket.io-parser')
  ) {
    return 'vendor-realtime'
  }
  if (
    id.includes('/vue/')
    || id.includes('/@vue/')
    || id.includes('/@vueuse/')
    || id.includes('vue-router')
    || id.includes('pinia')
  ) {
    return 'vendor-vue'
  }

  return 'vendor'
}

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ['a-waves'].includes(tag)
        }
      }
    })
  ],
  server: {
    port: 8080,
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
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
