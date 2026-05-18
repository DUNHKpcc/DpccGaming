<template>
  <transition name="cookie-slide">
    <section
      v-if="cookieStore.bannerVisible"
      class="fixed inset-0 z-[99999] flex items-center justify-center px-4 pointer-events-none"
      aria-live="polite"
    >
      <div class="max-w-4xl w-full rounded-2xl shadow-2xl p-6 cookie-surface pointer-events-auto">
        <div class="flex items-start gap-4">
          <div class="flex-1 space-y-2">
            <p class="text-sm uppercase tracking-wide font-semibold cookie-text-muted">Cookie 提示</p>
            <h3 class="text-2xl font-semibold">我们重视您的隐私</h3>
            <p class="text-base leading-relaxed cookie-text-muted">
              我们会借助必要的 Cookie 保障站点正常运作，并可能使用分析类 Cookie 优化体验。
              您可以随时在
              <RouterLink
                to="/cookie-policy"
                class="underline decoration-dotted cookie-link"
              >
                Cookie 政策
              </RouterLink>
              中了解详情或更改偏好。
            </p>
          </div>
          <button
            class="cookie-close focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full p-2"
            type="button"
            :disabled="!cookieStore.consentStatus"
            :aria-label="cookieStore.consentStatus ? '关闭弹窗' : '请选择您的 Cookie 偏好'"
            @click="cookieStore.consentStatus ? cookieStore.closeBanner() : cookieStore.openPreferences()"
          >
            <i class="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        <div v-if="cookieStore.showPreferences" class="mt-6 grid gap-4 border rounded-xl p-4 cookie-panel">
          <div
            v-for="field in preferenceFields"
            :key="field.key"
            class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p class="font-semibold">{{ field.label }}</p>
              <p class="text-sm cookie-text-muted">{{ field.description }}</p>
            </div>
            <label class="inline-flex items-center gap-3 text-sm">
              <span class="cookie-text-muted" v-if="field.locked">始终启用</span>
              <input
                type="checkbox"
                class="toggle-checkbox cookie-toggle"
                :disabled="field.locked"
                :checked="localPreferences[field.key]"
                @change="onPreferenceChange(field.key, $event.target.checked)"
              >
            </label>
          </div>
        </div>

        <p v-if="cookieStore.error" class="mt-4 text-sm text-red-300">
          {{ cookieStore.error }}
        </p>

        <div class="mt-6 flex flex-wrap gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-lg border text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cookie-outline-btn"
            type="button"
            @click="cookieStore.openPreferences()"
          >
            管理偏好
          </button>
          <button
            class="px-4 py-2 rounded-lg border text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cookie-secondary-btn"
            type="button"
            :disabled="cookieStore.loading"
            @click="handleReject"
          >
            仅保留必要
          </button>
          <button
            class="px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cookie-primary-btn"
            type="button"
            :disabled="cookieStore.loading"
            @click="handleAccept"
          >
            接受全部
          </button>
          <button
            v-if="cookieStore.showPreferences"
            class="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            :disabled="cookieStore.loading"
            @click="handleSavePreferences"
          >
            保存偏好
          </button>
        </div>
      </div>
    </section>
  </transition>
</template>

<script setup>
import { onMounted, reactive, watch } from 'vue'
import { useCookieStore } from '../stores/cookie'

const cookieStore = useCookieStore()
const localPreferences = reactive({
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false
})

const preferenceFields = [
  {
    key: 'necessary',
    label: '必要 Cookie',
    description: '用于基础安全、登录状态与上传流程，无法关闭。',
    locked: true
  },
  {
    key: 'functional',
    label: '功能 Cookie',
    description: '记住您的主题、语言等个性化设置。',
    locked: false
  },
  {
    key: 'analytics',
    label: '分析 Cookie',
    description: '帮助我们了解站点访问情况和体验问题。',
    locked: false
  },
  {
    key: 'marketing',
    label: '营销 Cookie',
    description: '用于个性化推荐与推广内容。',
    locked: false
  }
]

const onPreferenceChange = (key, value) => {
  if (key === 'necessary') {
    localPreferences.necessary = true
    return
  }
  localPreferences[key] = value
}

onMounted(() => {
  cookieStore.init()
  Object.assign(localPreferences, cookieStore.preferences)
})

watch(
  () => cookieStore.preferences,
  (value) => {
    Object.assign(localPreferences, value)
  },
  { deep: true }
)

const handleAccept = async () => {
  await cookieStore.acceptAll()
}

const handleReject = async () => {
  await cookieStore.rejectOptional()
}

const handleSavePreferences = async () => {
  await cookieStore.saveCustom({ ...localPreferences })
}
</script>

<style scoped>
.cookie-surface {
  background: rgba(29, 29, 31, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

:deep(html[data-theme="light"]) .cookie-surface {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.08);
  color: #1d1d1f;
}

.cookie-text-muted {
  color: rgba(255, 255, 255, 0.7);
}

:deep(html[data-theme="light"]) .cookie-text-muted {
  color: rgba(29, 29, 31, 0.65);
}

.cookie-link {
  color: inherit;
}

:deep(html[data-theme="light"]) .cookie-link:hover {
  color: #111827;
}

.cookie-panel {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
}

:deep(html[data-theme="light"]) .cookie-panel {
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(0, 0, 0, 0.04);
}

.cookie-close {
  color: rgba(255, 255, 255, 0.7);
}

.cookie-close:hover {
  color: #ffffff;
}

:deep(html[data-theme="light"]) .cookie-close {
  color: rgba(29, 29, 31, 0.6);
}

:deep(html[data-theme="light"]) .cookie-close:hover {
  color: #111827;
}

.cookie-secondary-btn,
.cookie-outline-btn {
  border-color: rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.9);
}

:deep(html[data-theme="light"]) .cookie-secondary-btn,
:deep(html[data-theme="light"]) .cookie-outline-btn {
  border-color: rgba(0, 0, 0, 0.15);
  color: #1d1d1f;
}

.cookie-primary-btn {
  background: #ffffff;
  color: #1d1d1f;
}

:deep(html[data-theme="light"]) .cookie-primary-btn {
  background: #111827;
  color: #ffffff;
}

.cookie-toggle {
  border: 1px solid rgba(255, 255, 255, 0.4);
  background-color: rgba(255, 255, 255, 0.15);
}

:deep(html[data-theme="light"]) .cookie-toggle {
  border-color: rgba(0, 0, 0, 0.2);
  background-color: rgba(0, 0, 0, 0.05);
}

:deep(html[data-theme="light"]) .cookie-toggle:checked {
  background-color: #111827;
  border-color: #111827;
}

.cookie-slide-enter-active,
.cookie-slide-leave-active {
  transition: all 0.4s ease;
}
.cookie-slide-enter-from,
.cookie-slide-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.toggle-checkbox {
  width: 2.75rem;
  height: 1.5rem;
  border-radius: 999px;
  appearance: none;
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.toggle-checkbox::after {
  content: '';
  position: absolute;
  top: 0.1rem;
  left: 0.15rem;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 999px;
  background: white;
  transition: transform 0.2s ease;
}

.toggle-checkbox:checked::after {
  transform: translateX(1.25rem);
}

.toggle-checkbox:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
