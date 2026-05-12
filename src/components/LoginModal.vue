<template>
  <div
    v-if="isOpen"
    class="login-modal-mask"
    @click="handleBackdropClick"
  >
    <div class="login-modal-shell" @click.stop>
      <section class="login-panel-left">
        <div class="login-panel-inner">
          <div class="login-brand-row">
            <img src="/logo_light.png" alt="DpccGaming" class="login-brand-icon" />
            <h2>登陆</h2>
          </div>

          <p class="login-welcome">Welcome DpccGaming</p>
          <h1 class="login-title">Log In</h1>

          <form class="login-form" @submit.prevent="handleLogin">
            <label class="login-label">用户名</label>
            <input
              v-model="username"
              type="text"
              class="login-input"
              placeholder="输入你的用户名"
              required
            >

            <div class="login-password-row">
              <label class="login-label">密码</label>
              <button type="button" class="forgot-btn">忘记密码？</button>
            </div>
            <div class="password-input-wrap">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="login-input"
                placeholder="*************"
                required
              >
              <button
                type="button"
                class="password-ghost-btn"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="togglePasswordVisibility"
              >
                <i :class="showPassword ? 'fa fa-eye' : 'fa fa-eye-slash'"></i>
              </button>
            </div>

            <button type="submit" class="login-submit-btn">
              <span>LOGin</span>
              <i class="fa fa-long-arrow-right"></i>
            </button>

            <p class="login-alt-title">或者通过以下选项</p>

            <div class="oauth-login-row">
              <button
                type="button"
                title="Google登录"
                @click="handleGoogleLoginPlaceholder"
                class="oauth-pill-btn"
              >
                <img src="/Ai/Google.png" alt="Google" class="oauth-logo-img" />
              </button>

              <button
                type="button"
                title="GitHub登录"
                @click="handleGithubLoginPlaceholder"
                class="oauth-pill-btn"
              >
                <i class="fa-brands fa-github oauth-font-icon"></i>
              </button>

              <button
                type="button"
                title="微信登录"
                @click="handleWeChatLoginPlaceholder"
                class="oauth-pill-btn"
              >
                <img src="/Ai/WeChat.png" alt="WeChat" class="oauth-logo-img" />
              </button>
            </div>

            <p class="login-register-row">
              还没有账户？
              <button type="button" @click="switchToRegister" class="register-link">免费注册</button>
            </p>
          </form>
        </div>
      </section>

      <section class="login-panel-right" aria-hidden="true"></section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useModalStore } from '../stores/modal'
import { useAuthStore } from '../stores/auth'
import { useNotificationStore } from '../stores/notification'
import { API_BASE_URL } from '../utils/api'

const modalStore = useModalStore()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const isOpen = computed(() => modalStore.activeModal === 'login')
const username = ref('')
const password = ref('')
const showPassword = ref(false)

const handleLogin = async () => {
  const result = await authStore.login(username.value, password.value)

  if (result.success) {
    modalStore.closeModal()
    notificationStore.success('登录成功', result.message)
  } else {
    notificationStore.error('登录失败', result.message)
  }
}

const switchToRegister = () => {
  modalStore.closeModal()
  setTimeout(() => {
    modalStore.openModal('register')
  }, 300)
}

const handleBackdropClick = (event) => {
  if (event.target === event.currentTarget) {
    modalStore.closeModal()
  }
}

const handleWeChatLoginPlaceholder = () => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const startUrl = new URL(`${API_BASE_URL}/auth/wechat/start`, window.location.origin)
  startUrl.searchParams.set('returnTo', currentPath || '/')
  window.location.href = startUrl.toString()
}

const handleGoogleLoginPlaceholder = () => {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  const startUrl = new URL(`${API_BASE_URL}/auth/google/start`, window.location.origin)
  startUrl.searchParams.set('returnTo', currentPath || '/')
  window.location.href = startUrl.toString()
}

const handleGithubLoginPlaceholder = () => {
  notificationStore.info('功能开发中', 'GitHub 登录即将上线')
}

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value
}
</script>

<style scoped>
.login-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(2px);
}

.login-modal-shell {
  width: min(1050px, 94vw);
  height: min(650px, 86vh);
  border-radius: 26px;
  overflow: hidden;
  background: #f1f1f1;
  display: flex;
  position: relative;
  isolation: isolate;
  z-index: 1;
}

.login-panel-left {
  width: 57%;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.login-panel-inner {
  width: min(360px, calc(100% - 48px));
  padding-top: 20px;
  color: #111111;
  transform: translate(-16px, 10px);
}

.login-brand-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.login-brand-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: grayscale(1) contrast(3);
}

