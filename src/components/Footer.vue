<template>
  <footer class="bg_footer pt-16 pb-8 transition-colors duration-300">
    <div class="container mx-auto px-4">
      <div
        class="flex flex-col md:flex-row md:items-center md:justify-between gap-8 pb-12"
      >
        <div class="footer-text-offset footer-cta-copy">
          <h2 class="footer-cta-title text-3xl md:text-4xl font-bold section-title">
            Get Started with DpccGaming
          </h2>
          <p class="text-lg section-text">
            免费开始收集和分享你的独立游戏
          </p>
        </div>

        <div ref="downloadPickerRef" class="download-picker-wrap">
          <button
            type="button"
            class="cta-button inline-flex items-center justify-center gap-3 font-semibold px-8 py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
            @click="toggleDownloadPicker"
          >
            <span>下载DPCC SWITCH</span>
            <span class="text-base leading-none">{{ isDownloadPickerOpen ? '↑' : '↓' }}</span>
          </button>

          <transition name="download-panel-fade">
            <div
              v-if="isDownloadPickerOpen"
              class="download-inline-panel"
              role="dialog"
              aria-modal="false"
              aria-labelledby="download-picker-title"
            >
              <div class="download-inline-head">
                <div>
                  <p class="download-inline-eyebrow">DPCC SWITCH</p>
                  <h3 id="download-picker-title" class="download-inline-title">下载版本</h3>
                </div>
                <span class="download-version-chip">3.13 (beta)</span>
              </div>

              <div class="download-inline-list">
                <a
                  :href="downloadTargets.windows"
                  class="download-inline-item"
                  @click="closeDownloadPicker"
                >
                  <span class="download-inline-icon">
                    <i class="fa-brands fa-windows" />
                  </span>
                  <span class="download-inline-meta">
                    <span class="download-inline-system">Windows</span>
                    <span class="download-inline-caption">3.13 (beta) Setup</span>
                  </span>
                  <span class="download-inline-arrow">↗</span>
                </a>

                <a
                  :href="downloadTargets.macos"
                  class="download-inline-item"
                  @click="closeDownloadPicker"
                >
                  <span class="download-inline-icon">
                    <i class="fa-brands fa-apple" />
                  </span>
                  <span class="download-inline-meta">
                    <span class="download-inline-system">macOS ARM</span>
                    <span class="download-inline-caption">3.13 (beta) DMG</span>
                  </span>
                  <span class="download-inline-arrow">↗</span>
                </a>

                <a
                  :href="downloadTargets.official"
                  class="download-inline-item"
                  @click="closeDownloadPicker"
                >
                  <span class="download-inline-icon">
                    <i class="fa-brands fa-github" />
                  </span>
                  <span class="download-inline-meta">
                    <span class="download-inline-system">官方版本</span>
                    <span class="download-inline-caption">GitHub Releases</span>
                  </span>
                  <span class="download-inline-arrow">↗</span>
                </a>
              </div>
            </div>
          </transition>
        </div>
      </div>

      <div class="border-t border-gray-800/20 pt-10">
        <div
          class="grid grid-cols-1 md:grid-cols-4 gap-10 pb-10 text-sm md:text-base"
        >
          <div class="footer-text-offset">
            <div class="flex items-center">
              <img
                :src="currentLogo"
                alt="DpccGaming Logo"
                class="w-8 h-8 mr-2"
              />
              <span class="footer-brand-title text-xl font-semibold section-title">
                DpccGaming
              </span>
            </div>
            <p class="footer-brand-description section-text max-w-xs">
              面向个人开发者的游戏收集与分发平台，在一个地方展示、分享和发现创意作品。
            </p>
          </div>

          <div class="footer-text-offset">
            <h3 class="font-semibold mb-3 section-subtitle">条款</h3>
            <ul class="space-y-2">
              <li>
                <a href="#" class="footer-link">服务条款</a>
              </li>
              <li>
                <a href="#" class="footer-link">隐私政策</a>
              </li>
              <li>
                <router-link to="/cookie-policy" class="footer-link">
                  <span>Cookie 政策</span>
                </router-link>
              </li>
            </ul>
          </div>

          <div class="footer-text-offset">
            <h3 class="font-semibold mb-3 section-subtitle">资源</h3>
            <ul class="space-y-2">
              <li>
                <router-link to="/aidocs" class="footer-link flex items-center gap-2">
                  <i class="fa-solid fa-book-open text-sm" />
                  <span>AiDocs 文档</span>
                </router-link>
              </li>
              <li>
                <router-link to="/blog" class="footer-link flex items-center gap-2">
                  <i class="fa-solid fa-timeline text-sm" />
                  <span>更新日志</span>
                </router-link>
              </li>
              <li>
                <a
                  href="https://github.com/DUNHKpcc/DpccGaming_V1.3"
                  class="footer-link flex items-center gap-2"
                >
                  <i class="fa-brands fa-github text-sm" />
                  <span>GitHub</span>
                </a>
              </li>
              <li>
                <a
                  href="https://api.dpccgaming.xyz"
                  class="footer-link flex items-center gap-2"
                >
                  <i class="fa-brands fa-github text-sm" />
                  <span>DPCC API</span>
                </a>
              </li>
            </ul>
          </div>

          <div class="footer-text-offset">
            <h3 class="font-semibold mb-3 section-subtitle">联系我们</h3>
            <ul class="space-y-2">
              <li class="section-text">
                <i class="fa-regular fa-message text-sm mr-2" />
                <span>反馈与建议：请通过官方渠道联系</span>
              </li>
              <li>
                <a href="#" class="footer-link flex items-center gap-2">
                  <i class="fa-brands fa-discord text-sm" />
                  <span>Discord</span>
                </a>
              </li>
              <li>
                <a
                  href="https://space.bilibili.com/397853169?spm_id_from=333.788.upinfo.head.click"
                  class="footer-link flex items-center gap-2"
                >
                  <img src="/SocialMediaLogo/bilibili.png" alt="Bilibili Logo" class="w-10 h-5" />
                  <span>哔哩哔哩</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          class="footer-bottom-row border-t border-gray-800/20 pt-6 flex flex-col items-center gap-4 text-xs md:text-sm section-text"
        >
          <div class="footer-copy space-y-1 text-center">
            <p>&copy; 2025 SunJiaHao. All rights reserved.</p>
            <p>
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
                class="footer-link inline-block"
              >
                闽ICP备2025115401号
              </a>
            </p>
          </div>

          <button
            type="button"
            class="footer-back-top footer-text-offset inline-flex items-center gap-2 section-text hover:opacity-80 transition-opacity duration-200"
            @click="scrollToTop"
          >
            <span>Back to top</span>
            <span class="text-base">↑</span>
          </button>
        </div>
      </div>
    </div>
  </footer>

</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useThemeStore } from '../stores/theme'

const themeStore = useThemeStore()
const currentLogo = computed(() => (themeStore.isDark ? '/logo.png' : '/logo_light.png'))
const downloadPickerRef = ref(null)
const isDownloadPickerOpen = ref(false)
const downloadBasePath = import.meta.env.VITE_DOWNLOAD_BASE_URL || 'https://dpccgaming.xyz/downloads/dpcc-switch'
const downloadTargets = {
  windows: `${downloadBasePath}/DPCC-SWITCH-3.13.0-release-setup.exe`,
  macos: `${downloadBasePath}/DPCC-SWITCH_3.13.0_aarch64.dmg`,
  official: 'https://github.com/farion1231/cc-switch/releases'
}

const closeDownloadPicker = () => {
  isDownloadPickerOpen.value = false
}

const handleEscapeKey = (event) => {
  if (event.key === 'Escape') {
    closeDownloadPicker()
  }
}

const handlePointerDown = (event) => {
  if (!downloadPickerRef.value?.contains(event.target)) {
    closeDownloadPicker()
  }
}

const toggleDownloadPicker = () => {
  isDownloadPickerOpen.value = !isDownloadPickerOpen.value
}

const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

watch(isDownloadPickerOpen, (isOpen) => {
  if (typeof window === 'undefined') return

  if (isOpen) {
    window.addEventListener('keydown', handleEscapeKey)
    window.addEventListener('pointerdown', handlePointerDown)
    return
  }

  window.removeEventListener('keydown', handleEscapeKey)
  window.removeEventListener('pointerdown', handlePointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscapeKey)
  window.removeEventListener('pointerdown', handlePointerDown)
})
</script>

<style scoped>
.bg_footer {
  background-color: #000000;
  color: #ffffff;
}

.footer-text-offset {
  transform: translateX(25px);
}

.footer-cta-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.footer-cta-title {
  margin: 0;
  padding: 0;
}

.footer-cta-copy .section-text {
  margin: 0;
}

.footer-bottom-row {
  position: relative;
}

.footer-copy {
  text-align: center;
}