.login-brand-row h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.login-welcome {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 1.35;
  color: #1e1e1e;
}

.login-title {
  margin: 12px 0 0;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #050505;
}

.login-form {
  margin-top: 20px;
}

.login-label {
  display: block;
  font-size: 10px;
  line-height: 1.25;
  color: #2a2a2a;
  margin-bottom: 4px;
}

.login-input {
  width: 100%;
  height: 41px;
  border-radius: 8px;
  border: none;
  background: #d3d3d5;
  color: #111111;
  font-size: 15px;
  line-height: 1.2;
  padding: 0 13px;
  outline: none;
}

.login-input::placeholder {
  color: #242424;
  opacity: 0.95;
}

.login-password-row {
  margin-top: 9px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.forgot-btn {
  border: none;
  background: transparent;
  color: #9f9f9f;
  font-size: 13px;
  line-height: 1.1;
  padding: 0;
  cursor: pointer;
}

.password-input-wrap {
  position: relative;
}

.password-input-wrap .login-input {
  padding-right: 37px;
}

.password-ghost-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #b3b3b3;
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}

.login-submit-btn {
  margin: 15px auto 0;
  width: 121px;
  height: 37px;
  border-radius: 999px;
  border: none;
  background: #050505;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, background-color 0.18s ease;
}

.login-submit-btn:hover {
  background: #1a1a1a;
  transform: translateY(-1px);
}

.login-submit-btn:active {
  transform: scale(0.97);
}

.login-alt-title {
  margin: 50px 0 0;
  text-align: center;
  font-size: 13px;
  color: #232323;
}

.oauth-login-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.oauth-pill-btn {
  height: 37px;
  border-radius: 999px;
  border: 1px solid #2c2c2c;
  background: transparent;
  color: #111111;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease;
}

.oauth-pill-btn:hover {
  background: #ececec;
  transform: translateY(-1px);
}

.oauth-pill-btn:active {
  transform: scale(0.97);
}

.oauth-logo-img {
  width: 17px;
  height: 17px;
  object-fit: contain;
  display: block;
}

.oauth-font-icon {
  font-size: 17px;
}

.login-register-row {
  margin: 10px 0 0;
  text-align: center;
  font-size: 13px;
  color: #8f8f8f;
}

.register-link {
  border: none;
  background: transparent;
  padding: 0;
  color: #111111;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.16s ease;
}

.register-link:hover {
  opacity: 0.72;
}

.login-panel-right {
  width: 43%;
  min-width: 0;
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  z-index: 3;
  background-color: #12163d;
  pointer-events: none;
}

.login-panel-right::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: calc(100% + clamp(120px, 10vw, 180px));
  height: 100%;
  z-index: 1;
  background-image: url('/Ai/LoginBackground.webp');
  background-repeat: no-repeat;
  background-position: 96% center;
  transform: scale(1.05);
  transform-origin: center right;
  background-size: cover;
  pointer-events: none;
}

@media (max-width: 1200px) {
  .login-panel-right {
    width: 40%;
  }

  .login-panel-left {
    width: 60%;
  }
}

@media (max-width: 980px) {
  .login-modal-shell {
    width: min(560px, 96vw);
    height: min(500px, 94vh);
    border-radius: 16px;
  }

  .login-panel-right {
    display: none;
  }

  .login-panel-left {
    width: 100%;
    align-items: flex-start;
    overflow: auto;
  }

  .login-panel-inner {
    width: min(420px, 100%);
    padding: 24px 18px 20px;
    transform: translate(-8px, 6px);
  }

  .login-brand-row h2 {
    font-size: 20px;
  }

  .login-brand-icon {
    width: 14px;
    height: 14px;
  }

  .login-welcome {
    margin-top: 8px;
    font-size: 13px;
  }

  .login-title {
    margin-top: 6px;
    font-size: 26px;
  }

  .login-label {
    font-size: 14px;
  }

  .login-input {
    height: 40px;
    font-size: 14px;
  }

  .forgot-btn {
    font-size: 12px;
  }

  .password-ghost-btn {
    font-size: 12px;
  }

  .login-submit-btn {
    width: 108px;
    height: 34px;
    margin-top: 14px;
    font-size: 13px;
  }

  .login-alt-title {
    margin-top: 12px;
    font-size: 12px;
  }

  .oauth-login-row {
    margin-top: 10px;
    gap: 6px;
  }

  .oauth-pill-btn {
    height: 34px;
  }

  .oauth-logo-img {
    width: 16px;
    height: 16px;
  }

  .oauth-font-icon {
    font-size: 16px;
  }

  .login-register-row {
    margin-top: 10px;
    font-size: 12px;
  }

  .register-link {
    font-size: 12px;
  }
}
</style>