.footer-brand-title {
  display: inline-block;
  margin: 0;
  margin-bottom: 0;
  padding: 0;
  line-height: 1;
}

.footer-brand-description {
  margin: 0;
  margin-top: 7px;
}

.section-title {
  color: #ffffff;
}

.section-subtitle {
  color: rgba(255, 255, 255, 0.9);
}

.section-text {
  color: rgba(255, 255, 255, 0.7);
}

.footer-link {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: color 0.2s ease;
}

.footer-link:hover {
  color: #ffffff;
}

.cta-button {
  background-color: #ffffff;
  color: #000000;
}

.cta-button:hover {
  background-color: rgba(255, 255, 255, 0.9);
}

.download-picker-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.download-inline-panel {
  position: absolute;
  top: calc(100% + 0.75rem);
  right: 0;
  z-index: 40;
  width: min(92vw, 340px);
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.06), transparent 45%),
    linear-gradient(180deg, #121212 0%, #080808 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.download-inline-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.download-inline-eyebrow {
  margin: 0 0 0.3rem;
  color: rgba(255, 255, 255, 0.56);
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.download-inline-title {
  margin: 0;
  color: #ffffff;
  font-size: 1rem;
  line-height: 1.2;
}

.download-version-chip {
  flex-shrink: 0;
  padding: 0.28rem 0.55rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.72rem;
  line-height: 1;
}

.download-inline-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.download-inline-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.025));
  color: #ffffff;
  text-decoration: none;
  transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.download-inline-item:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.28);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04));
}

.download-inline-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 1rem;
}

.download-inline-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.download-inline-system {
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
}

.download-inline-caption {
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.76rem;
  line-height: 1.35;
}

.download-inline-arrow {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
}

.download-panel-fade-enter-active,
.download-panel-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.download-panel-fade-enter-from,
.download-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (min-width: 768px) {
  .footer-bottom-row {
    min-height: 2.5rem;
  }

  .footer-back-top {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%) translateX(25px);
  }
}

@media (max-width: 767px) {
  .footer-text-offset {
    transform: none;
    text-align: center;
  }

  .footer-cta-copy {
    align-items: center;
    text-align: center;
  }

  .footer-text-offset > .flex {
    justify-content: center;
  }

  .footer-brand-description {
    margin-left: auto;
    margin-right: auto;
  }

  .footer-text-offset ul {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .footer-link.flex {
    justify-content: center;
  }

  .download-picker-wrap {
    width: 100%;
    align-items: center;
  }

  .cta-button {
    width: min(100%, 18rem);
  }

  .download-inline-panel {
    left: 0;
    right: auto;
    width: 100%;
  }
}

[data-theme="light"] .bg_footer {
  background-color: #ffffff;
  color: #000000;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

[data-theme="light"] .section-title {
  color: #000000;
}

[data-theme="light"] .section-subtitle {
  color: rgba(0, 0, 0, 0.8);
}

[data-theme="light"] .section-text {
  color: rgba(0, 0, 0, 0.6);
}

[data-theme="light"] .footer-link {
  color: rgba(0, 0, 0, 0.6);
}

[data-theme="light"] .footer-link:hover {
  color: #000000;
}

[data-theme="light"] .cta-button {
  background-color: #000000;
  color: #ffffff;
}

[data-theme="light"] .cta-button:hover {
  background-color: rgba(0, 0, 0, 0.85);
}

[data-theme="light"] .download-inline-panel {
  border-color: rgba(0, 0, 0, 0.1);
  background:
    radial-gradient(circle at top left, rgba(0, 0, 0, 0.03), transparent 42%),
    linear-gradient(180deg, #ffffff 0%, #f3f3f3 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.14);
}

[data-theme="light"] .download-inline-icon,
[data-theme="light"] .download-version-chip {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.04);
  color: #000000;
}

[data-theme="light"] .download-inline-eyebrow,
[data-theme="light"] .download-inline-caption,
[data-theme="light"] .download-version-chip,
[data-theme="light"] .download-inline-arrow {
  color: rgba(0, 0, 0, 0.62);
}

[data-theme="light"] .download-inline-title,
[data-theme="light"] .download-inline-system,
[data-theme="light"] .download-inline-item {
  color: #000000;
}

[data-theme="light"] .download-inline-item {
  border-color: rgba(0, 0, 0, 0.1);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.015));
}

[data-theme="light"] .download-inline-item:hover {
  border-color: rgba(0, 0, 0, 0.18);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.02));
}
</style>
